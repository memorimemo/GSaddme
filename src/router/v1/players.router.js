'use strict';

const express = require('express');
const { ACTOR_TYPES } = require('../../constants');
const { jobsController } = require('../../controllers');
const { authenticate } = require('../../middlewares');
const asyncHandler = require('../../utils/async-handler');

const router = express.Router();

router.get(
  '/',
  authenticate(ACTOR_TYPES.CLIENT),
  asyncHandler(jobsController.listPlayers),
);

module.exports = router;
