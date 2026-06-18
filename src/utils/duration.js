'use strict';

const UNITS = {
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000,
};

function parseDurationToMs(value) {
  if (typeof value === 'number') {
    return value;
  }

  const match = /^(\d+)([dhms])$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported duration format: ${value}`);
  }

  return Number(match[1]) * UNITS[match[2]];
}

module.exports = {
  parseDurationToMs,
};
