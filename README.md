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

Dans un terminal séparé, lancez :
```bash
docker compose up -d
```

### 2. Initialiser les ressources

Ensuite, dans un autre terminal, lancez :
```bash
node src/lib/init-s3.js       # Pour créer le bucket
node src/lib/init-dynamodb.js # Pour créer les tables
```

### 3. Lancer l'API (SAM Local)

```bash
sam local start-api --docker-network url-shortener_net
```

---

## 📡 Utilisation des Endpoints

### 1. Raccourcir une URL (Lambda Shorten)

**POST** `/shorten`
```json
{
  "url": "https://www.google.com"
}
```

**Sortie :**
```json
{
    "shortKey": "WDnIeS",
    "shortUrl": "http://localhost:3000/WDnIeS",
    "longUrl": "https://www.google.com",
    "createdAt": 1770423123010
}
```

### 2. Redirection (Lambda Redirect)

**GET** `/{shortKey}`
Exemple : `http://127.0.0.1:3000/WDnIeS`

### 3. Statistiques (Lambda GetStats)

**GET** `/stats/{shortKey}`
Exemple : `http://127.0.0.1:3000/stats/WDnIeS`

**Sortie :**
```json
{
    "shortKey": "WDnIeS",
    "stats": [
        {
            "statDate": "2026-02-07",
            "totalClicks": 21,
            "shortKey": "WDnIeS",
            "updatedAt": 1770423264282
        }
    ]
}
```

### 4. Liste des URLs (Lambda ListUrls)

**GET** `/urls`
Exemple : `http://127.0.0.1:3000/urls`

**Sortie :**
```json
[
    {
        "shortKey": "WDnIeS",
        "longUrl": "https://www.google.com",
        "totalClicks": 6,
        "favicon": "favicons/WDnIeS.ico"
    }
]
```
