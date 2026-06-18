'use strict';

const jobsService = require('../services/jobs/job.service');
const { templateRepository } = require('../repository');

async function listPlayers(req, res) {
  const players = await templateRepository.listActivePlayers();
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.status(200).json(players.map((player) => ({
    slug: player.slug,
    displayName: player.displayName,
    templates: player.templates.map((t) => ({
      key: t.key,
      variantName: t.variantName,
      width: t.width,
      height: t.height,
      mimeType: t.mimeType,
      previewUrl: `${baseUrl}/assets/templates/${t.filePath}`,
    })),
  })));
}

async function createJob(req, res) {
  const job = await jobsService.enqueueJob({
    clientAppId: req.auth.sub,
    file: req.file,
    playerSlug: req.validated.body.playerSlug,
    templateKey: req.validated.body.templateKey,
    idempotencyKey: req.validated.body.idempotencyKey,
  });

  res.status(202).json({
    id: job.id,
    playerSlug: job.player.slug,
    status: job.status,
    templateKey: job.template.key,
  });
}

async function getClientJob(req, res) {
  const job = await jobsService.getClientJob(req.validated.params.jobId, req.auth.sub);
  res.status(200).json({
    id: job.id,
    status: job.status,
    playerSlug: job.player?.slug ?? null,
    templateKey: job.template?.key ?? null,
    ...(job.resultUrl ? { resultUrl: job.resultUrl } : {}),
    ...(job.rejectionReason ? { rejectionReason: job.rejectionReason } : {}),
    ...(job.failureReason ? { failureReason: job.failureReason } : {}),
    queuedAt: job.queuedAt,
    completedAt: job.completedAt ?? null,
  });
}

async function listAdminJobs(req, res) {
  const jobs = await jobsService.listAdminJobs({
    page: req.validated.query.page,
    pageSize: req.validated.query.pageSize,
    status: req.validated.query.status,
  });

  res.status(200).json(jobs);
}

async function getAdminJob(req, res) {
  const job = await jobsService.getAdminJob(req.validated.params.jobId);
  res.status(200).json(job);
}

async function retryAdminJob(req, res) {
  const job = await jobsService.retryJob(req.validated.params.jobId);
  res.status(202).json(job);
}

module.exports = {
  createJob,
  getAdminJob,
  getClientJob,
  listAdminJobs,
  listPlayers,
  retryAdminJob,
};
