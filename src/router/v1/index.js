'use strict';

const express = require('express');
const adminRouter = require('./admin.router');
const authRouter = require('./auth.router');
const jobsRouter = require('./jobs.router');
const playersRouter = require('./players.router');

const router = express.Router();

router.use('/auth', authRouter);
router.use('/players', playersRouter);
router.use('/jobs', jobsRouter);
router.use('/admin', adminRouter);

module.exports = router;
