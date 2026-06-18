'use strict';

const config = require('../config');
const prisma = require('../lib/db');
const { now } = require('../utils/date');
const { OUTBOX_TOPICS, OUTBOX_STATUS } = require('../constants/jobs');
const { updateJobWithEvent } = require('./helpers');

async function createJobWithOutbox(data) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: data.job,
      include: {
        player: true,
        template: true,
      },
    });

    await tx.jobEvent.create({
      data: data.initialEvent(job.id),
    });

    await tx.outboxEvent.create({
      data: data.outbox(job.id),
    });

    return job;
  });
}

async function findByIdempotencyKey(clientAppId, idempotencyKey) {
  return prisma.job.findFirst({
    where: { clientAppId, idempotencyKey },
    include: {
      player: true,
      template: true,
    },
  });
}

async function getClientJobById(jobId, clientAppId) {
  return prisma.job.findFirst({
    where: {
      id: jobId,
      clientAppId,
    },
    include: {
      events: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      player: true,
      template: true,
    },
  });
}

async function getAdminJobById(jobId) {
  return prisma.job.findUnique({
    where: { id: jobId },
    include: {
      clientApp: true,
      events: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      player: true,
      template: true,
    },
  });
}

async function listJobs({ page, pageSize, status }) {
  const where = status ? { status } : undefined;
  const [items, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      include: {
        clientApp: true,
        player: true,
        template: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.job.count({ where }),
  ]);

  return {
    items,
    total,
  };
}

async function claimJob(jobId) {
  const result = await prisma.job.updateMany({
    where: {
      id: jobId,
      status: 'QUEUED',
    },
    data: {
      attemptCount: {
        increment: 1,
      },
      startedAt: now(),
      status: 'PROCESSING',
    },
  });

  if (result.count === 0) {
    return null;
  }

  return prisma.job.findUnique({
    where: { id: jobId },
    include: {
      clientApp: true,
      player: true,
      template: true,
    },
  });
}

async function appendJobEvent(jobId, status, message, meta) {
  return prisma.jobEvent.create({
    data: {
      jobId,
      message,
      meta,
      status,
    },
  });
}

async function markJobSucceeded(jobId, resultImageKey) {
  return updateJobWithEvent(
    jobId,
    {
      completedAt: now(),
      resultImageKey,
      status: 'SUCCEEDED',
    },
    {
      message: 'Image generated successfully',
      status: 'SUCCEEDED',
    },
  );
}

async function markJobRejected(jobId, rejectionReason, moderationLabels, faceCount) {
  return updateJobWithEvent(
    jobId,
    {
      completedAt: now(),
      faceCount,
      moderationLabels,
      rejectionReason,
      status: 'REJECTED',
    },
    {
      message: rejectionReason,
      meta: { faceCount, moderationLabels },
      status: 'REJECTED',
    },
  );
}

async function markJobFailed(jobId, failureReason) {
  return updateJobWithEvent(
    jobId,
    {
      failedAt: now(),
      failureReason,
      status: 'FAILED',
    },
    {
      message: failureReason,
      status: 'FAILED',
    },
  );
}

async function retryJob(jobId) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return null;
    }

    const updatedJob = await tx.job.update({
      where: { id: jobId },
      data: {
        completedAt: null,
        faceCount: null,
        failedAt: null,
        failureReason: null,
        moderationLabels: null,
        queuedAt: now(),
        rejectionReason: null,
        resultImageKey: null,
        startedAt: null,
        status: 'QUEUED',
      },
    });

    await tx.jobEvent.create({
      data: {
        jobId,
        message: 'Job re-queued by admin',
        status: 'QUEUED',
      },
    });

    await tx.outboxEvent.create({
      data: {
        jobId,
        payload: {
          jobId,
        },
        topic: OUTBOX_TOPICS.JOB_QUEUED,
      },
    });

    return updatedJob;
  });
}

async function claimOutboxBatch(limit) {
  return prisma.$queryRaw`
    WITH claimed AS (
      SELECT id
      FROM outbox_events
      WHERE status = 'PENDING'
        AND "availableAt" <= NOW()
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events oe
    SET status = 'PROCESSING',
        "updatedAt" = NOW()
    FROM claimed
    WHERE oe.id = claimed.id
    RETURNING oe.id, oe.topic, oe."jobId" AS "jobId", oe.payload, oe.attempts
  `;
}

async function markOutboxPublished(id) {
  return prisma.outboxEvent.update({
    where: { id },
    data: {
      publishedAt: now(),
      status: OUTBOX_STATUS.PUBLISHED,
    },
  });
}

async function markOutboxBatchPublished(ids) {
  return prisma.outboxEvent.updateMany({
    where: { id: { in: ids } },
    data: {
      publishedAt: now(),
      status: OUTBOX_STATUS.PUBLISHED,
    },
  });
}

async function rescheduleOutbox(id, lastError) {
  const current = await prisma.outboxEvent.findUnique({
    where: { id },
    select: { attempts: true },
  });

  const currentAttempts = current?.attempts ?? 0;
  const nextAttempt = currentAttempts + 1;

  if (nextAttempt >= config.queue.outboxMaxAttempts) {
    return prisma.outboxEvent.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: lastError.slice(0, 1000),
        status: OUTBOX_STATUS.FAILED,
      },
    });
  }

  const delayMs = Math.min(2000 * Math.pow(2, currentAttempts), 300_000);

  return prisma.outboxEvent.update({
    where: { id },
    data: {
      attempts: { increment: 1 },
      availableAt: new Date(Date.now() + delayMs),
      lastError: lastError.slice(0, 1000),
      status: OUTBOX_STATUS.PENDING,
    },
  });
}

module.exports = {
  appendJobEvent,
  claimJob,
  claimOutboxBatch,
  createJobWithOutbox,
  findByIdempotencyKey,
  getAdminJobById,
  getClientJobById,
  listJobs,
  markJobFailed,
  markJobRejected,
  markJobSucceeded,
  markOutboxBatchPublished,
  markOutboxPublished,
  rescheduleOutbox,
  retryJob,
};
