/**
 * Lambda : GET /{shortKey}
 * ------------------------
 * Redirige vers l'URL longue correspondant à la clé courte.
 * Enregistre un événement de clic dans DynamoDB.
 */

import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { initDynamo } from "../lib/dynamodb.js";
import { randomUUID } from "crypto";

// Noms des tables DynamoDB
const TABLE_URLS = process.env.TABLE_URLS || "urls";
const TABLE_CLICK_EVENTS = process.env.TABLE_CLICK_EVENTS || "click_events";

export const handler = async (event) => {
  // ⚡ Initialisation DynamoDB
  const dynamoDb = await initDynamo();

  /* ================================
   * 1. Récupérer le paramètre shortKey
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
   * 2. Rechercher l'URL longue dans DynamoDB
   * ================================ */
  let urlItem;
  try {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: TABLE_URLS,
        Key: { shortKey },
      })
    );
    urlItem = result.Item;
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details: error.message }),
    };
  }

  if (!urlItem) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Short URL not found" }),
    };
  }

  /* ================================
   * 3. Incrémenter le compteur de clics
   * ================================ */
  try {
    await dynamoDb.send(
      new UpdateCommand({
        TableName: TABLE_URLS,
        Key: { shortKey },
        UpdateExpression: "SET clickCount = if_not_exists(clickCount, :zero) + :inc",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":inc": 1,
        },
      })
    );
  } catch (error) {
    console.warn("Erreur incrément clickCount :", error.message);
    // Ne bloque pas la redirection
  }

  /* ================================
   * 4. Enregistrer l'événement de clic
   * ================================ */
  const clickEvent = {
    eventId: randomUUID(),
    shortKey,
    clickedAt: Date.now(),
    userAgent: event.headers?.["User-Agent"] || "unknown",
    ipAddress: event.requestContext?.identity?.sourceIp || "unknown",
  };

  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_CLICK_EVENTS,
        Item: clickEvent,
      })
    );
  } catch (error) {
    console.warn("Erreur enregistrement clickEvent :", error.message);
    // Ne bloque pas la redirection
  }

  /* ================================
   * 5. Retourner la redirection HTTP 302
   * ================================ */
  return {
    statusCode: 302,
    headers: {
      Location: urlItem.longUrl,
      "Cache-Control": "no-cache",
      "Content-Type": "text/plain", // obligatoire pour SAM local
    },
    body: "", // évite l'erreur Lambda "empty body"
  };
};
