/**
 * Lambda : GET /urls
 * ------------------
 * Liste toutes les URLs raccourcies avec :
 * - shortKey
 * - longUrl
 * - totalClicks
 * - faviconPath
 */

import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { initDynamo } from "../lib/dynamodb.js";

// Nom des tables DynamoDB
const TABLE_URLS = process.env.TABLE_URLS;
const TABLE_CLICK_EVENTS = process.env.TABLE_CLICK_EVENTS;

export const handler = async (event) => {
  // ⚡ Initialisation DynamoDB
  const dynamoDb = await initDynamo();

  try {
    // 1️ Récupérer toutes les URLs raccourcies
    const urlsResult = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_URLS })
    );

    const urls = urlsResult.Items || [];

    // 2️ Pour chaque URL, récupérer le total des clics
    const urlsWithStats = await Promise.all(
      urls.map(async (url) => {
        let totalClicks = url.clickCount || 0;

        try {
          const clicksResult = await dynamoDb.send(
            new QueryCommand({
              TableName: TABLE_CLICK_EVENTS,
              KeyConditionExpression: "shortKey = :sk",
              ExpressionAttributeValues: { ":sk": url.shortKey },
            })
          );
          totalClicks = clicksResult.Count || totalClicks;
        } catch (err) {
          console.warn(
            `Erreur récupération des clicks pour ${url.shortKey}:`,
            err.message
          );
        }

        return {
          shortKey: url.shortKey,
          longUrl: url.longUrl,
          totalClicks,
          favicon: url.faviconPath || null,
        };
      })
    );

    // 3️ Retourner la liste JSON
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(urlsWithStats),
    };
  } catch (error) {
    console.error("Erreur GET /urls:", error);
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
