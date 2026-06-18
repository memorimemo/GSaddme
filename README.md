# Galatasaray Fan Compositing API

Galatasaray taraftarlarının fotoğrafını bir futbolcunun yanına gerçekçi biçimde yerleştiren görsel üretim sistemi. Express 5 + Node.js 22 tabanlı, asenkron kuyruk mimarisiyle çalışır.

---

## Nasıl Çalışır

1. Client bir fotoğraf ve oyuncu/template seçimi gönderir → job kuyruğa alınır
2. Worker job'u çeker: AWS Rekognition ile moderasyon yapar, template'i diskten okur, prompt'u template'in güncel `promptHint`'inden oluşturur
3. OpenAI Responses API'ye (`gpt-5.5` + `chatgpt-image-latest`, `input_fidelity: high`, `reasoning: high`) template ve kullanıcı fotoğrafı gönderilir
4. Üretilen görsel AWS S3'e yüklenir, job tamamlandı olarak işaretlenir
5. Client presigned URL ile sonucu alır

---

## Mimari

```
galatasaray/
├── prisma/
│   ├── schema.prisma              # DB şeması (Job, Player, Template, Outbox…)
│   └── migrations/                # Prisma migration dosyaları
│
├── src/
│   ├── assets/
│   │   └── templates/             # Template görselleri + JSON sidecar dosyaları
│   │       ├── baris-alper-yilmaz/  1.png, 1.json, 2.png, 2.json
│   │       ├── davinson-sanchez/    1.png, 1.json
│   │       ├── icardi/              template-5.jpg, template-5.json, template-6.jpg, template-6.json
│   │       ├── lucas-torreira/      1.png, 1.json, 2.png, 2.json, 3.png, 3.json
│   │       ├── osimhen/             1.png, 1.json, 2.png, 2.json, 3.png, 3.json
│   │       └── ugurcan-cakir/
│   │
│   ├── config/
│   │   └── index.js               # Zod ile env parse + config nesnesi
│   │
│   ├── constants/                 # Sabit değerler (job statüsleri, outbox topic'leri…)
│   │
│   ├── controllers/
│   │   ├── auth.controller.js     # Token endpoint'leri
│   │   ├── jobs.controller.js     # Job oluşturma + sorgulama
│   │   └── admin.controller.js    # Admin: job listesi, retry, template sync
│   │
│   ├── errors/
│   │   └── AppError.js            # Custom hata sınıfı (code + statusCode)
│   │
│   ├── lib/                       # 3rd party singleton wrapper'ları
│   │   ├── db.js                  # Prisma client
│   │   ├── openai.js              # OpenAI client
│   │   ├── rabbitmq.js            # AMQP bağlantı + channel yönetimi
│   │   ├── redis.js               # ioredis client
│   │   ├── rekognition.js         # AWS Rekognition client
│   │   ├── s3.js                  # AWS S3 client
│   │   ├── logger.js              # Pino logger
│   │   └── openapi.js             # Swagger doküman tanımı
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js     # JWT doğrulama (client + admin)
│   │   ├── rate-limit.middleware.js # Redis store ile rate limiting
│   │   ├── validate.middleware.js  # Zod şema doğrulama
│   │   └── error-handler.middleware.js
│   │
│   ├── repository/                # Sadece DB sorguları
│   │   ├── auth.repository.js
│   │   ├── job.repository.js
│   │   └── template.repository.js
│   │
│   ├── router/v1/
│   │   ├── auth.router.js         # /api/v1/auth
│   │   ├── players.router.js      # /api/v1/players
│   │   ├── jobs.router.js         # /api/v1/jobs
│   │   └── admin.router.js        # /api/v1/admin
│   │
│   ├── scripts/
│   │   └── sync-templates.js      # Template diskten DB'ye sync (npm run templates:sync)
│   │
│   ├── services/
│   │   ├── auth/
│   │   │   ├── login.service.js
│   │   │   └── token.service.js
│   │   ├── jobs/
│   │   │   ├── job.service.js          # Job oluşturma + sorgulama iş mantığı
│   │   │   ├── processing.service.js   # Worker tarafından çalışır: moderation → OpenAI → S3
│   │   │   ├── openai-image.service.js # Responses API çağrısı
│   │   │   ├── prompt.service.js       # Template promptHint'inden prompt oluşturma
│   │   │   ├── moderation.service.js   # AWS Rekognition moderasyon
│   │   │   └── storage.service.js      # S3 yükleme + presigned URL
│   │   ├── queue/
│   │   │   └── outbox-dispatcher.service.js  # Outbox → RabbitMQ yayını
│   │   └── templates/
│   │       └── sync.service.js         # Disk → DB template senkronizasyonu
│   │
│   ├── utils/
│   │   ├── async-handler.js       # Express async wrapper
│   │   ├── semaphore.js           # Eşzamanlı job sayısı sınırlayıcı
│   │   ├── hash.js, jwt.js        # Auth yardımcıları
│   │   └── duration.js, http.js
│   │
│   ├── validations/               # Zod istek şemaları
│   │   ├── auth.schema.js
│   │   └── jobs.schema.js
│   │
│   ├── workers/
│   │   └── job.worker.js          # RabbitMQ consumer — processing.service'i tetikler
│   │
│   ├── app.js                     # Express kurulumu, middleware ve router mount
│   └── server.js                  # HTTP dinleme, graceful shutdown, template sync başlatma
│
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## Katman Sorumlulukları

| Katman | Sorumluluğu |
|---|---|
| `router/` | Route tanımı + middleware zinciri |
| `controllers/` | req parse → service çağır → res gönder |
| `services/` | İş mantığı ve orchestration |
| `repository/` | Sadece DB sorguları (Prisma) |
| `lib/` | 3rd party client singleton'ları |
| `middlewares/` | Auth, rate-limit, validation, error handling |
| `workers/` | Kuyruktan mesaj al → processing.service'i çağır |

---

## Job İşleme Akışı

```
Client
  │
  ▼  POST /api/v1/jobs  (multipart: image + playerSlug + templateKey)
