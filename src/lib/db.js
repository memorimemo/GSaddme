'use strict';

const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const separator = config.db.url.includes('?') ? '&' : '?';
const databaseUrl = `${config.db.url}${separator}connection_limit=${config.db.poolSize}&pool_timeout=${config.db.poolTimeout}`;

const prisma = new PrismaClient({
  log: config.server.isDev ? ['warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

module.exports = prisma;
