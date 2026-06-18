'use strict';

const { ZodError } = require('zod');
const { AppError } = require('../errors');
const config = require('../config');
const logger = require('../lib/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    // In production, only expose field names, not values or detailed messages
    const details = config.server.isProd
      ? { fields: [...new Set(err.issues.map((i) => i.path.join('.')))] }
      : err.flatten();

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        details,
        message: 'Request validation failed',
      },
    });
  }

  const appError =
    err instanceof AppError
      ? err
      : new AppError('Unexpected server error', {
          code: 'INTERNAL_ERROR',
          expose: false,
          statusCode: 500,
        });

  logger.error(
    {
      code: appError.code,
      err,
      path: req.path,
      requestId: req.id,
    },
    appError.message,
  );

  return res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      details: appError.expose ? appError.details : undefined,
      message: appError.expose ? appError.message : 'Internal server error',
    },
  });
}

module.exports = errorHandler;
