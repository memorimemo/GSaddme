'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const config = require('../config');

module.exports = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});
