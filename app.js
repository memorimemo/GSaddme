'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const routerV1 = require('./src/router/v1');
const config = require('./src/config');
const logger = require('./src/lib/logger');
const prisma = require('./src/lib/db');
const redisClient = require('./src/lib/redis');
const { isConnected } = require('./src/lib/rabbitmq');
const { loadOpenApiDocument, serializeOpenApiYaml } = require('./src/lib/openapi');
const { apiRateLimit, errorHandler } = require('./src/middlewares');
const asyncHandler = require('./src/utils/async-handler');

const app = express();
const openApiDocument = loadOpenApiDocument();

// Trust proxy configuration for accurate client IP detection
if (config.server.trustProxy) {
  app.set('trust proxy', config.server.trustProxy);
}

app.disable('x-powered-by');
app.get('/docs/openapi.json', (req, res) => {
  res.status(200).json(openApiDocument);
});
app.get('/docs/openapi.yaml', (req, res) => {
  res.type('application/yaml').send(serializeOpenApiYaml(openApiDocument));
});
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: 'Galatasaray API Docs',
    explorer: true,
    swaggerOptions: {
      displayRequestDuration: true,
      docExpansion: 'list',
      persistAuthorization: true,
    },
  }),
);
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        contentLength: req.headers['content-length'],
        contentType: req.headers['content-type'],
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  }),
);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for Swagger UI external resources
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
app.use(
  cors({
    origin: config.cors.origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/assets/templates', express.static(path.join(__dirname, 'src/assets/templates'), {
  dotfiles: 'deny',
  index: false,
  redirect: false,
}));
app.use(apiRateLimit);

app.get(
  '/health',
  asyncHandler(async (req, res) => {
    const checks = {};
    let healthy = true;

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';
    } catch {
      checks.db = 'error';
      healthy = false;
    }

    try {
      await redisClient.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      healthy = false;
    }

    checks.rabbitmq = isConnected() ? 'ok' : 'degraded';

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }),
);

app.use('/api/v1', routerV1);
app.use(errorHandler);

module.exports = app;
