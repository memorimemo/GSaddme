'use strict';

const pino = require('pino');
const { nowISO } = require('../utils/date');

/**
 * Security-focused audit logger for tracking authentication events,
 * authorization failures, and other security-relevant activities.
 *
 * Events are logged at 'info' level but tagged with event types for
 * easy filtering in log aggregation systems.
 */
const auditLogger = pino({
  level: 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    service: 'galatasaray-api',
    logType: 'security-audit',
  },
  redact: {
    paths: [
      'token',
      'password',
      'secret',
      'authorization',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Base function for logging security events.
 * Automatically adds timestamp to all events.
 *
 * @param {string} event - Event type identifier
 * @param {'info' | 'warn' | 'error'} level - Log level
 * @param {object} data - Event data
 */
function logSecurityEvent(event, level, data) {
  auditLogger[level]({
    event,
    ...data,
    timestamp: nowISO(),
  });
}

/**
 * Log a successful authentication event
 */
function logAuthSuccess({ actorType, clientAppId, ip, userAgent, method }) {
  logSecurityEvent('AUTH_SUCCESS', 'info', {
    actorType,
    clientAppId,
    ip,
    userAgent,
    method,
  });
}

/**
 * Log a failed authentication attempt
 */
function logAuthFailure({ reason, ip, userAgent, method, clientAppSlug }) {
  logSecurityEvent('AUTH_FAILURE', 'warn', {
    reason,
    ip,
    userAgent,
    method,
    clientAppSlug,
  });
}

/**
 * Log an admin action
 */
function logAdminAction({ action, adminId, ip, userAgent, details }) {
  logSecurityEvent('ADMIN_ACTION', 'info', {
    action,
    adminId,
    ip,
    userAgent,
    details,
  });
}

/**
 * Log a rate limit breach
 */
function logRateLimitBreach({ ip, path, limit, windowMs }) {
  logSecurityEvent('RATE_LIMIT_BREACH', 'warn', {
    ip,
    path,
    limit,
    windowMs,
  });
}

/**
 * Log a token refresh with IP change (suspicious activity)
 */
function logSuspiciousTokenRefresh({ tokenId, originalIp, newIp, userAgent }) {
  logSecurityEvent('SUSPICIOUS_TOKEN_REFRESH', 'warn', {
    tokenId,
    originalIp,
    newIp,
    userAgent,
  });
}

/**
 * Log a moderation rejection
 */
function logModerationRejection({ jobId, reason, labels, clientAppId }) {
  logSecurityEvent('MODERATION_REJECTION', 'info', {
    jobId,
    reason,
    labels,
    clientAppId,
  });
}

module.exports = {
  auditLogger,
  logAdminAction,
  logAuthFailure,
  logAuthSuccess,
  logModerationRejection,
  logRateLimitBreach,
  logSecurityEvent,
  logSuspiciousTokenRefresh,
};
