'use strict';

const express = require('express');
const { ACTOR_TYPES } = require('../../constants');
const { adminController, jobsController } = require('../../controllers');
const { authenticate, validate } = require('../../middlewares');
const { getJobSchema, listAdminJobsSchema } = require('../../validations');
const asyncHandler = require('../../utils/async-handler');

const router = express.Router();

router.use(authenticate(ACTOR_TYPES.ADMIN));

router.get('/jobs', validate(listAdminJobsSchema), asyncHandler(jobsController.listAdminJobs));
router.get('/jobs/:jobId', validate(getJobSchema), asyncHandler(jobsController.getAdminJob));
router.post('/jobs/:jobId/retry', validate(getJobSchema), asyncHandler(jobsController.retryAdminJob));
router.get('/templates', asyncHandler(adminController.listTemplates));
router.post('/templates/sync', asyncHandler(adminController.syncTemplates));

module.exports = router;
