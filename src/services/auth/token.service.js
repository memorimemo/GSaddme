'use strict';

const config = require('../../config');
const { AppError } = require('../../errors');
const logger = require('../../lib/logger');
const { logAuthSuccess, logAuthFailure, logSuspiciousTokenRefresh, logAdminAction } = require('../../lib/audit-logger');
const { authRepository } = require('../../repository');
const { getClientIp } = require('../../utils/http');
const { constantTimeEquals, randomToken, sha256 } = require('../../utils/hash');
const { signAdminAccessToken, signClientAccessToken } = require('../../utils/jwt');
const { parseDurationToMs } = require('../../utils/duration');
const { fromNow, isPast } = require('../../utils/date');

async function bootstrapDefaultClientApp() {
  return authRepository.upsertClientApp({
    name: config.auth.clientAppName,
    slug: config.auth.clientAppSlug,
    tokenHash: sha256(config.auth.clientAppToken),
  });
}

async function exchangeClientToken({ clientToken, req }) {
  const clientApp = await authRepository.findClientAppBySlug(config.auth.clientAppSlug);
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] ?? null;

  if (!clientApp || !clientApp.isActive || !constantTimeEquals(clientApp.tokenHash, sha256(clientToken))) {
    logAuthFailure({
      reason: !clientApp ? 'CLIENT_NOT_FOUND' : !clientApp.isActive ? 'CLIENT_INACTIVE' : 'INVALID_TOKEN',
      ip: clientIp,
      userAgent,
      method: 'client_token_exchange',
      clientAppSlug: config.auth.clientAppSlug,
    });
    throw new AppError('Invalid client token', {
      code: 'INVALID_CLIENT_TOKEN',
      statusCode: 401,
    });
  }

  const refreshToken = randomToken(64);
  const refreshTokenHash = sha256(refreshToken);
  const expiresAt = fromNow(parseDurationToMs(config.auth.jwtRefreshExpiresIn));

  // Run independent DB operations in parallel for better performance
  await Promise.all([
    authRepository.createRefreshToken({
      clientAppId: clientApp.id,
      expiresAt,
      ipAddress: clientIp,
      tokenHash: refreshTokenHash,
      userAgent,
    }),
    authRepository.updateClientLastUsedAt(clientApp.id),
  ]);

  logAuthSuccess({
    actorType: 'CLIENT',
    clientAppId: clientApp.id,
    ip: clientIp,
    userAgent,
    method: 'client_token_exchange',
  });

  return {
    accessToken: signClientAccessToken(clientApp.id),
    expiresIn: config.auth.jwtExpiresIn,
    refreshToken,
    tokenType: 'Bearer',
  };
}

async function refreshClientToken({ refreshToken, req }) {
  const refreshTokenHash = sha256(refreshToken);
  const currentToken = await authRepository.findRefreshTokenByHash(refreshTokenHash);
  const currentIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] ?? null;

  if (!currentToken || currentToken.revokedAt || isPast(currentToken.expiresAt)) {
    logAuthFailure({
      reason: !currentToken ? 'TOKEN_NOT_FOUND' : currentToken.revokedAt ? 'TOKEN_REVOKED' : 'TOKEN_EXPIRED',
      ip: currentIp,
      userAgent,
      method: 'refresh_token',
    });
    throw new AppError('Invalid refresh token', {
      code: 'INVALID_REFRESH_TOKEN',
      statusCode: 401,
    });
  }

  if (!currentToken.clientApp.isActive) {
    logAuthFailure({
      reason: 'CLIENT_INACTIVE',
      ip: currentIp,
      userAgent,
      method: 'refresh_token',
      clientAppSlug: currentToken.clientApp.slug,
    });
    throw new AppError('Client app is inactive', {
      code: 'CLIENT_DISABLED',
      statusCode: 403,
    });
  }

  // Revoke and reject if the token is used from a different IP than it was issued to.
  // Mobile clients may roam — if this causes friction, downgrade to warn-only.
  if (currentToken.ipAddress && currentToken.ipAddress !== currentIp) {
    await authRepository.revokeRefreshToken(currentToken.id);
    logSuspiciousTokenRefresh({
      tokenId: currentToken.id,
      originalIp: currentToken.ipAddress,
      newIp: currentIp,
      userAgent,
    });
    logger.warn(
      { tokenId: currentToken.id, issuedIp: currentToken.ipAddress, requestIp: currentIp },
      'Refresh token IP mismatch — token revoked',
    );
    throw new AppError('Invalid refresh token', {
      code: 'INVALID_REFRESH_TOKEN',
      statusCode: 401,
    });
  }

  const nextRefreshToken = randomToken(64);
  const nextRefreshTokenHash = sha256(nextRefreshToken);
  const expiresAt = fromNow(parseDurationToMs(config.auth.jwtRefreshExpiresIn));

  // Run independent DB operations in parallel for better performance
  await Promise.all([
    authRepository.rotateRefreshToken({
      currentTokenId: currentToken.id,
      newTokenData: {
        clientAppId: currentToken.clientAppId,
        expiresAt,
        ipAddress: currentIp,
        tokenHash: nextRefreshTokenHash,
        userAgent,
      },
    }),
    authRepository.updateClientLastUsedAt(currentToken.clientAppId),
  ]);

  logAuthSuccess({
    actorType: 'CLIENT',
    clientAppId: currentToken.clientAppId,
    ip: currentIp,
    userAgent,
    method: 'refresh_token',
  });

  return {
    accessToken: signClientAccessToken(currentToken.clientAppId),
    expiresIn: config.auth.jwtExpiresIn,
    refreshToken: nextRefreshToken,
    tokenType: 'Bearer',
  };
}

function exchangeAdminToken(adminToken, req) {
  const clientIp = req ? getClientIp(req) : 'unknown';
  const userAgent = req?.headers?.['user-agent'] ?? null;

  if (!constantTimeEquals(sha256(adminToken), sha256(config.auth.adminBootstrapToken))) {
    logAuthFailure({
      reason: 'INVALID_ADMIN_TOKEN',
      ip: clientIp,
      userAgent,
      method: 'admin_token_exchange',
    });
    throw new AppError('Invalid admin token', {
      code: 'INVALID_ADMIN_TOKEN',
      statusCode: 401,
    });
  }

  logAdminAction({
    action: 'ADMIN_LOGIN',
    adminId: 'bootstrap-admin',
    ip: clientIp,
    userAgent,
    details: { method: 'admin_token_exchange' },
  });

  return {
    accessToken: signAdminAccessToken(),
    expiresIn: config.auth.adminJwtExpiresIn,
    tokenType: 'Bearer',
  };
}

module.exports = {
  bootstrapDefaultClientApp,
  exchangeAdminToken,
  exchangeClientToken,
  refreshClientToken,
};
