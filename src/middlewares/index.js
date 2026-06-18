'use strict';

module.exports = {
  ...require('./auth.middleware'),
  errorHandler: require('./error-handler.middleware'),
  ...require('./rate-limit.middleware'),
  ...require('./upload.middleware'),
  validate: require('./validate.middleware'),
};
