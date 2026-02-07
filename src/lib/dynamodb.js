// lib/dynamodb.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isLocal = process.env.AWS_SAM_LOCAL === "true";

const dynamoEndpoint = process.env.DYNAMODB_ENDPOINT || (isLocal
  ? "http://url-shortener-dynamodb:8000" // recommandé avec SAM
  : undefined);

// Client bas niveau
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-west-1",
  endpoint: dynamoEndpoint,
  credentials: isLocal
    ? {
      accessKeyId: "test",
      secretAccessKey: "test",
    }
    : undefined,
});

// Client Document (utilisé partout)
export const dynamoDb = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Initialisation ultra-légère (future-proof)
export async function initDynamo() {
  return dynamoDb;
}
