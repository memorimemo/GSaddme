'use strict';

const { AppError } = require('../errors');
const { ACTOR_TYPES } = require('../constants');
const { verifyAdminAccessToken, verifyClientAccessToken } = require('../utils/jwt');

function extractBearerToken(req) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new AppError('Authorization header is required', {
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
  }

  return authorization.slice('Bearer '.length).trim();
}

function authenticate(requiredActorType) {
  return (req, res, next) => {
    try {
      const token = extractBearerToken(req);
      const payload =
        requiredActorType === ACTOR_TYPES.ADMIN
          ? verifyAdminAccessToken(token)
          : verifyClientAccessToken(token);

      if (payload.actorType !== requiredActorType) {
        throw new AppError('Forbidden', {
          code: 'FORBIDDEN',
          statusCode: 403,
        });
      }

      req.auth = payload;
      next();
    } catch (error) {
      next(
        error instanceof AppError
          ? error
          : new AppError('Invalid or expired token', {
              code: 'UNAUTHORIZED',
              statusCode: 401,
            }),
      );
    }
  };
}

module.exports = {
  authenticate,
};
