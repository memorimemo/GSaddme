// k6/worker-load-test.js
// Worker load test - creates jobs and monitors processing
// Run: k6 run --env BASE_URL=https://your-api.com --env CLIENT_TOKEN=your_token k6/worker-load-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import { randomBytes } from 'k6/crypto';

// Custom metrics
const jobCreationErrors = new Rate('job_creation_errors');
const jobCreationDuration = new Trend('job_creation_duration');
const jobsCreated = new Counter('jobs_created');
const jobsSucceeded = new Counter('jobs_succeeded');
const jobsFailed = new Counter('jobs_failed');
const jobProcessingTime = new Trend('job_processing_time');

export const options = {
  scenarios: {
    // Scenario 1: Sustained load - create jobs steadily
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 10,                    // 10 jobs per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
    // Scenario 2: Spike test - sudden burst of jobs
    // spike_test: {
    //   executor: 'ramping-arrival-rate',
    //   startRate: 5,
    //   timeUnit: '1s',
    //   preAllocatedVUs: 100,
    //   maxVUs: 200,
    //   stages: [
    //     { duration: '1m', target: 5 },
    //     { duration: '30s', target: 50 },   // Spike!
    //     { duration: '1m', target: 50 },
    //     { duration: '30s', target: 5 },
    //   ],
    // },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],     // Job creation under 3s
    job_creation_errors: ['rate<0.05'],     // Less than 5% errors
    job_processing_time: ['p(95)<60000'],   // 95% jobs complete in 60s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CLIENT_TOKEN = __ENV.CLIENT_TOKEN;

// Test image - 1x1 red pixel PNG (smallest valid image)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

let accessToken = null;

export function setup() {
  // Get access token
  const tokenRes = http.post(
    `${BASE_URL}/api/v1/auth/token`,
    JSON.stringify({
      clientToken: CLIENT_TOKEN,
      deviceId: `k6-load-test-${Date.now()}`,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(tokenRes, {
    'got access token': (r) => r.status === 200 || r.status === 201,
  });

  if (tokenRes.status !== 200 && tokenRes.status !== 201) {
    console.error(`Failed to get token: ${tokenRes.status} - ${tokenRes.body}`);
    return { accessToken: null };
  }

  const body = JSON.parse(tokenRes.body);
  console.log('Access token obtained successfully');

  return { accessToken: body.accessToken };
}

export default function (data) {
  if (!data.accessToken) {
    console.error('No access token available');
    return;
  }

  group('Create Job', function () {
    // Decode base64 image to binary
    const imageData = encoding.b64decode(TEST_IMAGE_BASE64);

    const fd = new FormData();
    fd.append('image', http.file(imageData, 'test.png', 'image/png'));
    fd.append('playerSlug', 'osimhen');
    fd.append('templateKey', 'osimhen:1');

    const startTime = Date.now();

    const res = http.post(`${BASE_URL}/api/v1/jobs`, fd.body(), {
      headers: {
        'Authorization': `Bearer ${data.accessToken}`,
        'Content-Type': fd.contentType,
      },
      timeout: '30s',
    });

    jobCreationDuration.add(Date.now() - startTime);

    const success = check(res, {
      'job created': (r) => r.status === 201 || r.status === 202,
    });

    if (success) {
      jobsCreated.add(1);

      try {
        const job = JSON.parse(res.body);

        // Poll for job completion (optional - comment out for pure creation load test)
        if (job.id) {
          pollJobStatus(data.accessToken, job.id, startTime);
        }
      } catch (e) {
        console.error(`Failed to parse job response: ${e}`);
      }
    } else {
      jobCreationErrors.add(1);
      console.error(`Job creation failed: ${res.status} - ${res.body}`);
    }
  });

  sleep(0.1);
}

function pollJobStatus(token, jobId, creationTime) {
  const maxPolls = 60;  // Max 60 polls (60 seconds with 1s interval)

  for (let i = 0; i < maxPolls; i++) {
    sleep(1);

    const res = http.get(`${BASE_URL}/api/v1/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (res.status !== 200) continue;

    try {
      const job = JSON.parse(res.body);

      if (job.status === 'SUCCEEDED') {
        jobsSucceeded.add(1);
        jobProcessingTime.add(Date.now() - creationTime);
        return;
      } else if (job.status === 'FAILED' || job.status === 'REJECTED') {
        jobsFailed.add(1);
        jobProcessingTime.add(Date.now() - creationTime);
        return;
      }
      // Still QUEUED or PROCESSING - continue polling
    } catch (e) {
      // Parse error - continue polling
    }
  }

  // Timeout - job didn't complete in time
  jobsFailed.add(1);
  jobProcessingTime.add(Date.now() - creationTime);
}

// Need to import encoding for base64 decode
import encoding from 'k6/encoding';
