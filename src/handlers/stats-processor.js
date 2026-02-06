import { UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { initDynamo } from "../lib/dynamodb.js";

const TABLE_CLICK_EVENTS = process.env.TABLE_CLICK_EVENTS;
const TABLE_DAILY_STATS = process.env.TABLE_DAILY_STATS;

const isLocal = process.env.AWS_SAM_LOCAL === "true";

// Convertit un timestamp en date YYYY-MM-DD
function getStatDate(timestamp) {
  const date = new Date(Number(timestamp));
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const handler = async (event) => {
  console.log("[STAT-PROCESSOR] start");

  const dynamoDb = await initDynamo();

  let records = [];

  // =========================
  // ✅ MODE LOCAL : SCAN ONLY
  // =========================
  if (isLocal) {
    console.log("[STAT-PROCESSOR] Local mode → scan click_events");

    const scanResult = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_CLICK_EVENTS })
    );

    records = (scanResult.Items || []).map((item) => ({
      shortKey: item.shortKey,
      clickedAt: item.clickedAt,
    }));
  }

  // =========================
  // ✅ MODE PROD : STREAM
  // =========================
  else {
    records = (event?.Records || [])
      .filter((r) => r.eventName === "INSERT")
      .map((r) => ({
        shortKey: r.dynamodb.NewImage.shortKey.S,
        clickedAt: Number(r.dynamodb.NewImage.clickedAt.N),
      }));
  }

  if (records.length === 0) {
    console.log("[STAT-PROCESSOR] No records to process");
    return;
  }

  console.log(`[STAT-PROCESSOR] Processing ${records.length} records`);

  const updates = records.map(async ({ shortKey, clickedAt }) => {
    const statDate = getStatDate(clickedAt);

    await dynamoDb.send(
      new UpdateCommand({
        TableName: TABLE_DAILY_STATS,
        Key: { shortKey, statDate },
        UpdateExpression:
          "SET totalClicks = if_not_exists(totalClicks, :zero) + :inc, updatedAt = :now",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":inc": 1,
          ":now": Date.now(),
        },
      })
    );
  });

  await Promise.all(updates);

  console.log("[STAT-PROCESSOR] Done ✅");
};
