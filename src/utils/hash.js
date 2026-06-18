'use strict';

const crypto = require('node:crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function randomToken(size = 48) {
  return crypto.randomBytes(size).toString('base64url');
}

module.exports = {
  constantTimeEquals,
  randomToken,
  sha256,
};
