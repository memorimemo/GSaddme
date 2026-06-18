# Galatasaray Compositing API — Integration Guide

**Base URL:** `http://ec2-3-77-234-1.eu-central-1.compute.amazonaws.com`

---

## Genel Akış

```
1. Client Token ile Access Token al
2. Aktif oyuncuları ve template'leri listele
3. Kullanıcı fotoğrafı + playerSlug + templateKey ile job oluştur
4. Job tamamlanana kadar status'u poll et
5. resultUrl ile görseli indir
```

---

## 1. Authentication

Her istekte `Authorization: Bearer <accessToken>` header'ı gerekir. Token'ı almak için client token kullanılır.

**Client Token:**
```
gs_client_token_2ec74003c783de5033fedee841deec7ad97a2d194c72d6bf
```

### Token Al

```http
POST /api/v1/auth/token
Content-Type: application/json
```

```json
{
  "clientToken": "gs_client_token_2ec74003c783de5033fedee841deec7ad97a2d194c72d6bf"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGci...",
  "expiresIn": "1h",
  "refreshToken": "Qp8l4vjs...",
  "tokenType": "Bearer"
}
```

### Token Yenile

Access token süresi dolduğunda (`expiresIn: 1h`) refresh token ile yenile:

```http
POST /api/v1/auth/refresh
Content-Type: application/json
```

```json
{
  "refreshToken": "Qp8l4vjs..."
}
```

---

## 2. Oyuncu ve Template Listesi

Kullanılabilir oyuncuları ve her oyuncunun template'lerini çeker.

```http
GET /api/v1/players
Authorization: Bearer <accessToken>
```

**Response:**
```json
[
  {
    "slug": "osimhen",
    "displayName": "Osimhen",
    "templates": [
      {
        "key": "osimhen:1",
        "variantName": "1",
        "width": 1254,
        "height": 1254,
        "mimeType": "image/png"
      },
      {
        "key": "osimhen:2",
        "variantName": "2",
        "width": 1122,
        "height": 1402,
        "mimeType": "image/png"
      }
    ]
  }
]
```

| Alan | Açıklama |
|---|---|
| `slug` | Job oluştururken `playerSlug` olarak kullanılır |
| `key` | Job oluştururken `templateKey` olarak kullanılır |
| `width` / `height` | Üretilecek görselin boyutu (px) |

**Mevcut oyuncular:** `baris-alper-yilmaz`, `davinson-sanchez`, `icardi`, `lucas-torreira`, `osimhen`

---

## 3. Job Oluştur

Kullanıcının fotoğrafını ve seçilen template'i OpenAI'ye göndererek kompozit görsel üretir. İstek hemen döner, işlem arka planda devam eder.

```http
POST /api/v1/jobs
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

| Form Alanı | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `image` | file | ✓ | Kullanıcının fotoğrafı (JPEG/PNG/WebP/HEIC, max 15MB) |
| `playerSlug` | string | ✓ | Örn: `osimhen` |
| `templateKey` | string | — | Örn: `osimhen:1`. Belirtilmezse rastgele seçilir. |

**Fotoğraf gereksinimleri:**
- Tek kişi içermeli (birden fazla kişi varsa reddedilir)
- Yüz net görünür olmalı
- Uygunsuz içerik içermemeli

**Response:** `202 Accepted`
```json
{
  "id": "6f324a20-2517-4567-a2f0-32d4da01b2c2",
  "playerSlug": "osimhen",
  "status": "QUEUED",
  "templateKey": "osimhen:1"
}
```

---

## 4. Job Durumunu Sorgula

```http
GET /api/v1/jobs/:jobId
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "id": "6f324a20-...",
  "status": "SUCCEEDED",
  "resultUrl": "https://s3.amazonaws.com/...",
  ...
}
```

### Status Değerleri

| Status | Açıklama |
|---|---|
| `QUEUED` | Sıraya alındı, işlenmeyi bekliyor |
| `PROCESSING` | OpenAI'de işleniyor |
| `SUCCEEDED` | Tamamlandı, `resultUrl` kullanılabilir |
| `REJECTED` | Moderasyon reddetti (`rejectionReason` alanına bak) |
| `FAILED` | Teknik hata (`failureReason` alanına bak) |

### Polling Stratejisi

İşlem süresi OpenAI'nin reasoning modeline bağlı olarak **30 saniye ile 3 dakika** arasında değişir.

```
İlk 30 saniye: her 5 saniyede bir
Sonrası: her 10 saniyede bir
Maksimum: 5 dakika (ardından timeout say)
```

`SUCCEEDED` veya `REJECTED` / `FAILED` gelince polling'i durdur.

---

## 5. Sonuç Görseli

`status: SUCCEEDED` olduğunda `resultUrl` alanı dolu gelir. Bu URL presigned bir S3 linki olup **15 dakika** geçerlidir. Görseli bu süre içinde indir veya kendi storage'ına kopyala.

---

## Hata Kodları

Tüm hatalar şu formatta döner:

```json
{
  "error": {
    "code": "IMAGE_REQUIRED",
    "message": "Image file is required"
  }
}
```

| HTTP | code | Açıklama |
|---|---|---|
| 400 | `IMAGE_REQUIRED` | Fotoğraf gönderilmedi |
| 400 | `UNSUPPORTED_IMAGE_FORMAT` | Desteklenmeyen format |
| 400 | `FILE_TOO_LARGE` | 15MB limiti aşıldı |
| 401 | `UNAUTHORIZED` | Token geçersiz veya süresi dolmuş |
| 404 | `PLAYER_NOT_FOUND` | Belirtilen oyuncu bulunamadı |
| 404 | `TEMPLATE_NOT_FOUND` | Belirtilen template bulunamadı |
| 404 | `JOB_NOT_FOUND` | Job bulunamadı |
| 429 | `RATE_LIMIT_EXCEEDED` | Çok fazla istek (15 dakikada 300) |

---

## Örnek: Tam Flow (cURL)

```bash
BASE_URL="http://ec2-3-77-234-1.eu-central-1.compute.amazonaws.com"
CLIENT_TOKEN="gs_client_token_2ec74003c783de5033fedee841deec7ad97a2d194c72d6bf"

