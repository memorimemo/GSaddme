'use strict';

const crypto = require('node:crypto');
const { AppError } = require('../../errors');
const { OUTBOX_TOPICS } = require('../../constants');
const { jobRepository, templateRepository } = require('../../repository');
const { createResultUrl, uploadJobInput } = require('./storage.service');

function pickTemplate(player, requestedTemplateKey) {
  if (requestedTemplateKey) {
    const selectedTemplate = player.templates.find((template) => template.key === requestedTemplateKey);

    if (!selectedTemplate) {
      throw new AppError('Requested template does not belong to the selected player', {
        code: 'INVALID_TEMPLATE',
        statusCode: 400,
      });
    }

    return selectedTemplate;
  }

  const seed = crypto.randomInt(0, player.templates.length);
  return player.templates[seed];
}

async function enqueueJob({ clientAppId, file, playerSlug, templateKey, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = await jobRepository.findByIdempotencyKey(clientAppId, idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  const player = await templateRepository.findPlayerBySlug(playerSlug);

  if (!player) {
    throw new AppError('Player template set not found', {
      code: 'PLAYER_NOT_FOUND',
      statusCode: 404,
    });
  }

  if (player.templates.length === 0) {
    throw new AppError('No active templates found for player', {
      code: 'NO_ACTIVE_TEMPLATE',
      statusCode: 409,
    });
  }

  const selectedTemplate = pickTemplate(player, templateKey);
  const jobId = crypto.randomUUID();
  const uploadData = await uploadJobInput({
    file,
    jobId,
  });

  // Prompt is built at processing time using the template's current promptHint,
  // so updating a template's JSON sidecar takes effect immediately without
  // requiring an API server restart or re-queuing jobs.
  return jobRepository.createJobWithOutbox({
    job: {
      id: jobId,
      clientAppId,
      idempotencyKey: idempotencyKey ?? null,
      inputImageKey: uploadData.inputImageKey,
      normalizedKey: uploadData.normalizedKey,
      originalFileName: file.originalname,
      playerId: player.id,
      prompt: null,
      sourceMimeType: uploadData.sourceMimeType,
      templateId: selectedTemplate.id,
    },
    initialEvent: (createdJobId) => ({
      jobId: createdJobId,
      message: 'Job queued for moderation and generation',
      status: 'QUEUED',
    }),
    outbox: (createdJobId) => ({
      jobId: createdJobId,
      payload: {
        jobId: createdJobId,
      },
      topic: OUTBOX_TOPICS.JOB_QUEUED,
    }),
  });
}

async function getClientJob(jobId, clientAppId) {
  const job = await jobRepository.getClientJobById(jobId, clientAppId);

  if (!job) {
    throw new AppError('Job not found', {
      code: 'JOB_NOT_FOUND',
      statusCode: 404,
    });
  }

  return enrichJob(job);
}

async function getAdminJob(jobId) {
  const job = await jobRepository.getAdminJobById(jobId);

  if (!job) {
    throw new AppError('Job not found', {
      code: 'JOB_NOT_FOUND',
      statusCode: 404,
    });
  }

  return enrichJob(job);
}

async function listAdminJobs(options) {
  const result = await jobRepository.listJobs(options);
  const items = await Promise.all(result.items.map((job) => enrichJob(job)));

  return {
    items,
    page: options.page,
    pageSize: options.pageSize,
    total: result.total,
  };
}

async function retryJob(jobId) {
  const job = await jobRepository.getAdminJobById(jobId);

  if (!job) {
    throw new AppError('Job not found', {
      code: 'JOB_NOT_FOUND',
      statusCode: 404,
    });
  }

  if (!['FAILED', 'REJECTED'].includes(job.status)) {
    throw new AppError('Only failed or rejected jobs can be retried', {
      code: 'JOB_NOT_RETRYABLE',
      statusCode: 409,
    });
  }

  await jobRepository.retryJob(jobId);
  return getAdminJob(jobId);
}

async function enrichJob(job) {
  if (job.resultImageKey) {
    return {
      ...job,
      resultUrl: await createResultUrl(job.resultImageKey),
    };
  }

  return job;
}

module.exports = {
  enqueueJob,
  getAdminJob,
  getClientJob,
  listAdminJobs,
  retryJob,
};
