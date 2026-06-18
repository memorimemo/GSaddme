'use strict';

const multer = require('multer');
const config = require('../config');
const { errors } = require('../errors');

/**
 * Multer configuration for file uploads.
 * Files are stored in memory for processing before S3 upload.
 */
const upload = multer({
  limits: {
    fileSize: config.uploads.maxUploadBytes,
  },
  storage: multer.memoryStorage(),
});

/**
 * Error handler middleware for multer errors.
 * Converts multer-specific errors to AppError instances with proper HTTP status codes.
 *
 * @param {Error} err - The error object
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return next(errors.badRequest(
          `File too large. Maximum size is ${Math.round(config.uploads.maxUploadBytes / (1024 * 1024))}MB`,
          'FILE_TOO_LARGE',
        ));
      case 'LIMIT_FILE_COUNT':
        return next(errors.badRequest('Too many files', 'TOO_MANY_FILES'));
      case 'LIMIT_UNEXPECTED_FILE':
        return next(errors.badRequest('Unexpected file field', 'UNEXPECTED_FILE_FIELD'));
      default:
        return next(errors.badRequest(err.message, 'UPLOAD_ERROR'));
    }
  }

  // Not a multer error, pass to next handler
  return next(err);
}

/**
 * Middleware to check if file was uploaded.
 * Use after multer middleware.
 *
 * @param {string} fieldName - The expected field name
 * @returns {Function} Express middleware
 */
function requireFile(fieldName = 'file') {
  return (req, res, next) => {
    if (!req.file) {
      return next(errors.badRequest(`${fieldName} is required`, 'FILE_REQUIRED'));
    }
    return next();
  };
}

module.exports = {
  handleUploadError,
  requireFile,
  upload,
};
