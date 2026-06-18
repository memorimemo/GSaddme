'use strict';

const AppError = require('./AppError');

/**
 * Factory functions for creating standardized application errors.
 * Use these instead of creating AppError instances directly to ensure
 * consistent error codes and messages across the codebase.
 */

/**
 * Create a 404 Not Found error
 * @param {string} resource - The resource type (e.g., 'Job', 'Player', 'Template')
 * @returns {AppError}
 */
function notFound(resource) {
  const code = `${resource.toUpperCase().replace(/\s+/g, '_')}_NOT_FOUND`;
  return new AppError(`${resource} not found`, {
    code,
    statusCode: 404,
  });
}

/**
 * Create a 401 Unauthorized error
 * @param {string} [message='Unauthorized'] - Custom error message
 * @param {string} [code='UNAUTHORIZED'] - Custom error code
 * @returns {AppError}
 */
function unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
  return new AppError(message, {
    code,
    statusCode: 401,
  });
}

/**
 * Create a 403 Forbidden error
 * @param {string} [message='Forbidden'] - Custom error message
 * @param {string} [code='FORBIDDEN'] - Custom error code
 * @returns {AppError}
 */
function forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
  return new AppError(message, {
    code,
    statusCode: 403,
  });
}

/**
 * Create a 400 Bad Request error
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {object} [details] - Additional error details
 * @returns {AppError}
 */
function badRequest(message, code, details) {
  return new AppError(message, {
    code,
    statusCode: 400,
    details,
  });
}

/**
 * Create a 409 Conflict error
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @returns {AppError}
 */
function conflict(message, code) {
  return new AppError(message, {
    code,
    statusCode: 409,
  });
}

/**
 * Create a 500 Internal Server Error
 * @param {string} [message='Internal server error'] - Error message
 * @param {string} [code='INTERNAL_ERROR'] - Error code
 * @returns {AppError}
 */
function internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
  return new AppError(message, {
    code,
    statusCode: 500,
    expose: false,
  });
}

/**
 * Create a 502 Bad Gateway error (for external service failures)
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @returns {AppError}
 */
function badGateway(message, code) {
  return new AppError(message, {
    code,
    statusCode: 502,
  });
}

module.exports = {
  badGateway,
  badRequest,
  conflict,
  forbidden,
  internal,
  notFound,
  unauthorized,
};
