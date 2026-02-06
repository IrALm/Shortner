# 🚀 Serverless URL Shortener

![AWS Lambda](https://img.shields.io/badge/AWS%20Lambda-FF9900?style=for-the-badge&logo=aws-lambda&logoColor=white)
![DynamoDB](https://img.shields.io/badge/Amazon%20DynamoDB-4053D6?style=for-the-badge&logo=amazon-dynamodb&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![MinIO](https://img.shields.io/badge/MinIO-C72C48?style=for-the-badge&logo=minio&logoColor=white)

Un service de raccourcissement d'URL moderne, **Event-Driven** et entièrement **Serverless**, conçu pour AWS mais exécutable localement avec une fidélité de production grâce à Docker, SAM CLI et un simulateur de streams maison.

---

### 🧩 Composants Principaux

| Composant | Technologie | Description |
|-----------|-------------|-------------|
| **Core API** | AWS Lambda | Logique métier (Node.js 20). |
| **Stockage** | DynamoDB | NoSQL rapide : Tables `urls`, `click_events`, `daily_stats`. |
| **Assets** | S3 (AWS) / Minio (Local) | Stockage des favicons récupérés (`favicon.ico`). |
| **Async Processing** | DynamoDB Streams | Déclenchement automatique des background jobs (stats, favicons). |
| **Orchestration** | AWS SAM | Template `template.yaml` pour l'IaC (Infrastructure as Code). |

---

## 🛠️ Installation et Configuration Locale

### Prérequis

- **Docker** & **Docker Compose** (Pour simuler la DB et S3)
- **Node.js 20+**
- **AWS SAM CLI** (Pour l'émulation Lambda API)
- **AWS CLI** (Optionnel, pour configurer des profils fictifs si besoin)

### 1. Démarrer l'infrastructure (Docker)

Lancez les conteneurs pour DynamoDB Local, DynamoDB Admin et Minio.

```bash
docker-compose up -d
```
> **Vérification :**
> - **DynamoDB Admin** : [http://localhost:8001](http://localhost:8001)
> - **Minio Console** : [http://localhost:9001](http://localhost:9001) (User: `minioadmin`, Pass: `minioadmin`)

### 2. Installer les dépendances

```bash
cd src
npm install
```

### 3. Lancer l'API (SAM Local)

Dans un **premier terminal**, démarrez le serveur API local.

```bash
npm start
# Ou directement : sam local start-api
```
L'API est maintenant accessible sur `http://127.0.0.1:3000`.

### 4. Lancer le Watcher de Streams ⚡

SAM CLI ne gère pas nativement les triggers DynamoDB Streams en local. Nous utilisons un script dédié pour surveiller les changements et invoquer les lambdas.
Dans un **second terminal** :

```bash
cd src
npm run watch-streams
```
> Ce processus détectera les ajouts dans `urls` et `click_events` et exécutera automatiquement les lambdas `fetch-favicon` et `stats-processor`.

---

## 📡 Utilisation des Endpoints

### 1. Raccourcir une URL

**POST** `/shorten`

```bash
curl -X POST http://127.0.0.1:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"longUrl": "https://www.google.com"}'
```
**Réponse :**
```json
{
  "shortUrl": "http://127.0.0.1:3000/AbCdE1",
  "shortKey": "AbCdE1"
}
```

### 2. Redirection (et comptage du clic)

**GET** `/{shortKey}`

Ouvrez simplement l'URL dans votre navigateur : `http://127.0.0.1:3000/AbCdE1`

> ⚙️ **Effet de bord** : Une entrée est créée dans `click_events`. Le **Stream Watcher** va la détecter et déclencher `stats-processor` pour incrémenter le compteur journalier.

### 3. Voir les URLs créées

**GET** `/urls`

```bash
curl http://127.0.0.1:3000/urls
```
Retourne la liste complète, y compris le chemin vers le favicon (`faviconPath`) si le traitement asynchrone est terminé.

### 4. Voir les statistiques

**GET** `/stats/{shortKey}`

```bash
curl http://127.0.0.1:3000/stats/AbCdE1
```

## 🐞 Debugging & Astuces

### Logs
- **API** : Visibles dans le terminal où `sam local start-api` tourne.
- **Streams** : Visibles dans le terminal où `npm run watch-streams` tourne.

### Visualisation des Données
Utilisez **dynamodb-admin** sur [http://localhost:8001](http://localhost:8001) pour voir le contenu brut des tables :
- `urls` : Vérifiez la colonne `faviconPath`.
- `click_events` : Vérifiez que les clics sont enregistrés.
- `daily_stats` : Vérifiez que les clics sont bien agrégés.

### Forcer le traitement (Scan)
Si vous avez inséré des données alors que le watcher était éteint, relancez simplement :
```bash
# Dans le dossier src/
node local-stream-watcher.js
```
Ou invoquez une fonction spécifique :
```bash
sam local invoke FetchFaviconFunction -e events/event-mock.json
```
*(Le code détectera l'environnement local et passera en mode "Scan" pour rattraper le retard).*
