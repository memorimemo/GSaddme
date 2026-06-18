'use strict';

/**
 * @typedef {'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED'} JobStatus
 */

/**
 * @typedef {Object} ModerationLabel
 * @property {number} confidence
 * @property {string} name
 * @property {string | null} [parentName]
 */

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} slug
 * @property {string} displayName
 * @property {boolean} isActive
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * @typedef {Object} Template
 * @property {string} id
 * @property {string} playerId
 * @property {string} key
 * @property {string} fileName
 * @property {string} filePath
 * @property {string} variantName
 * @property {string} mimeType
 * @property {string} checksum
 * @property {number} width
 * @property {number} height
 * @property {boolean} isActive
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {Player} [player]
 */

/**
 * @typedef {Object} JobEvent
 * @property {string} id
 * @property {string} jobId
 * @property {JobStatus} status
 * @property {string} message
 * @property {Record<string, any> | null} [meta]
 * @property {Date} createdAt
 */

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} clientAppId
 * @property {string} playerId
 * @property {string} templateId
 * @property {JobStatus} status
 * @property {string | null} prompt
 * @property {string} sourceMimeType
 * @property {string} originalFileName
 * @property {string} inputImageKey
 * @property {string} normalizedKey
 * @property {string | null} [resultImageKey]
 * @property {string | null} [resultUrl]
 * @property {string | null} [rejectionReason]
 * @property {string | null} [failureReason]
 * @property {ModerationLabel[] | null} [moderationLabels]
 * @property {number | null} [faceCount]
 * @property {number} attemptCount
 * @property {Date} queuedAt
 * @property {Date | null} [startedAt]
 * @property {Date | null} [completedAt]
 * @property {Date | null} [failedAt]
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {JobEvent[]} [events]
 * @property {Player} [player]
 * @property {Template} [template]
 */

/**
 * @typedef {Object} JobCreateResponse
 * @property {string} id
 * @property {string} playerSlug
 * @property {JobStatus} status
 * @property {string} templateKey
 */

module.exports = {};
