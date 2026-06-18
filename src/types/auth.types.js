'use strict';

/**
 * @typedef {Object} ClientAccessTokenResponse
 * @property {string} accessToken
 * @property {string} expiresIn
 * @property {string} refreshToken
 * @property {string} tokenType
 */

/**
 * @typedef {Object} AdminAccessTokenResponse
 * @property {string} accessToken
 * @property {string} expiresIn
 * @property {string} tokenType
 */

/**
 * @typedef {Object} AuthenticatedClient
 * @property {string} sub
 * @property {'CLIENT'} actorType
 * @property {'access'} tokenType
 * @property {number} iat
 * @property {number} exp
 * @property {string} aud
 * @property {string} iss
 */

/**
 * @typedef {Object} AuthenticatedAdmin
 * @property {string} sub
 * @property {'ADMIN'} actorType
 * @property {'access'} tokenType
 * @property {number} iat
 * @property {number} exp
 * @property {string} aud
 * @property {string} iss
 */

module.exports = {};
