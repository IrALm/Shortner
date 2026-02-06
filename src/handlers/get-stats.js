/**
 * Lambda : GET /stats/{shortKey}
 * -------------------------------
 * Récupère les statistiques journalières pour une URL courte
 */

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { initDynamo } from "../lib/dynamodb.js";

// Nom de la table DynamoDB
const TABLE_DAILY_STATS = process.env.TABLE_DAILY_STATS;

export const handler = async (event) => {
  // ⚡ Initialisation DynamoDB (tables créées si nécessaire)
  const dynamoDb = await initDynamo();

  /* ================================
   * 1. Récupérer et valider le shortKey
   * ================================ */
  const shortKey = event.pathParameters?.shortKey;

  if (!shortKey) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "shortKey is required" }),
    };
  }

  /* ================================
   * 2. Interroger DynamoDB avec QueryCommand
   * ================================ */
  try {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_DAILY_STATS,
        KeyConditionExpression: "shortKey = :sk",
        ExpressionAttributeValues: {
          ":sk": shortKey,
        },
        ScanIndexForward: false, // Trier par statDate décroissante
        Limit: 30,               // Limiter à 30 résultats
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shortKey,
        stats: result.Items || [],
      }),
    };
  } catch (error) {
    console.error("Erreur GET /stats:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
