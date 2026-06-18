'use strict';

const pino = require('pino');
const config = require('../config');

// pino-pretty is a dev dependency — only use it in development
const transport = config.server.isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
        singleLine: false,
      },
    }
  : undefined;

const logger = pino(
  {
    level: config.server.isDev ? 'debug' : 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { pid: process.pid },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-client-token"]',
        'req.body.clientToken',
        'req.body.refreshToken',
        'req.body.adminToken',
      ],
      censor: '[REDACTED]',
    },
  },
  transport ? pino.transport(transport) : undefined,
);

module.exports = logger;
