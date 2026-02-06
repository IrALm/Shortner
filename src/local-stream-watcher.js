import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBStreamsClient,
  DescribeStreamCommand,
  GetShardIteratorCommand,
  GetRecordsCommand,
  ListStreamsCommand
} from "@aws-sdk/client-dynamodb-streams";

// Configuration
const REGION = "eu-west-1";
const ENDPOINT = "http://localhost:8000";

// Force env vars for handlers
process.env.AWS_SAM_LOCAL = "true";
process.env.DOCKER_ENV = "false"; // 🔥 IMPORTANT : indique qu’on n’est PAS dans Docker
process.env.TABLE_URLS = "urls";
process.env.TABLE_CLICK_EVENTS = "click_events";
process.env.TABLE_DAILY_STATS = "daily_stats";
process.env.FAVICONS_BUCKET = "favicons";
process.env.DYNAMODB_ENDPOINT = ENDPOINT;
process.env.AWS_REGION = REGION;

// Clients
const clientConfig = {
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: "fake", secretAccessKey: "fake" }
};

const dynamoClient = new DynamoDBClient(clientConfig);
const streamsClient = new DynamoDBStreamsClient(clientConfig);

// State to track shard iterators
const state = {
  urls: { streamArn: null, shardId: null, iterator: null },
  click_events: { streamArn: null, shardId: null, iterator: null }
};

// Utility: sleep
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function getLatestStreamArn(tableName) {
  try {
    const command = new ListStreamsCommand({ TableName: tableName });
    const response = await streamsClient.send(command);
    return response.Streams?.length ? response.Streams[0].StreamArn : null;
  } catch (e) {
    console.warn(`[Watcher] Could not list streams for ${tableName}: ${e.message}`);
    return null;
  }
}

async function initStream(tableName, handlerName) {
  console.log(`[${handlerName}] Initializing stream watcher for ${tableName}...`);

  const streamArn = await getLatestStreamArn(tableName);
  if (!streamArn) {
    console.log(`[${handlerName}] No stream found for ${tableName}. Waiting...`);
    return false;
  }

  const describe = await streamsClient.send(
    new DescribeStreamCommand({ StreamArn: streamArn })
  );

  const shards = describe.StreamDescription.Shards;
  if (!shards || shards.length === 0) return false;

  const shardId = shards[shards.length - 1].ShardId;

  const iteratorCmd = new GetShardIteratorCommand({
    StreamArn: streamArn,
    ShardId: shardId,
    ShardIteratorType: "LATEST"
  });

  const iteratorRes = await streamsClient.send(iteratorCmd);

  state[tableName] = {
    streamArn,
    shardId,
    iterator: iteratorRes.ShardIterator
  };

  console.log(`[${handlerName}] Listening on shard ${shardId}`);
  return true;
}

async function resetIterator(tableName, handlerName) {
  const s = state[tableName];

  console.warn(`[${handlerName}] Resetting shard iterator (TRIM_HORIZON)`);

  const iteratorCmd = new GetShardIteratorCommand({
    StreamArn: s.streamArn,
    ShardId: s.shardId,
    ShardIteratorType: "TRIM_HORIZON"
  });

  const iteratorRes = await streamsClient.send(iteratorCmd);
  s.iterator = iteratorRes.ShardIterator;

  await wait(1000);
}

async function poll(tableName, handlerFunc, handlerName) {
  const s = state[tableName];

  if (!s || !s.iterator) {
    await initStream(tableName, handlerName);
    return;
  }

  try {
    const recordsRes = await streamsClient.send(
      new GetRecordsCommand({ ShardIterator: s.iterator })
    );

    if (recordsRes.NextShardIterator) {
      s.iterator = recordsRes.NextShardIterator;
    } else {
      console.warn(`[${handlerName}] Shard closed, reinitializing...`);
      s.iterator = null;
      return;
    }

    if (recordsRes.Records && recordsRes.Records.length > 0) {
      console.log(`[${handlerName}] Received ${recordsRes.Records.length} records`);

      const event = {
        Records: recordsRes.Records.map((r) => ({
          eventID: r.eventID,
          eventName: r.eventName,
          dynamodb: r.dynamodb,
          eventSource: "aws:dynamodb",
          awsRegion: REGION
        }))
      };

      try {
        await handlerFunc(event);
      } catch (err) {
        console.error(`[${handlerName}] Handler error:`, err);
      }
    }
  } catch (err) {
    const msg = err.message || "";

    if (msg.includes("read past the oldest stream record")) {
      await resetIterator(tableName, handlerName);
      return;
    }

    if (err.name === "ExpiredIteratorException") {
      console.warn(`[${handlerName}] Iterator expired, refreshing...`);
      s.iterator = null;
      return;
    }

    console.warn(`[${handlerName}] Polling error:`, err.message);
    await wait(1000);
  }
}

async function main() {
  console.log("🚀 Starting Local Stream Watcher...");
  console.log("Press Ctrl+C to stop.");

  const { handler: fetchFavicon } = await import("./handlers/fetch-favicon.js");
  const { handler: statsProcessor } = await import("./handlers/stats-processor.js");

  setInterval(() => poll("urls", fetchFavicon, "FETCH-FAVICON"), 2000);
  setInterval(() => poll("click_events", statsProcessor, "STATS-PROCESSOR"), 2000);
}

main();