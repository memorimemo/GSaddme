// k6/health-check.js
// Health endpoint load test
// Run: k6 run k6/health-check.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const healthCheckDuration = new Trend('health_check_duration');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 200 },  // Spike to 200 users
    { duration: '1m', target: 200 },   // Stay at 200 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests should be below 500ms
    errors: ['rate<0.01'],              // Error rate should be below 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/health`);

  healthCheckDuration.add(res.timings.duration);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has status ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok';
      } catch {
        return false;
      }
    },
    'db check passed': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.checks?.db === 'ok';
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(0.1);
}
