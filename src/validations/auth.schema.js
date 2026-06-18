'use strict';

const { z } = require('zod');

const issueClientTokenSchema = z.object({
  body: z.object({
    clientToken: z.string().min(32),
  }),
  params: z.object({}).default({}),
  query: z.object({}).default({}),
});

const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(32),
  }),
  params: z.object({}).default({}),
  query: z.object({}).default({}),
});

const issueAdminTokenSchema = z.object({
  body: z.object({
    adminToken: z.string().min(32),
  }),
  params: z.object({}).default({}),
  query: z.object({}).default({}),
});

module.exports = {
  issueAdminTokenSchema,
  issueClientTokenSchema,
  refreshTokenSchema,
};
