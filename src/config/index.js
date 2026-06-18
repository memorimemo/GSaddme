'use strict';

const { z } = require('zod');

require('dotenv').config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CLIENT_APP_TOKEN: z.string().min(32, 'CLIENT_APP_TOKEN must be at least 32 characters'),
  CLIENT_APP_SLUG: z.string().min(3).default('default-client-app'),
  CLIENT_APP_NAME: z.string().min(3).default('Default Client App'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  ADMIN_BOOTSTRAP_TOKEN: z.string().min(32, 'ADMIN_BOOTSTRAP_TOKEN must be at least 32 characters'),
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('15m'),

  AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
  // AWS credentials are optional - when running on AWS (ECS/EKS/EC2), IAM roles provide credentials automatically
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().min(1, 'AWS_S3_BUCKET cannot be empty'),
  AWS_PRESIGNED_URL_EXPIRES_IN: z.coerce.number().int().positive().default(900),
  AWS_REKOGNITION_MIN_CONFIDENCE: z.coerce.number().min(0).max(100).default(75),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY cannot be empty'),
  // Outer language model used in responses.create — handles prompt understanding
  OPENAI_RESPONSES_MODEL: z.string().min(1).default('gpt-5.5'),
  // Image generation tool model — chatgpt-image-latest matches ChatGPT Pro quality
  OPENAI_IMAGE_MODEL: z.string().min(1).default('chatgpt-image-latest'),
  OPENAI_IMAGE_SIZE: z.string().default('auto'),
  OPENAI_IMAGE_BACKGROUND: z.string().default('opaque'),
  // input_fidelity: 'high' = preserve facial features from reference images
  OPENAI_IMAGE_INPUT_FIDELITY: z.enum(['high', 'low']).default('high'),
  // reasoning effort — 'high' matches ChatGPT Pro "comprehensive thinking" mode
  OPENAI_REASONING_EFFORT: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('high'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  RABBITMQ_EXCHANGE: z.string().min(1).default('galatasaray.jobs'),
  RABBITMQ_QUEUE: z.string().min(1).default('galatasaray.jobs.image-generate'),
  RABBITMQ_ROUTING_KEY: z.string().min(1).default('jobs.image.generate'),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(30),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_IMAGE_DIMENSION: z.coerce.number().int().positive().default(2048),
  TEMPLATE_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required'),

  WORKER_MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

const env = parsed.data;

// CORS security validation
function parseCorsOrigins(corsEnvValue, nodeEnv) {
  if (corsEnvValue === '*') {
    if (nodeEnv === 'production') {
      console.warn('⚠️  SECURITY WARNING: CORS_ORIGINS=* in production. Set specific origins for production use.');
    }
    return '*';
  }

  const origins = corsEnvValue.split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) {
    console.error('CORS_ORIGINS cannot be empty');
    process.exit(1);
  }
  return origins;
}

module.exports = {
  server: {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    trustProxy: env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? 1 : false),
  },
  db: {
    url: env.DATABASE_URL,
    poolSize: 10,
    poolTimeout: 10,
  },
  redis: {
    url: env.REDIS_URL,
  },
  cors: {
    origins: parseCorsOrigins(env.CORS_ORIGINS, env.NODE_ENV),
  },
  worker: {
    maxConcurrentJobs: env.WORKER_MAX_CONCURRENT_JOBS,
  },
  auth: {
    clientAppToken: env.CLIENT_APP_TOKEN,
    clientAppSlug: env.CLIENT_APP_SLUG,
    clientAppName: env.CLIENT_APP_NAME,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    adminBootstrapToken: env.ADMIN_BOOTSTRAP_TOKEN,
    adminJwtSecret: env.ADMIN_JWT_SECRET,
    adminJwtExpiresIn: env.ADMIN_JWT_EXPIRES_IN,
  },
  aws: {
    region: env.AWS_REGION,
    // Credentials are optional - AWS SDK uses default credential chain (IAM roles, env vars, etc.)
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: env.AWS_S3_BUCKET,
    presignedUrlExpiresIn: env.AWS_PRESIGNED_URL_EXPIRES_IN,
    moderationMinConfidence: env.AWS_REKOGNITION_MIN_CONFIDENCE,
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
    responsesModel: env.OPENAI_RESPONSES_MODEL,
    image: {
      model: env.OPENAI_IMAGE_MODEL,
      size: env.OPENAI_IMAGE_SIZE,
      quality: 'medium', // Hardcoded default
      format: 'jpeg',    // Hardcoded default
      background: env.OPENAI_IMAGE_BACKGROUND,
      inputFidelity: env.OPENAI_IMAGE_INPUT_FIDELITY,
    },
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
  },
  queue: {
    url: env.RABBITMQ_URL,
    exchange: env.RABBITMQ_EXCHANGE,
    queue: env.RABBITMQ_QUEUE,
    routingKey: env.RABBITMQ_ROUTING_KEY,
    prefetch: env.RABBITMQ_PREFETCH,
    outboxBatchSize: env.OUTBOX_BATCH_SIZE,
    outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    outboxMaxAttempts: env.OUTBOX_MAX_ATTEMPTS,
  },
  uploads: {
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    maxImageDimension: env.MAX_IMAGE_DIMENSION,
  },
  templates: {
    syncIntervalMs: env.TEMPLATE_SYNC_INTERVAL_MS,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
};
