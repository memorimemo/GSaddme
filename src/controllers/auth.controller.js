'use strict';

const authService = require('../services/auth');

async function issueClientToken(req, res) {
  const payload = await authService.exchangeClientToken({
    clientToken: req.validated.body.clientToken,
    req,
  });

  res.status(200).json(payload);
}

async function refreshClientToken(req, res) {
  const payload = await authService.refreshClientToken({
    refreshToken: req.validated.body.refreshToken,
    req,
  });

  res.status(200).json(payload);
}

async function issueAdminToken(req, res) {
  const payload = authService.exchangeAdminToken(req.validated.body.adminToken, req);
  res.status(200).json(payload);
}

module.exports = {
  issueAdminToken,
  issueClientToken,
  refreshClientToken,
};
