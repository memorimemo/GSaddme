'use strict';

const prisma = require('../lib/db');
const logger = require('../lib/logger');
const { bootstrapDefaultClientApp } = require('../services/auth');
const { syncTemplatesFromDisk } = require('../services/templates/sync.service');

async function main() {
  await prisma.$connect();
  await bootstrapDefaultClientApp();
  const result = await syncTemplatesFromDisk();
  logger.info({ result }, 'Templates synced');
  await prisma.$disconnect();
}

main().catch((error) => {
  logger.error({ err: error }, 'Template sync script failed');
  process.exit(1);
});
