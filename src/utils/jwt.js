'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { ACTOR_TYPES, TOKEN_TYPES } = require('../constants');

function signClientAccessToken(clientAppId) {
  return jwt.sign(
    {
      actorType: ACTOR_TYPES.CLIENT,
      tokenType: TOKEN_TYPES.ACCESS,
      jti: crypto.randomUUID(),
    },
    config.auth.jwtSecret,
    {
      audience: 'galatasaray-api',
      expiresIn: config.auth.jwtExpiresIn,
      issuer: 'galatasaray-api',
      subject: clientAppId,
    },
  );
}

function signAdminAccessToken() {
  return jwt.sign(
    {
      actorType: ACTOR_TYPES.ADMIN,
      tokenType: TOKEN_TYPES.ACCESS,
      jti: crypto.randomUUID(),
    },
    config.auth.adminJwtSecret,
    {
      audience: 'galatasaray-api-admin',
      expiresIn: config.auth.adminJwtExpiresIn,
      issuer: 'galatasaray-api',
      subject: 'admin',
    },
  );
}

function verifyClientAccessToken(token) {
  return jwt.verify(token, config.auth.jwtSecret, {
    audience: 'galatasaray-api',
    issuer: 'galatasaray-api',
  });
}

function verifyAdminAccessToken(token) {
  return jwt.verify(token, config.auth.adminJwtSecret, {
    audience: 'galatasaray-api-admin',
    issuer: 'galatasaray-api',
  });
}

module.exports = {
  signAdminAccessToken,
  signClientAccessToken,
  verifyAdminAccessToken,
  verifyClientAccessToken,
};
