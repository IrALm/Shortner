/**
 * Configuration du client S3 / Minio
 * ----------------------------------
 * Centralise la configuration pour toutes les Lambdas qui manipulent S3.
 *
 * Compatible :
 * - AWS S3 en production
 * - Minio / S3 local (via variables d'environnement)
 */

import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

// Récupération des variables d'environnement
const REGION = process.env.AWS_REGION || "eu-west-1";
const ENDPOINT = process.env.S3_ENDPOINT || undefined; // ex: http://localhost:9000 pour Minio
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY || "minioadmin";
const SECRET_ACCESS_KEY = process.env.S3_SECRET_KEY || "minioadmin";
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true" || true;
const BUCKET_NAME = process.env.FAVICONS_BUCKET; // Nom du bucket à vérifier/créer

// Création du client S3
export const s3Client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT, // uniquement pour Minio/local
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
  forcePathStyle: FORCE_PATH_STYLE, // Minio requiert path-style
});

/**
 * Vérifie si le bucket existe et le crée si nécessaire
 */
export const ensureBucketExists = async () => {
  if (!BUCKET_NAME) {
    throw new Error("La variable d'environnement FAVICONS_BUCKET n'est pas définie !");
  }

  try {
    // Vérifier si le bucket existe
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`Bucket "${BUCKET_NAME}" déjà existant`);
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      // Le bucket n'existe pas, on le crée
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`Bucket "${BUCKET_NAME}" créé`);
    } else {
      // Autre erreur (permissions, endpoint, etc.)
      console.error("Erreur lors de la vérification du bucket :", err);
      throw err;
    }
  }
};
