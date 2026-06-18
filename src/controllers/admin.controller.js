'use strict';

const { templateRepository } = require('../repository');
const { syncTemplatesFromDisk } = require('../services/templates/sync.service');

async function syncTemplates(req, res) {
  const result = await syncTemplatesFromDisk();
  res.status(200).json({
    synced: result,
  });
}

async function listTemplates(req, res) {
  const templates = await templateRepository.listTemplates();
  res.status(200).json(templates);
}

module.exports = {
  listTemplates,
  syncTemplates,
};
