'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const config = require('../config');

// Build S3 client options
const clientOptions = {
  region: config.aws.region,
};

// In development mode, use explicit credentials from .env file
// In production mode, rely on IAM roles (ECS/EKS/EC2 instance roles)
if (!config.server.isProd && config.aws.accessKeyId && config.aws.secretAccessKey) {
  clientOptions.credentials = {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  };
}

module.exports = new S3Client(clientOptions);
