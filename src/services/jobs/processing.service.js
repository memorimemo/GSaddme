'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

const config = require('../../config');
const { AppError } = require('../../errors');
const logger = require('../../lib/logger');
const { jobRepository } = require('../../repository');
const { TEMPLATE_ROOT } = require('../templates/sync.service');
const { generateCompositeImage } = require('./openai-image.service');
const { moderateImage } = require('./moderation.service');
const { buildGenerationPrompt } = require('./prompt.service');
const {
  fetchS3ObjectAsBuffer,
  uploadGeneratedImage,
} = require('./storage.service');

// Background removal is currently disabled: the original photo (with background)
// is sent directly to OpenAI so the model can use full scene context for
// realistic compositing.  Re-enable by restoring createSubjectCutout + semaphore.
const BACKGROUND_REMOVAL_ENABLED = false;

async function processJobMessage(jobId, semaphore) {
  const totalStart = Date.now();
  const job = await jobRepository.claimJob(jobId);

  if (!job) {
    logger.warn({ jobId }, 'Job not found or already claimed — skipping');
    return;
  }

  const log = logger.child({
    jobId: job.id,
    playerSlug: job.player?.slug,
    templateKey: job.template?.key,
  });

  log.info('Job processing started');

  try {
    await jobRepository.appendJobEvent(job.id, 'PROCESSING', 'Job claimed by worker');

    // Stage 1: Fetch normalized image from S3
    log.debug({ key: job.normalizedKey }, 'Fetching normalized image from S3');
    const s3FetchStart = Date.now();
    const normalizedInputBuffer = await fetchS3ObjectAsBuffer(job.normalizedKey);
    log.info({ durationMs: Date.now() - s3FetchStart, bytes: normalizedInputBuffer.length }, 'Normalized image fetched from S3');

    // Stage 2: Moderation + template load — in parallel.
    const absoluteTemplatePath = path.join(TEMPLATE_ROOT, job.template.filePath);
    const resolvedTemplatePath = path.resolve(absoluteTemplatePath);
    if (!resolvedTemplatePath.startsWith(path.resolve(TEMPLATE_ROOT) + path.sep)) {
      throw new AppError('Invalid template path', { code: 'INTERNAL_ERROR', statusCode: 500, expose: false });
    }
    const parallelStart = Date.now();
    log.info({
      concurrency: 2,
      backgroundRemoval: BACKGROUND_REMOVAL_ENABLED,
    }, 'Starting parallel stage: moderation + template load');

    const [moderation, templateBuffer] = await Promise.all([

      // 2a: AWS Rekognition moderation
      (async () => {
        const t = Date.now();
        const result = await moderateImage(normalizedInputBuffer);
        log.info({
          durationMs: Date.now() - t,
          approved: result.approved,
          faceCount: result.faceCount,
          ...(result.moderationLabels?.length > 0 && { flaggedLabels: result.moderationLabels }),
        }, 'Moderation completed');
        return result;
      })(),

      // 2b: Template file read (local disk, fast)
      (async () => {
        const t = Date.now();
        const buf = await fs.readFile(resolvedTemplatePath);
        log.debug({
          durationMs: Date.now() - t,
          filePath: job.template.filePath,
          bytes: buf.length,
          width: job.template.width,
          height: job.template.height,
        }, 'Template loaded from disk');
        return buf;
      })(),
    ]);

    log.info({ parallelDurationMs: Date.now() - parallelStart }, 'Parallel stage completed');

    if (!moderation.approved) {
      log.warn({
        reason: moderation.rejectionReason,
        faceCount: moderation.faceCount,
        labels: moderation.moderationLabels,
      }, 'Job rejected by moderation');
      await jobRepository.markJobRejected(
        job.id,
        moderation.rejectionReason,
        moderation.moderationLabels,
        moderation.faceCount,
      );
      return;
    }

    // The subject image sent to OpenAI: original photo (background included).
    // Background removal is currently disabled — original scene context improves
    // realism since the model can use lighting/color cues from the environment.
    const subjectBuffer = normalizedInputBuffer;
    log.debug({ bytes: subjectBuffer.length, backgroundRemoval: false }, 'Using original image as subject (background removal disabled)');

    // Build prompt at processing time so template JSON updates take effect
    // immediately without requiring an API server restart.
    const prompt = buildGenerationPrompt(job.player, job.template);
    log.debug({ promptLength: prompt.length }, 'Prompt built from current template promptHint');

    // Stage 3: OpenAI image generation
    const openaiStart = Date.now();
    log.info({
      outputSize: `${job.template.width}x${job.template.height} → 1024-capped`,
      quality: config.openai.image.quality,
      format: config.openai.image.format,
      background: 'opaque',
      backgroundRemoval: BACKGROUND_REMOVAL_ENABLED,
    }, 'Sending request to OpenAI Responses API');

    // Parse placeholderType from the template's promptHint so the image service
    // knows whether to extend the canvas with a synthetic silhouette.
    // When a customPrompt is present the prompt itself handles placement — skip
    // canvas extension so the original template is sent unmodified to OpenAI.
    let placeholderType = 'silhouette';
    if (job.template.promptHint) {
      try {
        const hint = JSON.parse(job.template.promptHint);
        if (hint.customPrompt) {
          placeholderType = 'silhouette'; // no canvas extension — prompt drives placement
        } else if (hint.placeholderType) {
          placeholderType = hint.placeholderType;
        }
      } catch {
        // Malformed JSON — treat as generic silhouette template
      }
    }

    const generatedBase64 = await generateCompositeImage({
      prompt,
      subjectCutoutBuffer: subjectBuffer,
      templateBuffer,
      templateFileName: job.template.fileName,
      templateMimeType: job.template.mimeType,
      templateWidth: job.template.width,
      templateHeight: job.template.height,
      placeholderType,
    });

    const outputBytes = Math.round(generatedBase64.length * 3 / 4);
    log.info({
      durationMs: Date.now() - openaiStart,
      outputBytes,
      outputKb: Math.round(outputBytes / 1024),
    }, 'OpenAI image generation completed');

    // Stage 4: Upload result to S3
    const uploadStart = Date.now();
    log.debug('Uploading generated image to S3');
    const resultImageKey = await uploadGeneratedImage(generatedBase64, job.id);
    log.info({ durationMs: Date.now() - uploadStart, key: resultImageKey }, 'Result image uploaded to S3');

    await jobRepository.markJobSucceeded(job.id, resultImageKey);

    log.info({
      totalDurationMs: Date.now() - totalStart,
      resultKey: resultImageKey,
    }, 'Job processing completed successfully');
  } catch (error) {
    log.error({
      err: error,
      code: error instanceof AppError ? error.code : undefined,
      totalDurationMs: Date.now() - totalStart,
    }, 'Job processing failed');

    await jobRepository.markJobFailed(
      jobId,
      error instanceof AppError ? error.message : 'Unexpected processing failure',
    );
  }
}

module.exports = {
  processJobMessage,
};
