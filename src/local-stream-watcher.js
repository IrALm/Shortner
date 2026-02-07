import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBStreamsClient,
  DescribeStreamCommand,
  GetShardIteratorCommand,
  GetRecordsCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-dynamodb-streams";

/**
 * ======================================================
 * Configuration environnement
 * ======================================================
 */
const REGION = process.env.AWS_REGION || "eu-west-1";
const DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT || "http://url-shortener-dynamodb:8000";
const STREAMS_ENABLED = process.env.ENABLE_DDB_STREAMS === "true";

console.log(`[Watcher] Using DynamoDB Endpoint: ${DYNAMODB_ENDPOINT}`);

// Tables
const TABLE_URLS = process.env.TABLE_URLS || "urls";
const TABLE_CLICK_EVENTS = process.env.TABLE_CLICK_EVENTS || "click_events";

/**
 * ======================================================
 * Clients AWS (DynamoDB + Streams)
 * ======================================================
 */
const clientConfig = {
  region: REGION,
  endpoint: DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy",
  },
};

const dynamoClient = new DynamoDBClient(clientConfig);
const streamsClient = new DynamoDBStreamsClient(clientConfig);

/**
 * ======================================================
 * État interne des streams
 * ======================================================
 */
const state = {
  urls: { streamArn: null, shardId: null, iterator: null },
  click_events: { streamArn: null, shardId: null, iterator: null },
};

/**
 * ======================================================
 * Utils
 * ======================================================
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const describe = await streamsClient.send(new DescribeStreamCommand({ StreamArn: streamArn }));
  const shards = describe.StreamDescription?.Shards || [];
  if (shards.length === 0) return false;

  const shardId = shards[shards.length - 1].ShardId;
  const iteratorCmd = new GetShardIteratorCommand({
    StreamArn: streamArn,
    ShardId: shardId,
    ShardIteratorType: "LATEST",
  });
  const iteratorRes = await streamsClient.send(iteratorCmd);

  state[tableName] = { streamArn, shardId, iterator: iteratorRes.ShardIterator };
  console.log(`[${handlerName}] Listening on shard ${shardId}`);
  return true;
}

async function resetIterator(tableName, handlerName) {
  const s = state[tableName];
  if (!s.streamArn || !s.shardId) return;

  console.warn(`[${handlerName}] Resetting shard iterator (TRIM_HORIZON)`);
  const iteratorCmd = new GetShardIteratorCommand({
    StreamArn: s.streamArn,
    ShardId: s.shardId,
    ShardIteratorType: "TRIM_HORIZON",
  });
  const iteratorRes = await streamsClient.send(iteratorCmd);
  s.iterator = iteratorRes.ShardIterator;

  await wait(1000);
}

async function scanTable(tableName, handlerFunc, handlerName) {
  try {
    const data = await dynamoClient.send(new ScanCommand({ TableName: tableName }));
    if (data.Items?.length) {
      console.log(`[${handlerName}] Scan found ${data.Items.length} items`);
      const event = {
        Records: data.Items.map((item) => ({
          eventID: item.shortKey?.S || item.eventId?.S || Math.random().toString(),
          eventName: "MODIFY",
          dynamodb: { NewImage: item },
          eventSource: "aws:dynamodb",
          awsRegion: REGION,
        })),
      };
      await handlerFunc(event);
    }
  } catch (err) {
    console.error(`[${handlerName}] Scan error:`, err.message);
  }
}

/**
 * ======================================================
 * Polling Streams ou Scan fallback
 * ======================================================
 */
async function poll(tableName, handlerFunc, handlerName) {
  if (!STREAMS_ENABLED) {
    await scanTable(tableName, handlerFunc, handlerName);
    await wait(3000);
    return;
  }

  const s = state[tableName];
  if (!s || !s.iterator) {
    await initStream(tableName, handlerName);
    return;
  }

  try {
    const recordsRes = await streamsClient.send(new GetRecordsCommand({ ShardIterator: s.iterator }));
    if (recordsRes.NextShardIterator) s.iterator = recordsRes.NextShardIterator;
    else { s.iterator = null; return; }

    if (recordsRes.Records?.length) {
      console.log(`[${handlerName}] Received ${recordsRes.Records.length} records`);
      const event = {
        Records: recordsRes.Records.map((r) => ({
          eventID: r.eventID,
          eventName: r.eventName,
          dynamodb: r.dynamodb,
          eventSource: "aws:dynamodb",
          awsRegion: REGION,
        }))
      };
      await handlerFunc(event);
    }
  } catch (err) {
    const msg = err?.message || "";
    if (msg.includes("read past the oldest stream record")) { await resetIterator(tableName, handlerName); return; }
    if (err.name === "ExpiredIteratorException") { s.iterator = null; return; }
    console.warn(`[${handlerName}] Polling error: ${msg}`);
    await wait(1000);
  }
}

/**
 * ======================================================
 * Main
 * ======================================================
 */
async function main() {
  console.log("🚀 Local Stream Watcher started");
  console.log("STREAMS_ENABLED =", STREAMS_ENABLED);

  const { handler: fetchFavicon } = await import("./handlers/fetch-favicon.js");
  const { handler: statsProcessor } = await import("./handlers/stats-processor.js");

  setInterval(() => poll(TABLE_URLS, fetchFavicon, "FETCH-FAVICON"), 2000);
  setInterval(() => poll(TABLE_CLICK_EVENTS, statsProcessor, "STATS-PROCESSOR"), 2000);
}

main();
