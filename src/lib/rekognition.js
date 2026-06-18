'use strict';

const { RekognitionClient } = require('@aws-sdk/client-rekognition');
const config = require('../config');

// Build Rekognition client options
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

module.exports = new RekognitionClient(clientOptions);
