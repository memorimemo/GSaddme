# k6 Load Testing Scripts

Bu klasör Grafana k6 ile yük testi scriptlerini içerir.

## Kurulum

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

## Test Scriptleri

### 1. Health Check Load Test

Health endpoint'inin yük altında performansını test eder.

```bash
# Local
k6 run k6/health-check.js

# Remote
k6 run --env BASE_URL=https://your-api.com k6/health-check.js
```

### 2. API Stress Test

Tüm API endpoint'lerini stres altında test eder.

```bash
k6 run \
  --env BASE_URL=https://your-api.com \
  --env CLIENT_TOKEN=your_client_token \
  k6/api-stress-test.js
```

### 3. Worker Load Test (Job Processing)

Worker'ın job işleme kapasitesini test eder.

```bash
k6 run \
  --env BASE_URL=https://your-api.com \
  --env CLIENT_TOKEN=your_client_token \
  k6/worker-load-test.js
```

## Önemli Metrikler

### Worker Load Test

| Metrik | Açıklama |
|--------|----------|
| `jobs_created` | Oluşturulan toplam job sayısı |
| `jobs_succeeded` | Başarıyla tamamlanan job sayısı |
| `jobs_failed` | Başarısız olan job sayısı |
| `job_creation_duration` | Job oluşturma süresi |
| `job_processing_time` | Job'un toplam işlenme süresi |

### Dikkat Edilecekler

1. **OpenAI Rate Limits**: Worker testi yaparken OpenAI API rate limit'lerine dikkat edin
2. **AWS Costs**: S3 ve Rekognition çağrıları maliyetlidir
3. **Database Connections**: Yüksek yük altında PostgreSQL connection pool'u yeterli olmalı

## Örnek Sonuçlar

```
     ✓ job created
     ✓ status is 200

     checks.........................: 98.5% ✓ 1970 ✗ 30
     data_received..................: 2.5 MB  42 kB/s
     data_sent......................: 1.2 MB  20 kB/s
     http_req_duration..............: avg=234ms  min=45ms  max=2.1s  p(95)=890ms
     jobs_created...................: 1000    16.6/s
     jobs_succeeded.................: 950     15.8/s
     job_processing_time............: avg=12.5s  min=8s    max=45s   p(95)=28s
```

## Docker ile Çalıştırma

```bash
docker run -i grafana/k6 run - < k6/health-check.js

# Veya environment variables ile
docker run -i \
  -e BASE_URL=https://your-api.com \
  -e CLIENT_TOKEN=your_token \
  grafana/k6 run - < k6/worker-load-test.js
```
