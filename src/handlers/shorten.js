/**
 * Lambda : POST /shorten
 * ---------------------
 * Crée une URL courte à partir d’une URL longue
 */

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { initDynamo } from "../lib/dynamodb.js";

// Nom de la table DynamoDB (en dur avec fallback)
const TABLE_URLS = process.env.TABLE_URLS || "urls";

// Configuration de génération de clé
const SHORT_KEY_LENGTH = 6;
const MAX_RETRIES = 5;

/**
 * Génère une clé alphanumérique aléatoire
 */
function generateShortKey(length = SHORT_KEY_LENGTH) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export const handler = async (event) => {
  // ⚡ Initialisation DynamoDB
  const dynamoDb = await initDynamo();

  console.log("DEBUG: Config", {
    tableName: TABLE_URLS,
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT,
  });

  /* ================================
   * 1. Parser et valider l'input
   * ================================ */
  let body;

  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!body?.url) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "URL is required" }),
    };
  }

  const longUrl = body.url;

  /* ======================================
   * 2. Générer + insérer une clé unique
   *    (écriture conditionnelle DynamoDB)
   * ====================================== */
  let shortKey;
  let attempts = 0;
  const createdAt = Date.now();

  while (attempts < MAX_RETRIES) {
    shortKey = generateShortKey();

    try {
      await dynamoDb.send(
        new PutCommand({
          TableName: TABLE_URLS,
          Item: {
            shortKey,
            longUrl,
            createdAt,
            clickCount: 0,
          },
          // 🔥 clé déjà existante → exception
          ConditionExpression: "attribute_not_exists(shortKey)",
        })
      );

      // ✅ Succès → on sort
      break;
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        attempts++;
        continue;
      }

      console.error("DynamoDB error:", err);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Database error",
          details: err.message,
        }),
      };
    }
  }

  if (attempts === MAX_RETRIES) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to generate unique short URL",
      }),
    };
  }

  /* ======================================
   * 3. Construire l'URL courte
   * ====================================== */
  const proto =
    event.headers?.["x-forwarded-proto"] ||
    event.headers?.["X-Forwarded-Proto"] ||
    "http";

  const host = event.headers?.host || "localhost:3000";
  const baseUrl = `${proto}://${host}`;

  /* ======================================
   * 4. Réponse HTTP
   * ====================================== */
  return {
    statusCode: 201,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shortKey,
      shortUrl: `${baseUrl}/${shortKey}`,
      longUrl,
      createdAt,
    }),
  };
};
