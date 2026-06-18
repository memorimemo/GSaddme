'use strict';

const { z } = require('zod');

const createJobSchema = z.object({
  body: z.object({
    playerSlug: z.string().min(1),
    templateKey: z.string().min(1).optional(),
    idempotencyKey: z.string().max(128).optional(),
  }),
  params: z.object({}).default({}),
  query: z.object({}).default({}),
});

const getJobSchema = z.object({
  body: z.object({}).default({}),
  params: z.object({
    jobId: z.string().uuid(),
  }),
  query: z.object({}).default({}),
});

const listAdminJobsSchema = z.object({
  body: z.object({}).default({}),
  params: z.object({}).default({}),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REJECTED']).optional(),
  }),
});

module.exports = {
  createJobSchema,
  getJobSchema,
  listAdminJobsSchema,
};
