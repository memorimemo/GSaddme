'use strict';

const OpenAI = require('openai');
const config = require('../config');

module.exports = new OpenAI({
  apiKey: config.openai.apiKey,
});
