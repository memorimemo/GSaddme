'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { templateRepository } = require('../../repository');

const TEMPLATE_ROOT = path.join(__dirname, '../../assets/templates');

// Image extensions accepted as template files. JSON sidecars and other files are ignored.
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function toDisplayName(slug) {
  return slug
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function listDirectories(rootPath) {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

/**
 * Try to load scene metadata from a sidecar JSON file placed next to the image.
 * For `icardi/template-5.jpg`, looks for `icardi/template-5.json`.
 * Returns null silently when no sidecar exists or when the JSON is malformed.
 */
async function loadSidecarPromptHint(imagePath) {
  const sidecarPath = imagePath.replace(/\.[^.]+$/, '.json');
  try {
    const raw = await fs.readFile(sidecarPath, 'utf8');
    JSON.parse(raw); // validate — will throw if malformed
    return raw;
  } catch {
    return null;
  }
}

async function readTemplateFiles(playerSlug) {
  const playerPath = path.join(TEMPLATE_ROOT, playerSlug);
  const entries = await fs.readdir(playerPath, { withFileTypes: true });

  // Only process recognised image extensions; sidecar .json and other files are skipped.
  const imageFiles = entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();

  const templates = [];

  for (const fileName of imageFiles) {
    const absolutePath = path.join(playerPath, fileName);
    const fileBuffer = await fs.readFile(absolutePath);
    const metadata = await sharp(fileBuffer).metadata();
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const parsedPath = path.parse(fileName);
    const variantName = parsedPath.name;

    const promptHint = await loadSidecarPromptHint(absolutePath);

    templates.push({
      checksum,
      fileName,
      filePath: path.join(playerSlug, fileName),
      height: metadata.height ?? 0,
      key: `${playerSlug}:${variantName}`,
      mimeType: `image/${metadata.format ?? parsedPath.ext.replace('.', '')}`,
      promptHint,
      variantName,
      width: metadata.width ?? 0,
    });
  }

  return templates;
}

async function syncTemplatesFromDisk() {
  const playerSlugs = await listDirectories(TEMPLATE_ROOT);
  const syncedPlayers = [];

  for (const playerSlug of playerSlugs) {
    const templates = await readTemplateFiles(playerSlug);
    if (templates.length === 0) {
      continue;
    }

    const player = await templateRepository.upsertPlayerWithTemplates({
      displayName: toDisplayName(playerSlug),
      slug: playerSlug,
      templates,
    });

    syncedPlayers.push({
      playerId: player.id,
      playerSlug,
      templateCount: templates.length,
    });
  }

  return syncedPlayers;
}

module.exports = {
  TEMPLATE_ROOT,
  syncTemplatesFromDisk,
};