jobs.controller → validate → auth
  │
  ▼
job.service
  ├─ Fotoğrafı normalize et (sharp) → S3'e yükle
  ├─ DB'ye Job kaydı oluştur (prompt: null)
  └─ OutboxEvent kaydı oluştur (transactional)
  │
  ▼  202 Accepted  { jobId }
  │
outbox-dispatcher (polling, her 2s)
  └─ OutboxEvent → RabbitMQ'ya publish
  │
  ▼
job.worker (RabbitMQ consumer)
  └─ processing.service.processJobMessage(jobId)
        │
        ├─ Stage 1: S3'ten normalize edilmiş fotoğrafı çek
        ├─ Stage 2 (parallel):
        │    ├─ AWS Rekognition moderasyon
        │    └─ Template görselini diskten oku
        ├─ Prompt'u template'in güncel promptHint'inden oluştur
        ├─ Stage 3: OpenAI Responses API
        │    model: gpt-5.5 + chatgpt-image-latest
        │    input_fidelity: high, reasoning: high
        └─ Stage 4: Üretilen görseli S3'e yükle → Job SUCCEEDED
  │
  ▼
Client  GET /api/v1/jobs/:id  →  { status: "SUCCEEDED", resultUrl: "…" }
```

---

## Template Sistemi

Her template bir görsel dosyası (`.png` / `.jpg`) ve yanında bir JSON sidecar dosyasından oluşur.

**`customPrompt` formatı** (aktif kullanılan format):
```json
{
  "customPrompt": "⚠ CRITICAL RULE — READ FIRST...\n..."
}
```

JSON güncellendiğinde `npm run templates:sync` komutu çalıştırılır; Worker her job'u işlerken prompt'u DB'deki güncel `promptHint`'ten oluşturduğu için API server restart gerekmez.

---

## Kurulum

### Gereksinimler

- Node.js 22+
- Docker & Docker Compose
- AWS hesabı (S3 + Rekognition)
- OpenAI API key (`gpt-5.5` ve `chatgpt-image-latest` erişimi)

### Yerel Geliştirme

```bash
# Bağımlılıkları kur
npm install

