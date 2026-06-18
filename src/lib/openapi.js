'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const OPENAPI_ROOT = path.join(process.cwd(), 'docs/openapi');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    return [...target, ...source];
  }

  if (isObject(target) && isObject(source)) {
    const merged = { ...target };

    for (const [key, value] of Object.entries(source)) {
      merged[key] = key in merged ? deepMerge(merged[key], value) : value;
    }

    return merged;
  }

  return source;
}

function listYamlFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...listYamlFiles(absolutePath));
    } else if (entry.isFile() && /\.(yaml|yml)$/i.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function loadOpenApiDocument() {
  const files = listYamlFiles(OPENAPI_ROOT);

  return files.reduce((document, filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(content);
    return deepMerge(document, parsed);
  }, {});
}

function serializeOpenApiYaml(document) {
  return yaml.dump(document, {
    lineWidth: 120,
    noRefs: true,
  });
}

module.exports = {
  loadOpenApiDocument,
  serializeOpenApiYaml,
};
