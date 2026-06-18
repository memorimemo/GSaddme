'use strict';

const prisma = require('../lib/db');
const { now } = require('../utils/date');

/**
 * Repository helper functions for common database operations.
 * These reduce code duplication in repository files by providing
 * reusable transaction patterns.
 */

/**
 * Update a job and create an associated event in a single transaction.
 * This is the most common pattern in job state transitions.
 *
 * @param {string} jobId - The job ID to update
 * @param {object} jobData - Data to update on the job
 * @param {object} eventData - Data for the job event (jobId is added automatically)
 * @returns {Promise<[Job, JobEvent]>}
 */
async function updateJobWithEvent(jobId, jobData, eventData) {
  return prisma.$transaction([
    prisma.job.update({
      where: { id: jobId },
      data: jobData,
    }),
    prisma.jobEvent.create({
      data: {
        jobId,
        ...eventData,
      },
    }),
  ]);
}

/**
 * Mark a job as completed (succeeded/rejected/failed) with an event.
 * Automatically sets the appropriate timestamp field.
 *
 * @param {string} jobId - The job ID
 * @param {'SUCCEEDED' | 'REJECTED' | 'FAILED'} status - Final status
 * @param {object} additionalData - Additional fields to set on the job
 * @param {string} eventMessage - Message for the job event
 * @returns {Promise<[Job, JobEvent]>}
 */
async function completeJobWithEvent(jobId, status, additionalData, eventMessage) {
  const timestamp = now();
  const timestampField = status === 'FAILED' ? 'failedAt' : 'completedAt';

  return updateJobWithEvent(
    jobId,
    {
      status,
      [timestampField]: timestamp,
      ...additionalData,
    },
    {
      status,
      message: eventMessage,
    },
  );
}

/**
 * Create multiple records in a transaction.
 * Useful for batch operations that need atomicity.
 *
 * @param {Array<{model: string, data: object}>} operations - Array of create operations
 * @returns {Promise<any[]>}
 */
async function batchCreate(operations) {
  return prisma.$transaction(
    operations.map((op) => prisma[op.model].create({ data: op.data })),
  );
}

module.exports = {
  batchCreate,
  completeJobWithEvent,
  updateJobWithEvent,
};
