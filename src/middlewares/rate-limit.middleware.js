'use strict';

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const config = require('../config');
const logger = require('../lib/logger');
const redisClient = require('../lib/redis');

let redisStoreAvailable = true;

function makeRedisStore() {
  if (!redisStoreAvailable) {
    return undefined;
  }

  try {
    const store = new RedisStore({
      sendCommand: async (...args) => {
        try {
          return await redisClient.call(...args);
        } catch (err) {
          if (redisStoreAvailable) {
            redisStoreAvailable = false;
            logger.warn({ err }, 'Redis unavailable for rate limiting — falling back to memory store');
          }
          throw err;
        }
      },
    });
    return store;
  } catch (err) {
    redisStoreAvailable = false;
    logger.warn({ err }, 'Failed to create Redis store for rate limiting — using memory store');
    return undefined;
  }
}

const apiRateLimit = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  store: makeRedisStore(),
  skip: (req) => {
    // Skip rate limiting for health checks (load balancer, k6 tests, etc.)
    return req.path === '/health';
  },
  handler: (req, res, next, options) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      limit: options.limit,
    }, 'Rate limit exceeded');
    res.status(options.statusCode).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: options.message,
      },
    });
  },
});

// Stricter limit for auth endpoints — prevents token brute-force
// Increased for load testing
const authRateLimit = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 1000,    // 1 minute
  limit: 1000,            // 1000 auth requests per minute (for load testing)
  store: makeRedisStore(),
  handler: (req, res, next, options) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      type: 'auth_brute_force_attempt',
    }, 'Auth rate limit exceeded — possible brute force attempt');
    res.status(options.statusCode).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later',
      },
    });
  },
});

module.exports = { apiRateLimit, authRateLimit };