# 1. Token al
TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"clientToken\":\"$CLIENT_TOKEN\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 2. Template listesi
curl -s "$BASE_URL/api/v1/players" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. Job oluştur
JOB=$(curl -s -X POST "$BASE_URL/api/v1/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -F "playerSlug=osimhen" \
  -F "templateKey=osimhen:1" \
  -F "image=@/path/to/user-photo.jpg")

JOB_ID=$(echo $JOB | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Job ID: $JOB_ID"

# 4. Status poll (basit döngü)
for i in $(seq 1 30); do
  STATUS=$(curl -s "$BASE_URL/api/v1/jobs/$JOB_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATE=$(echo $STATUS | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "[$i] Status: $STATE"
  if [[ "$STATE" == "SUCCEEDED" || "$STATE" == "REJECTED" || "$STATE" == "FAILED" ]]; then
    echo $STATUS | python3 -m json.tool
    break
  fi
  sleep 10
done
```

---

## Örnek: Tam Flow (JavaScript / fetch)

```javascript
const BASE_URL = 'http://ec2-3-77-234-1.eu-central-1.compute.amazonaws.com';
const CLIENT_TOKEN = 'gs_client_token_2ec74003c783de5033fedee841deec7ad97a2d194c72d6bf';

async function getAccessToken() {
  const res = await fetch(`${BASE_URL}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientToken: CLIENT_TOKEN }),
  });
  const data = await res.json();
  return data.accessToken;
}

async function listPlayers(token) {
  const res = await fetch(`${BASE_URL}/api/v1/players`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function createJob(token, imageFile, playerSlug, templateKey) {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('playerSlug', playerSlug);
  if (templateKey) form.append('templateKey', templateKey);

  const res = await fetch(`${BASE_URL}/api/v1/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json(); // { id, status: 'QUEUED', ... }
}

async function pollJob(token, jobId, { intervalMs = 5000, maxWaitMs = 300000 } = {}) {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const job = await res.json();

    if (['SUCCEEDED', 'REJECTED', 'FAILED'].includes(job.status)) {
      return job;
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error('Job polling timeout');
}

// Kullanım
const token = await getAccessToken();
const players = await listPlayers(token);

const job = await createJob(token, imageFile, 'osimhen', 'osimhen:1');
const result = await pollJob(token, job.id);

if (result.status === 'SUCCEEDED') {
  console.log('Görsel hazır:', result.resultUrl);
} else {
  console.log('Reddedildi:', result.rejectionReason);
}
```

---

## Swagger UI

Tüm endpoint'lerin interaktif dokümantasyonu:

```
http://ec2-3-77-234-1.eu-central-1.compute.amazonaws.com/docs/
```

OpenAPI spec:
- JSON: `/docs/openapi.json`
- YAML: `/docs/openapi.yaml`
