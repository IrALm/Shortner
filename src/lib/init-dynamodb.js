import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

// Détection automatique du mode local
const isLocal =
  process.env.AWS_SAM_LOCAL === "true" ||
  process.env.NODE_ENV !== "production";

// Endpoint DynamoDB Local
const dynamoEndpoint = "http://localhost:8000";

// Client DynamoDB
const dynamoClient = new DynamoDBClient({
  region: "eu-west-1",
  endpoint: isLocal ? dynamoEndpoint : undefined,
  credentials: isLocal
    ? { accessKeyId: "test", secretAccessKey: "test" }
    : undefined,
});

// Définition des tables
const tables = [
  {
    TableName: "urls",
    AttributeDefinitions: [{ AttributeName: "shortKey", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "shortKey", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_IMAGE",
    },
  },
  {
    TableName: "click_events",
    AttributeDefinitions: [{ AttributeName: "eventId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "eventId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_IMAGE",
    },
  },
  {
    TableName: "daily_stats",
    AttributeDefinitions: [
      { AttributeName: "shortKey", AttributeType: "S" },
      { AttributeName: "statDate", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "shortKey", KeyType: "HASH" },
      { AttributeName: "statDate", KeyType: "RANGE" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },
];

// Création si nécessaire
async function createTablesIfNotExist() {
  for (const table of tables) {
    try {
      await dynamoClient.send(
        new DescribeTableCommand({ TableName: table.TableName })
      );
      console.log(`✔ Table "${table.TableName}" existe`);
    } catch (err) {
      if (err.name === "ResourceNotFoundException") {
        console.log(`➜ Création de "${table.TableName}"`);
        await dynamoClient.send(new CreateTableCommand(table));
        await waitUntilTableExists(
          { client: dynamoClient, maxWaitTime: 30 },
          { TableName: table.TableName }
        );
        console.log(`✔ "${table.TableName}" ACTIVE`);
      } else {
        throw err;
      }
    }
  }
}

// Exécution
createTablesIfNotExist()
  .then(() => {
    console.log("✅ DynamoDB prêt");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Erreur init DynamoDB", err);
    process.exit(1);
  });