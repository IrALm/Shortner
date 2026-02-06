import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

const isLocal =
  process.env.AWS_SAM_LOCAL === "true" ||
  process.env.NODE_ENV !== "production";

const REGION = process.env.AWS_REGION || "eu-west-1";

const ENDPOINT =
  process.env.S3_ENDPOINT || (isLocal ? "http://localhost:9000" : undefined);

const BUCKET_NAME =
  process.env.FAVICONS_BUCKET || (isLocal ? "favicons" : null);

export const s3Client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true, // indispensable pour MinIO
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "minioadmin",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "minioadmin",
  },
});

/**
 * Vérifie que le bucket existe, sinon le crée.
 * Fonction utilisée par fetch-favicon et init-s3.js
 */
export async function ensureBucketExists() {
  if (!BUCKET_NAME) {
    throw new Error("FAVICONS_BUCKET n'est pas défini !");
  }

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`Bucket "${BUCKET_NAME}" déjà existant`);
  } catch (err) {
    const code = err.$metadata?.httpStatusCode;

    if (err.name === "NotFound" || code === 404) {
      console.log(`Création du bucket "${BUCKET_NAME}"`);

      await s3Client.send(
        new CreateBucketCommand({
          Bucket: BUCKET_NAME,
          // MinIO n'accepte pas CreateBucketConfiguration
          ...(ENDPOINT ? {} : { CreateBucketConfiguration: { LocationConstraint: REGION } }),
        })
      );

      console.log(`Bucket "${BUCKET_NAME}" créé`);
    } else {
      console.error("Erreur lors de la vérification du bucket :", err.name, code);
      throw err;
    }
  }
}