# .env dosyasını oluştur ve düzenle
cp .env.example .env

# Altyapıyı başlat (PostgreSQL + RabbitMQ + Redis)
docker compose up -d postgres rabbitmq redis

# Migration çalıştır
npm run db:migrate

# Template'leri DB'ye sync et
npm run templates:sync

# API server'ı başlat
npm run dev

# Worker'ı başlat (ayrı terminal)
npm run worker
```

---

## Ortam Değişkenleri

### Development vs Production

| Ayar | Development | Production |
|------|-------------|------------|
| `NODE_ENV` | `development` | `production` |
| AWS Credentials | `.env` dosyasından okunur | IAM role üzerinden otomatik (credentials yoksayılır) |
| OpenAI Image Quality | `medium` (hardcoded) | `medium` (hardcoded) |
| OpenAI Image Format | `jpeg` (hardcoded) | `jpeg` (hardcoded) |

### Zorunlu Değişkenler

```env
# Server
NODE_ENV=development          # development | production
PORT=3013

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/galatasaray

# Auth
CLIENT_APP_TOKEN=             # min 32 karakter
JWT_SECRET=                   # min 32 karakter
ADMIN_BOOTSTRAP_TOKEN=        # min 32 karakter
ADMIN_JWT_SECRET=             # min 32 karakter

# AWS
AWS_REGION=eu-central-1
AWS_S3_BUCKET=your-bucket-name

# OpenAI
OPENAI_API_KEY=

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# CORS
CORS_ORIGINS=*                # Production'da spesifik domain belirtin
```

### AWS Credentials (Sadece Development)

```env
# Development ortamında .env dosyasına ekleyin
# Production'da IAM role kullanılır, bu değişkenler yoksayılır
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Opsiyonel Değişkenler (Varsayılanlar Mevcut)

```env
# Auth
CLIENT_APP_SLUG=default-client-app
CLIENT_APP_NAME=Default Client App
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
ADMIN_JWT_EXPIRES_IN=15m

# AWS
AWS_PRESIGNED_URL_EXPIRES_IN=900
AWS_REKOGNITION_MIN_CONFIDENCE=75

# OpenAI (model ve reasoning ayarları)
OPENAI_RESPONSES_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=chatgpt-image-latest
OPENAI_IMAGE_SIZE=auto
OPENAI_IMAGE_BACKGROUND=opaque
OPENAI_IMAGE_INPUT_FIDELITY=high
OPENAI_REASONING_EFFORT=high

# RabbitMQ
RABBITMQ_EXCHANGE=galatasaray.jobs
RABBITMQ_QUEUE=galatasaray.jobs.image-generate
RABBITMQ_ROUTING_KEY=jobs.image.generate
RABBITMQ_PREFETCH=30
OUTBOX_BATCH_SIZE=100
OUTBOX_POLL_INTERVAL_MS=2000
OUTBOX_MAX_ATTEMPTS=5

# Rate Limit
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300

# Worker
WORKER_MAX_CONCURRENT_JOBS=30

# Uploads
MAX_UPLOAD_BYTES=15728640
MAX_IMAGE_DIMENSION=2048
```

### Hardcoded Değerler

Aşağıdaki değerler kod içinde sabitlenmiştir ve ortam değişkeniyle değiştirilemez:

| Ayar | Değer | Açıklama |
|------|-------|----------|
| `OPENAI_IMAGE_QUALITY` | `medium` | OpenAI görsel kalitesi |
| `OPENAI_IMAGE_FORMAT` | `jpeg` | Çıktı görsel formatı |

---

## API Referansı

### Auth

| Method | Endpoint | Açıklama |
|---|---|---|
| POST | `/api/v1/auth/token` | Access token al |
| POST | `/api/v1/auth/refresh` | Token yenile |

