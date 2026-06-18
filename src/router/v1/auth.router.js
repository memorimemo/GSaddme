'use strict';

const express = require('express');
const { authController } = require('../../controllers');
const { authRateLimit, validate } = require('../../middlewares');
const { issueAdminTokenSchema, issueClientTokenSchema, refreshTokenSchema } = require('../../validations');
const asyncHandler = require('../../utils/async-handler');

const router = express.Router();

router.post('/token', authRateLimit, validate(issueClientTokenSchema), asyncHandler(authController.issueClientToken));
router.post('/refresh', authRateLimit, validate(refreshTokenSchema), asyncHandler(authController.refreshClientToken));
router.post('/admin/token', authRateLimit, validate(issueAdminTokenSchema), asyncHandler(authController.issueAdminToken));

module.exports = router;
