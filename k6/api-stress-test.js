// k6/api-stress-test.js
// API stress test - tests all endpoints under load
// Run: k6 run --env BASE_URL=https://your-api.com --env CLIENT_TOKEN=your_token k6/api-stress-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Ramp up
    { duration: '3m', target: 100 },   // Sustained load
    { duration: '1m', target: 200 },   // Stress
    { duration: '2m', target: 200 },   // Hold stress
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% under 2s
    errors: ['rate<0.05'],               // Less than 5% errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CLIENT_TOKEN = __ENV.CLIENT_TOKEN;

let accessToken = null;

export function setup() {
  // Get access token
  const tokenRes = http.post(
    `${BASE_URL}/api/v1/auth/token`,
    JSON.stringify({
      clientToken: CLIENT_TOKEN,
      deviceId: `k6-stress-test-${Date.now()}`,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (tokenRes.status === 200 || tokenRes.status === 201) {
    const body = JSON.parse(tokenRes.body);
    return { accessToken: body.accessToken };
  }

  console.error(`Failed to get token: ${tokenRes.status}`);
  return { accessToken: null };
}

export default function (data) {
  // Health check (no auth required)
  group('Health Check', function () {
    const res = http.get(`${BASE_URL}/health`);
    apiLatency.add(res.timings.duration);

    const success = check(res, {
      'health status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  // Players list
  group('List Players', function () {
    const res = http.get(`${BASE_URL}/api/v1/players`, {
      headers: {
        'Authorization': `Bearer ${data.accessToken}`,
      },
    });
    apiLatency.add(res.timings.duration);

    const success = check(res, {
      'players status 200': (r) => r.status === 200,
      'players is array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body);
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!success);
  });

  // Token refresh
  group('Token Refresh', function () {
    const res = http.post(
      `${BASE_URL}/api/v1/auth/token`,
      JSON.stringify({
        clientToken: CLIENT_TOKEN,
        deviceId: `k6-stress-${__VU}-${__ITER}`,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    apiLatency.add(res.timings.duration);

    const success = check(res, {
      'token status 200/201': (r) => r.status === 200 || r.status === 201,
    });
    errorRate.add(!success);
  });

  sleep(0.5);
}

export function teardown(data) {
  console.log('Stress test completed');
}
