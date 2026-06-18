'use strict';

const { RekognitionClient } = require('@aws-sdk/client-rekognition');
const config = require('../config');

module.exports = new RekognitionClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});
