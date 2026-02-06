import { 
  DynamoDBClient, 
  CreateTableCommand, 
  DescribeTableCommand, 
  waitUntilTableExists 
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isLocal = process.env.AWS_SAM_LOCAL === "true";

// Endpoint correct pour Docker Local (nom du conteneur Docker)
const dynamoEndpoint = isLocal
  ? "http://url-shortener-dynamodb:8000"
  : undefined;

// Client standard DynamoDB
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-west-1",
  endpoint: dynamoEndpoint,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

// Client Document pour simplifier Get/Put/Update
export let dynamoDb; // export mutable pour être initialisé plus tard

// Définition des tables à créer
const tables = [
  {
    TableName: "urls",
    AttributeDefinitions: [{ AttributeName: "shortKey", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "shortKey", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_IMAGE" },
  },
  {
    TableName: "click_events",
    AttributeDefinitions: [{ AttributeName: "eventId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "eventId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_IMAGE" },
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

// Fonction pour créer les tables si elles n'existent pas
async function createTablesIfNotExist() {
  for (const table of tables) {
    try {
      await dynamoClient.send(new DescribeTableCommand({ TableName: table.TableName }));
      console.log(`Table "${table.TableName}" existe déjà ✅`);
    } catch (err) {
      if (err.name === "ResourceNotFoundException") {
        console.log(`Table "${table.TableName}" non trouvée. Création en cours...`);
        await dynamoClient.send(new CreateTableCommand(table));
        await waitUntilTableExists(
          { client: dynamoClient, maxWaitTime: 30 },
          { TableName: table.TableName }
        );
        console.log(`Table "${table.TableName}" créée et ACTIVE ✅`);
      } else {
        console.error(`Erreur lors de la vérification de la table "${table.TableName}":`, err);
        throw err;
      }
    }
  }
}

// Initialisation à appeler au début de chaque Lambda
export async function initDynamo() {
  if (isLocal) {
    await createTablesIfNotExist();
  }
  dynamoDb = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return dynamoDb;
}
