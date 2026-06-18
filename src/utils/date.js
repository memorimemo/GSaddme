'use strict';

/**
 * Centralized date/time utilities for consistent timestamp generation.
 * Using these helpers ensures consistent date handling across the codebase
 * and makes testing easier (can be mocked in tests).
 */

/**
 * Get current timestamp as Date object
 * @returns {Date}
 */
function now() {
  return new Date();
}

/**
 * Get current timestamp as ISO string
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Get a Date object for a time in the future
 * @param {number} ms - Milliseconds from now
 * @returns {Date}
 */
function fromNow(ms) {
  return new Date(Date.now() + ms);
}

/**
 * Check if a date has passed
 * @param {Date} date - Date to check
 * @returns {boolean}
 */
function isPast(date) {
  return date.getTime() <= Date.now();
}

module.exports = {
  fromNow,
  isPast,
  now,
  nowISO,
};
