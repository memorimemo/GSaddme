'use strict';

const Redis = require('ioredis');
const config = require('../config');
const logger = require('./logger');

const redisClient = new Redis(config.redis.url, {
  enableReadyCheck: false,
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redisClient.on('error', (err) => logger.error({ err }, 'Redis client error'));
redisClient.on('connect', () => logger.info('Redis connected'));

module.exports = redisClient;
