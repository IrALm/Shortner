/**
 * Lambda : stats-processor
 * ------------------------
 * Traite les événements INSERT de la table click_events
 * et met à jour les statistiques journalières dans daily_stats.
 * Si on est en local, on scan click_events pour traiter tous les clics existants.
 */

import { UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { initDynamo } from "../lib/dynamodb.js";

// Tables
const TABLE_CLICK_EVENTS = process.env.TABLE_CLICK_EVENTS;
const TABLE_DAILY_STATS = process.env.TABLE_DAILY_STATS;

// Convertit un timestamp en date YYYY-MM-DD
function getStatDate(timestamp) {
  const date = new Date(Number(timestamp));
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Détecter si on est en local (SAM CLI)
const isLocal = process.env.AWS_SAM_LOCAL === "true";

export const handler = async (event) => {
  // ⚡ Initialisation DynamoDB
  const dynamoDb = await initDynamo();

  let records = event?.Records || [];

  // ===== En local, on force le scan de click_events =====
  if (isLocal) {
    console.log("[STAT-PROCESSOR] Mode local : scan click_events");
    const scanResult = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_CLICK_EVENTS })
    );

    records = (scanResult.Items || []).map((item) => ({
      eventName: "INSERT",
      dynamodb: {
        NewImage: {
          shortKey: { S: item.shortKey },
          clickedAt: { N: String(item.clickedAt) },
        },
      },
    }));
  }

  if (records.length === 0) {
    console.log("[STAT-PROCESSOR] Aucun record à traiter");
    return;
  }

  console.log(`[STAT-PROCESSOR] Traitement de ${records.length} records`);

  const promises = records.map(async (record) => {
    if (record.eventName !== "INSERT") return;

    try {
      const newImage = record.dynamodb.NewImage;
      const shortKey = newImage.shortKey.S;
      const clickedAt = Number(newImage.clickedAt.N);
      const statDate = getStatDate(clickedAt);
      const now = Date.now();

      // Update ou create dans daily_stats
      await dynamoDb.send(
        new UpdateCommand({
          TableName: TABLE_DAILY_STATS,
          Key: { shortKey, statDate },
          UpdateExpression:
            "SET totalClicks = if_not_exists(totalClicks, :zero) + :inc, updatedAt = :now",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":inc": 1,
            ":now": now,
          },
        })
      );
    } catch (error) {
      console.error("Erreur traitement record:", error);
      throw error;
    }
  });

  await Promise.allSettled(promises);

  console.log("[STAT-PROCESSOR] Traitement terminé ✅");
};
