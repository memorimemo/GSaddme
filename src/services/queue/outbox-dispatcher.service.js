'use strict';

const config = require('../../config');
const logger = require('../../lib/logger');
const { getPublishChannel } = require('../../lib/rabbitmq');
const { jobRepository } = require('../../repository');

let intervalRef;
let tickInFlight = false;

async function dispatchOutboxBatch() {
  if (tickInFlight) {
    return;
  }

  tickInFlight = true;
  const dispatchStart = Date.now();

  try {
    const events = await jobRepository.claimOutboxBatch(config.queue.outboxBatchSize);
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    logger.debug({ count: events.length }, 'Outbox batch claimed — publishing to RabbitMQ');

    const channel = await getPublishChannel();
    const publishedIds = [];

    for (const event of events) {
      const payload = Buffer.from(JSON.stringify(event.payload));
      channel.publish(config.queue.exchange, config.queue.routingKey, payload, {
        contentType: 'application/json',
        deliveryMode: 2,
        messageId: event.id,
        persistent: true,
        timestamp: Date.now(),
        type: event.topic,
      });
      publishedIds.push(event.id);
    }

    try {
      await channel.waitForConfirms();
      await jobRepository.markOutboxBatchPublished(publishedIds);
      logger.info({ count: publishedIds.length, durationMs: Date.now() - dispatchStart }, 'Outbox batch published and confirmed');
    } catch (error) {
      logger.error({ err: error, count: publishedIds.length }, 'Outbox batch confirm failed — rescheduling all');
      for (const id of publishedIds) {
        await jobRepository.rescheduleOutbox(id, error.message);
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Outbox dispatch tick failed');
  } finally {
    tickInFlight = false;
  }
}

function startOutboxDispatcher() {
  if (intervalRef) {
    return intervalRef;
  }

  intervalRef = setInterval(() => {
    void dispatchOutboxBatch();
  }, config.queue.outboxPollIntervalMs);

  intervalRef.unref?.();
  void dispatchOutboxBatch();

  return intervalRef;
}

function stopOutboxDispatcher() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
}

module.exports = {
  dispatchOutboxBatch,
  startOutboxDispatcher,
  stopOutboxDispatcher,
};
