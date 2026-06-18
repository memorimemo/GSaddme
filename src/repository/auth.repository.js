'use strict';

const prisma = require('../lib/db');

async function findClientAppBySlug(slug) {
  return prisma.clientApp.findUnique({
    where: { slug },
  });
}

async function findActiveClientAppById(id) {
  return prisma.clientApp.findFirst({
    where: {
      id,
      isActive: true,
    },
  });
}

async function upsertClientApp({ name, slug, tokenHash }) {
  return prisma.clientApp.upsert({
    where: { slug },
    update: {
      isActive: true,
      name,
      tokenHash,
    },
    create: {
      name,
      slug,
      tokenHash,
    },
  });
}

async function updateClientLastUsedAt(id) {
  return prisma.clientApp.update({
    where: { id },
    data: {
      lastUsedAt: new Date(),
    },
  });
}

async function createRefreshToken(data) {
  return prisma.refreshToken.create({
    data,
  });
}

async function findRefreshTokenByHash(tokenHash) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      clientApp: true,
    },
  });
}

async function revokeRefreshToken(id) {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

async function rotateRefreshToken({ currentTokenId, newTokenData }) {
  return prisma.$transaction(async (tx) => {
    const nextToken = await tx.refreshToken.create({
      data: newTokenData,
    });

    await tx.refreshToken.update({
      where: { id: currentTokenId },
      data: {
        revokedAt: new Date(),
        replacedById: nextToken.id,
        lastUsedAt: new Date(),
      },
    });

    return nextToken;
  });
}

module.exports = {
  createRefreshToken,
  findActiveClientAppById,
  findClientAppBySlug,
  findRefreshTokenByHash,
  revokeRefreshToken,
  rotateRefreshToken,
  updateClientLastUsedAt,
  upsertClientApp,
};
