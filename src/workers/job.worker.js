'use strict';

const config = require('../config');
const prisma = require('../lib/db');
const logger = require('../lib/logger');
const { getConsumeChannel } = require('../lib/rabbitmq');
const { processJobMessage } = require('../services/jobs/processing.service');
const { bootstrapDefaultClientApp } = require('../services/auth');
const Semaphore = require('../utils/semaphore');

let isShuttingDown = false;
let activeJobs = 0;
let consumerTag = null;
let channel = null;

const semaphore = new Semaphore(config.worker.maxConcurrentJobs);

async function bootstrapWorker() {
  logger.info({ maxConcurrentJobs: config.worker.maxConcurrentJobs }, 'Worker bootstrap starting');

  await prisma.$connect();
  logger.debug('Database connected');

  await bootstrapDefaultClientApp();
  logger.debug('Default client app bootstrapped');

  channel = await getConsumeChannel();
  logger.debug({ queue: config.queue.queue, prefetch: config.queue.prefetch }, 'RabbitMQ consume channel ready');

  const { consumerTag: tag } = await channel.consume(
    config.queue.queue,
    (message) => {
      if (!message) {
        logger.warn('Consumer cancelled by broker (null message)');
        return;
      }

      if (isShuttingDown) {
        logger.debug('Rejecting message — worker is shutting down');
        channel.nack(message, false, true);
        return;
      }

      let payload;
      try {
        payload = JSON.parse(message.content.toString('utf8'));
      } catch (error) {
        logger.error({ err: error, raw: message.content.toString('utf8').slice(0, 200) }, 'Invalid queue payload — discarding');
        channel.nack(message, false, false);
        return;
      }

      activeJobs++;
      logger.info({ jobId: payload.jobId, activeJobs }, 'Job dequeued — processing');

      void processJobMessage(payload.jobId, semaphore)
        .then(() => {
          channel.ack(message);
          logger.debug({ jobId: payload.jobId, activeJobs: activeJobs - 1 }, 'Message acknowledged');
        })
        .catch((error) => {
          logger.error({ err: error, jobId: payload.jobId }, 'Worker failed to process job — nacking');
          channel.nack(message, false, false);
        })
        .finally(() => {
          activeJobs--;
        });
    },
    {
      noAck: false,
    },
  );

  consumerTag = tag;
  logger.info({
    queue: config.queue.queue,
    prefetch: config.queue.prefetch,
    maxConcurrentJobs: config.worker.maxConcurrentJobs,
  }, 'Job worker is consuming messages');
}

async function shutdown(signal) {
  logger.info({ signal, activeJobs }, 'Worker shutdown initiated');
  isShuttingDown = true;

  if (channel && consumerTag) {
    try {
      await channel.cancel(consumerTag);
      logger.debug({ consumerTag }, 'Consumer cancelled');
    } catch (err) {
      logger.warn({ err }, 'Failed to cancel consumer');
    }
  }

  if (activeJobs > 0) {
    logger.info({ activeJobs }, 'Waiting for in-flight jobs to complete (30s deadline)');
  }

  const deadline = Date.now() + 30_000;
  while (activeJobs > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (activeJobs > 0) {
    logger.warn({ activeJobs }, 'Shutdown deadline reached — forcing exit with in-flight jobs');
  } else {
    logger.info('All in-flight jobs completed — exiting cleanly');
  }

  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

bootstrapWorker().catch((error) => {
  logger.error({ err: error }, 'Worker bootstrap failed');
  process.exit(1);
});
