 /**
 * Lambda : fetch-favicon
 * ----------------------
 * Déclenchée par INSERT dans la table urls.
 * Récupère le favicon du site et le stocke dans S3/Minio.
 * Met ensuite à jour la table urls avec le chemin du favicon.
 */

import fetch from "node-fetch";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { initDynamo } from "../lib/dynamodb.js";
import { s3Client, ensureBucketExists } from "../lib/s3.js"; // client S3/Minio + vérification bucket

// Variables d'environnement
const TABLE_URLS = process.env.TABLE_URLS;        // Nom de la table DynamoDB "urls"
const BUCKET_NAME = process.env.FAVICONS_BUCKET; // Nom du bucket S3 / Minio pour stocker les favicons

// Détecter si on est en local (SAM CLI)
const isLocal = process.env.AWS_SAM_LOCAL === "true";

export const handler = async (event) => {
  // ⚡ Initialisation DynamoDB + S3 (tables & bucket)
  const dynamoDb = await initDynamo();
  await ensureBucketExists();

  // ===== En local, on force le scan de toutes les URLs =====
  let records = event?.Records || [];
  if (isLocal) {
    console.log("[FETCH-FAVICON] Mode local : scan table URLs");
    const scanResult = await dynamoDb.send(new ScanCommand({ TableName: TABLE_URLS }));
    records = (scanResult.Items || []).map((item) => ({
      eventName: "INSERT",
      dynamodb: {
        NewImage: {
          shortKey: { S: item.shortKey },
          longUrl: { S: item.longUrl },
        },
      },
    }));
  }

  if (records.length === 0) {
    console.log("[FETCH-FAVICON] Aucun record à traiter");
    return;
  }

  console.log(`[FETCH-FAVICON] Traitement de ${records.length} records`);

  for (const record of records) {
    if (record.eventName !== "INSERT") continue;

    const newImage = record.dynamodb.NewImage;
    const shortKey = newImage.shortKey.S;
    const longUrl = newImage.longUrl.S;

    try {
      const faviconUrl = new URL("/favicon.ico", longUrl).href;
      const response = await fetch(faviconUrl);

      if (!response.ok) {
        console.warn(`[${shortKey}] Favicon introuvable (${faviconUrl})`);
        continue;
      }

      const buffer = await response.arrayBuffer();
      const s3Key = `favicons/${shortKey}.ico`;

      // Upload dans S3/Minio
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: Buffer.from(buffer),
          ContentType: "image/x-icon",
        })
      );

      // Mise à jour de la table URLs
      await dynamoDb.send(
        new UpdateCommand({
          TableName: TABLE_URLS,
          Key: { shortKey },
          UpdateExpression: "SET faviconPath = :path",
          ExpressionAttributeValues: { ":path": s3Key },
        })
      );

      console.log(`[${shortKey}] Favicon récupéré et stocké ✅`);
    } catch (error) {
      console.warn(`[${shortKey}] Impossible de récupérer le favicon :`, error.message);
    }
  }

  return;
};