### Players

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/api/v1/players` | Aktif oyuncuları ve template'lerini listele |

Response: oyuncu başına `slug`, `displayName` ve `templates[]` (key, variantName, width, height, mimeType).

### Jobs

| Method | Endpoint | Açıklama |
|---|---|---|
| POST | `/api/v1/jobs` | Yeni job oluştur (fotoğraf + playerSlug + templateKey) |
| GET | `/api/v1/jobs/:id` | Job durumunu ve sonuç URL'ini sorgula |

### Admin

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/api/v1/admin/jobs` | Job listesi (filtreli, sayfalı) |
| GET | `/api/v1/admin/jobs/:id` | Job detayı |
| POST | `/api/v1/admin/jobs/:id/retry` | Başarısız job'u yeniden kuyruğa al |
| POST | `/api/v1/admin/templates/sync` | Template'leri diskten DB'ye sync et |

### Health

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/health` | DB + Redis + RabbitMQ durum kontrolü |

---

## npm Scriptleri

| Script | Açıklama |
|---|---|
| `npm run dev` | Geliştirme modunda API server (nodemon) |
| `npm start` | Production API server |
| `npm run worker` | Job worker başlat |
| `npm run templates:sync` | Template JSON sidecar'larını DB'ye sync et |
| `npm run db:migrate` | Prisma migration çalıştır |
| `npm run db:migrate:prod` | Production migration (deploy) |
| `npm run db:generate` | Prisma client generate et |
| `npm run db:studio` | Prisma Studio aç |

---

## Deployment

### Docker Build

```bash
docker build -t galatasaray-api .
```

### AWS Deployment (ECS/EKS)

Production ortamında AWS credentials `.env` dosyasından değil, IAM role üzerinden sağlanır:

1. **IAM Role Oluşturun** — S3 ve Rekognition erişimi için gerekli policy'leri ekleyin:
   - `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` (bucket için)
   - `rekognition:DetectModerationLabels`

2. **Task/Pod'a Role Atayın**:
   - ECS: Task Definition'da `taskRoleArn` belirtin
   - EKS: Service Account ile IAM role association

3. **Environment Variables** — Sadece şunlar gerekli (AWS credentials hariç):
   ```env
   NODE_ENV=production
   AWS_REGION=eu-central-1
   AWS_S3_BUCKET=your-bucket-name
   # ... diğer zorunlu değişkenler
   ```

### CI/CD (GitHub Actions)

`staging` branch'ine push yapıldığında otomatik olarak:
1. Docker image build edilir
2. AWS ECR'a push edilir (`nouo-prod-gs-api` repository)

**Gerekli GitHub Secrets:**
- `AWS_ACCESS_KEY_ID` — ECR push için
- `AWS_SECRET_ACCESS_KEY` — ECR push için

---

## Kullanılan Paketler

### Production

| Paket | Amaç |
|---|---|
| `express` `^5` | Web framework |
| `openai` `^6` | Responses API — `gpt-5.5` + `chatgpt-image-latest` |
| `@aws-sdk/client-s3` | S3 görsel depolama |
| `@aws-sdk/client-rekognition` | Görsel moderasyon |
| `@aws-sdk/s3-request-presigner` | Presigned URL üretimi |
| `amqplib` | RabbitMQ AMQP client |
| `ioredis` | Redis client |
| `rate-limit-redis` | Redis store ile dağıtık rate limiting |
| `@prisma/client` | PostgreSQL ORM |
| `sharp` | Görsel normalize (yeniden boyutlandırma, format) |
| `multer` | Multipart dosya yükleme |
| `zod` | Env ve request validation |
| `pino` + `pino-http` | Yapısal JSON loglama |
| `jsonwebtoken` | JWT üretme ve doğrulama |
| `helmet` | HTTP güvenlik başlıkları |
| `cors` | Cross-origin policy |
| `swagger-ui-express` | OpenAPI dokümantasyonu (`/api-docs`) |

### Dev

| Paket | Amaç |
|---|---|
| `prisma` | Migration ve schema yönetimi |
| `nodemon` | Hot-reload |
| `pino-pretty` | Geliştirmede okunabilir log çıktısı |

---

## Lisans

ISC
