import { s3Client } from "../lib/s3.js";
import { HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

// Détection du mode local
const isLocal =
  process.env.AWS_SAM_LOCAL === "true" ||
  process.env.NODE_ENV !== "production";

// Valeurs par défaut en local
const BUCKET_NAME = process.env.FAVICONS_BUCKET || (isLocal ? "favicons" : null);
const REGION = process.env.AWS_REGION || "eu-west-1";
const ENDPOINT = process.env.S3_ENDPOINT || (isLocal ? "http://localhost:9000" : undefined);

// Sécurité : en production, la variable doit exister
if (!BUCKET_NAME) {
  throw new Error(
    "La variable d'environnement FAVICONS_BUCKET n'est pas définie (obligatoire en production) !"
  );
}

async function ensureBucketExists() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`Bucket "${BUCKET_NAME}" déjà existant ✅`);
  } catch (err) {
    const code = err.$metadata?.httpStatusCode;

    if (err.name === "NotFound" || code === 404) {
      console.log(`➜ Création du bucket "${BUCKET_NAME}"`);

      await s3Client.send(
        new CreateBucketCommand({
          Bucket: BUCKET_NAME,
          // MinIO n'accepte pas CreateBucketConfiguration
          ...(ENDPOINT ? {} : { CreateBucketConfiguration: { LocationConstraint: REGION } }),
        })
      );

      console.log(`Bucket "${BUCKET_NAME}" créé ✅`);
    } else {
      console.error("Erreur lors de la vérification du bucket :", err.name, code);
      throw err;
    }
  }
}

ensureBucketExists()
  .then(() => {
    console.log("✅ Bucket prêt pour S3 / Minio");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Erreur init S3 / Minio", err);
    process.exit(1);
  });