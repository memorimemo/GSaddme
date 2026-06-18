'use strict';

const express = require('express');
const { ACTOR_TYPES } = require('../../constants');
const { jobsController } = require('../../controllers');
const { authenticate, validate } = require('../../middlewares');
const { upload, requireFile, handleUploadError } = require('../../middlewares/upload.middleware');
const { createJobSchema, getJobSchema } = require('../../validations');
const asyncHandler = require('../../utils/async-handler');

const router = express.Router();

router.post(
  '/',
  authenticate(ACTOR_TYPES.CLIENT),
  upload.single('image'),
  handleUploadError,
  requireFile('Image file'),
  validate(createJobSchema),
  asyncHandler(jobsController.createJob),
);

router.get(
  '/:jobId',
  authenticate(ACTOR_TYPES.CLIENT),
  validate(getJobSchema),
  asyncHandler(jobsController.getClientJob),
);

module.exports = router;
