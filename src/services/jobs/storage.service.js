'use strict';

const path = require('node:path');
const sharp = require('sharp');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const config = require('../../config');
const redisClient = require('../../lib/redis');
const { ALLOWED_MIME_TYPES } = require('../../constants');
const { AppError } = require('../../errors');
const s3Client = require('../../lib/s3');

// file-type v22+ is ESM-only, use dynamic import
let fileTypeFromBuffer;
async function getFileTypeFromBuffer() {
  if (!fileTypeFromBuffer) {
    const module = await import('file-type');
    fileTypeFromBuffer = module.fileTypeFromBuffer;
  }
  return fileTypeFromBuffer;
}

function extForMimeType(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return 'bin';
  }
}

async function sniffMimeType(file) {
  const detectFileType = await getFileTypeFromBuffer();
  const detected = await detectFileType(file.buffer);
  if (!detected) {
    throw new AppError('Unable to detect file type from content. Please ensure the file is a valid image.', {
      code: 'UNDETECTABLE_FILE_TYPE',
      statusCode: 400,
    });
  }
  return detected.mime;
}

async function normalizeUpload(file) {
  const mimeType = await sniffMimeType(file);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AppError('Unsupported image format', {
      code: 'UNSUPPORTED_IMAGE_FORMAT',
      statusCode: 400,
    });
  }

  const transformer = sharp(file.buffer, { limitInputPixels: 4096 * 4096 }).rotate();
  const metadata = await transformer.metadata();
  const normalizedBuffer = await transformer
    .resize({
      fit: 'inside',
      height: config.uploads.maxImageDimension,
      width: config.uploads.maxImageDimension,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return {
    extension: extForMimeType(mimeType),
    height: metadata.height ?? null,
    mimeType,
    normalizedBuffer,
    width: metadata.width ?? null,
  };
}

async function uploadBuffer({ body, contentType, key, metadata }) {
  const upload = new Upload({
    client: s3Client,
    params: {
      Body: body,
      Bucket: config.aws.s3Bucket,
      ContentType: contentType,
      Key: key,
      Metadata: metadata,
    },
  });

  await upload.done();

  return key;
}

async function createResultUrl(key) {
  const cacheKey = `presigned:${key}`;

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) return cached;
  } catch {
    // Redis unavailable — fall through to generate fresh URL
  }

  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: key,
    }),
    {
      expiresIn: config.aws.presignedUrlExpiresIn,
    },
  );

  try {
    const ttl = config.aws.presignedUrlExpiresIn - 120;
    if (ttl > 0) {
      await redisClient.setex(cacheKey, ttl, url);
    }
  } catch {
    // Redis unavailable — URL still returned uncached
  }

  return url;
}

async function uploadGeneratedImage(base64Image, jobId) {
  const body = Buffer.from(base64Image, 'base64');
  const key = `results/${jobId}/result.${config.openai.image.format}`;

  await uploadBuffer({
    body,
    contentType: `image/${config.openai.image.format}`,
    key,
    metadata: {
      kind: 'generated-result',
      jobId,
    },
  });

  return key;
}

async function uploadJobInput({ file, jobId }) {
  const normalized = await normalizeUpload(file);
  const originalKey = `uploads/raw/${jobId}/source.${normalized.extension}`;
  const normalizedKey = `uploads/normalized/${jobId}/source.png`;

  await uploadBuffer({
    body: file.buffer,
    contentType: normalized.mimeType,
    key: originalKey,
    metadata: {
      kind: 'raw-input',
      jobId,
      originalFileName: path.basename(file.originalname),
    },
  });

  await uploadBuffer({
    body: normalized.normalizedBuffer,
    contentType: 'image/png',
    key: normalizedKey,
    metadata: {
      kind: 'normalized-input',
      jobId,
    },
  });

  return {
    inputImageKey: originalKey,
    normalizedKey,
    sourceMimeType: normalized.mimeType,
  };
}

async function fetchS3ObjectAsBuffer(key) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: key,
    }),
  );

  return Buffer.from(await response.Body.transformToByteArray());
}

module.exports = {
  createResultUrl,
  fetchS3ObjectAsBuffer,
  normalizeUpload,
  uploadGeneratedImage,
  uploadJobInput,
};
