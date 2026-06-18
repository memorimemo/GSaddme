'use strict';

const prisma = require('../lib/db');

async function upsertPlayerWithTemplates({ displayName, slug, templates }) {
  return prisma.$transaction(async (tx) => {
    const player = await tx.player.upsert({
      where: { slug },
      update: {
        displayName,
        isActive: true,
      },
      create: {
        displayName,
        slug,
      },
    });

    const seenChecksums = [];

    for (const template of templates) {
      seenChecksums.push(template.checksum);
      await tx.template.upsert({
        where: { key: template.key },
        update: {
          checksum: template.checksum,
          fileName: template.fileName,
          filePath: template.filePath,
          height: template.height,
          isActive: true,
          mimeType: template.mimeType,
          playerId: player.id,
          promptHint: template.promptHint ?? null,
          variantName: template.variantName,
          width: template.width,
        },
        create: {
          ...template,
          playerId: player.id,
        },
      });
    }

    await tx.template.updateMany({
      where: {
        playerId: player.id,
        checksum: {
          notIn: seenChecksums.length > 0 ? seenChecksums : ['__none__'],
        },
      },
      data: {
        isActive: false,
      },
    });

    return player;
  });
}

async function findPlayerBySlug(slug) {
  return prisma.player.findFirst({
    where: {
      slug,
      isActive: true,
    },
    include: {
      templates: {
        where: {
          isActive: true,
        },
        orderBy: {
          variantName: 'asc',
        },
      },
    },
  });
}

async function findTemplateByKey(key) {
  return prisma.template.findUnique({
    where: { key },
    include: {
      player: true,
    },
  });
}

async function listTemplates() {
  return prisma.template.findMany({
    include: {
      player: true,
    },
    orderBy: [
      { player: { slug: 'asc' } },
      { variantName: 'asc' },
    ],
  });
}

async function listActivePlayers() {
  return prisma.player.findMany({
    where: { isActive: true },
    include: {
      templates: {
        where: { isActive: true },
        orderBy: { variantName: 'asc' },
        select: {
          key: true,
          variantName: true,
          width: true,
          height: true,
          mimeType: true,
          filePath: true,
        },
      },
    },
    orderBy: { displayName: 'asc' },
  });
}

module.exports = {
  findPlayerBySlug,
  findTemplateByKey,
  listActivePlayers,
  listTemplates,
  upsertPlayerWithTemplates,
};
