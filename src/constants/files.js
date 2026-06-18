'use strict';

const ALLOWED_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const BLOCKED_MODERATION_CATEGORIES = [
  'Explicit Nudity',
  'Graphic Male Nudity',
  'Graphic Female Nudity',
  'Sexual Activity',
  'Violence',
  'Graphic Violence Or Gore',
  'Physical Violence',
  'Visually Disturbing',
  'Drugs',
  'Hate Symbols',
  'Rude Gestures',
  'Suggestive',
];

module.exports = {
  ALLOWED_MIME_TYPES,
  BLOCKED_MODERATION_CATEGORIES,
};
