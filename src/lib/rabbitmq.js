'use strict';

const amqp = require('amqplib');
const config = require('../config');
const logger = require('./logger');

let connection = null;
let publishChannel = null;
let consumeChannel = null;

/**
 * Create and configure a new RabbitMQ connection.
 * Handles connection events and automatic cleanup on close.
 */
async function createConnection() {
  const conn = await amqp.connect(config.queue.url);

  conn.on('error', (error) => {
    logger.error({ err: error }, 'RabbitMQ connection error');
  });

  conn.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    connection = null;
    publishChannel = null;
    consumeChannel = null;
  });

  return conn;
}

/**
 * Get or create the RabbitMQ connection.
 */
async function getConnection() {
  if (!connection) {
    connection = await createConnection();
  }
  return connection;
}

/**
 * Ensure exchange and queue topology exists.
 */
async function ensureTopology(channel) {
  await channel.assertExchange(config.queue.exchange, 'direct', { durable: true });
  await channel.assertQueue(config.queue.queue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': `${config.queue.exchange}.dlx`,
    },
  });
  await channel.assertExchange(`${config.queue.exchange}.dlx`, 'direct', { durable: true });
  await channel.assertQueue(`${config.queue.queue}.dlq`, { durable: true });
  await channel.bindQueue(config.queue.queue, config.queue.exchange, config.queue.routingKey);
  await channel.bindQueue(`${config.queue.queue}.dlq`, `${config.queue.exchange}.dlx`, config.queue.routingKey);
}

/**
 * Create a channel with error handling and topology setup.
 */
async function createChannel(conn, type, options = {}) {
  const channel = type === 'confirm'
    ? await conn.createConfirmChannel()
    : await conn.createChannel();

  await ensureTopology(channel);

  if (options.prefetch) {
    await channel.prefetch(options.prefetch);
  }

  channel.on('error', (err) => {
    logger.error({ err, type }, 'RabbitMQ channel error');
  });

  channel.on('close', () => {
    logger.warn({ type }, 'RabbitMQ channel closed');
  });

  return channel;
}

/**
 * Get or create the publish channel (with confirms).
 */
async function getPublishChannel() {
  if (!publishChannel) {
    const conn = await getConnection();
    publishChannel = await createChannel(conn, 'confirm');

    publishChannel.on('close', () => {
      publishChannel = null;
    });
  }
  return publishChannel;
}

/**
 * Get or create the consume channel (with prefetch).
 */
async function getConsumeChannel() {
  if (!consumeChannel) {
    const conn = await getConnection();
    consumeChannel = await createChannel(conn, 'regular', {
      prefetch: config.queue.prefetch,
    });

    consumeChannel.on('close', () => {
      consumeChannel = null;
    });
  }
  return consumeChannel;
}

/**
 * Check if connected to RabbitMQ.
 */
function isConnected() {
  return connection !== null;
}

/**
 * Initialize the connection (alias for getConnection for bootstrap).
 */
async function connect() {
  return getConnection();
}

module.exports = {
  connect,
  getConsumeChannel,
  getPublishChannel,
  isConnected,
};
