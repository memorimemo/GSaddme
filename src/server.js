'use strict';

const app = require('../app');
const config = require('./config');
const prisma = require('./lib/db');
const logger = require('./lib/logger');
const { bootstrapDefaultClientApp } = require('./services/auth');
const { connect: connectRabbitMQ } = require('./lib/rabbitmq');
const { startOutboxDispatcher, stopOutboxDispatcher } = require('./services/queue/outbox-dispatcher.service');
const { syncTemplatesFromDisk } = require('./services/templates/sync.service');

let server;
let templateSyncInterval;

async function bootstrap() {
  await prisma.$connect();
  await connectRabbitMQ();
  await bootstrapDefaultClientApp();
  await syncTemplatesFromDisk();
  startOutboxDispatcher();

  templateSyncInterval = setInterval(() => {
    void syncTemplatesFromDisk().catch((error) => {
      logger.error({ err: error }, 'Template sync failed');
    });
  }, config.templates.syncIntervalMs);

  templateSyncInterval.unref?.();
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down server');

  if (server) {
    server.close();
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
  }

  stopOutboxDispatcher();

  if (templateSyncInterval) {
    clearInterval(templateSyncInterval);
  }

  await prisma.$disconnect();
  process.exit(0);
}

bootstrap()
  .then(() => {
    server = app.listen(config.server.port, () => {
      logger.info({ port: config.server.port }, 'HTTP server listening');
    });

    server.setTimeout(30_000);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Server bootstrap failed');
    process.exit(1);
  });

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
