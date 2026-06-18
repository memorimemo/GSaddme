'use strict';

const sharp = require('sharp');
const openai = require('../../lib/openai');
const config = require('../../config');
const { AppError } = require('../../errors');

// gpt-image-2 arbitrary-resolution constraints
const MIN_SIDE = 640;
const MAX_SIDE = 1024;

function computeOutputSize(width, height) {
  if (!width || !height) return config.openai.image.size;

  // chatgpt-image-latest and gpt-image-1.x only support standard sizes — use auto
  const model = config.openai.image.model;
  if (model === 'chatgpt-image-latest' || model === 'gpt-image-1' || model === 'gpt-image-1.5') {
    return 'auto';
  }

  const aspectRatio = width / height;
  if (aspectRatio < 1 / 3 || aspectRatio > 3) return config.openai.image.size;

  // Scale DOWN to fit within MAX_SIDE
  const scaleDown = Math.min(1, MAX_SIDE / Math.max(width, height));
  let w = Math.round((width * scaleDown) / 16) * 16;
  let h = Math.round((height * scaleDown) / 16) * 16;

  // Scale UP if either dimension is below MIN_SIDE
  const minDim = Math.min(w, h);
  if (minDim < MIN_SIDE) {
    const scaleUp = MIN_SIDE / minDim;
    w = Math.round((w * scaleUp) / 16) * 16;
    h = Math.round((h * scaleUp) / 16) * 16;
  }

  if (w < 16 || h < 16) return config.openai.image.size;

  return `${w}x${h}`;
}

async function scaleTemplateToOutput(templateBuffer, targetWidth, targetHeight) {
  const meta = await sharp(templateBuffer).metadata();
  if (!meta.width || !meta.height) return templateBuffer;
  if (meta.width <= targetWidth && meta.height <= targetHeight) return templateBuffer;

  return sharp(templateBuffer)
    .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * For "open" templates (no built-in silhouette placeholder), extend the canvas
 * horizontally: original player LEFT, dark placeholder RIGHT.
 * Used only for non-customPrompt templates where placement is driven by the
 * scene-aware prompt rather than an explicit instruction.
 */
async function extendWithSilhouette(templateBuffer) {
  const meta = await sharp(templateBuffer).metadata();
  const origW = meta.width;
  const origH = meta.height;
  const newW = origW * 2;

  const templateJpeg = await sharp(templateBuffer)
    .jpeg({ quality: 93 })
    .toBuffer();

  const darkSide = await sharp({
    create: { width: origW, height: origH, channels: 3, background: { r: 8, g: 8, b: 12 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  const extended = await sharp({
    create: { width: newW, height: origH, channels: 3, background: { r: 8, g: 8, b: 12 } },
  })
    .composite([
      { input: templateJpeg, left: 0,     top: 0 },
      { input: darkSide,     left: origW, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer: extended, width: newW, height: origH };
}

async function generateCompositeImage({
  subjectCutoutBuffer,
  prompt,
  templateBuffer,
  templateFileName,
  templateMimeType,
  templateWidth,
  templateHeight,
  placeholderType = 'silhouette',
}) {
  let effectiveTemplate = templateBuffer;
  let effectiveWidth = templateWidth;
  let effectiveHeight = templateHeight;

  // For "open" templates without a custom prompt: extend canvas with dark placeholder
  if (placeholderType === 'open') {
    const extended = await extendWithSilhouette(templateBuffer);
    effectiveTemplate = extended.buffer;
    effectiveWidth = extended.width;
    effectiveHeight = extended.height;
  }

  const outputSize = computeOutputSize(effectiveWidth, effectiveHeight);

  // Downscale template to avoid excessive input token cost when size is fixed
  let scaledTemplate = effectiveTemplate;
  if (outputSize !== 'auto') {
    const [outW, outH] = outputSize.split('x').map(Number);
    scaledTemplate = await scaleTemplateToOutput(effectiveTemplate, outW, outH);
  }

  // Convert buffers to base64 data URLs for the Responses API input_image format
  const templateBase64 = scaledTemplate.toString('base64');
  const subjectBase64 = subjectCutoutBuffer.toString('base64');

  // Detect subject MIME type (normalized images are always JPEG from our pipeline)
  const subjectMime = 'image/jpeg';
  const templateMime = 'image/jpeg';

  // Build image_generation tool config
  const imageGenTool = {
    type: 'image_generation',
    model: config.openai.image.model,
    action: 'edit',
    input_fidelity: config.openai.image.inputFidelity,
    quality: config.openai.image.quality,
    output_format: config.openai.image.format,
    background: config.openai.image.background,
    size: outputSize,
  };

  if (config.openai.image.format === 'jpeg') {
    imageGenTool.output_compression = 85;
  }

  const response = await openai.responses.create({
    model: config.openai.responsesModel,
    // reasoning: matches ChatGPT Pro "comprehensive thinking" — model plans composition
    // deeply before generating: face preservation, proportions, lighting, placement
    reasoning: { effort: config.openai.reasoningEffort },
    input: [{
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: prompt,
        },
        {
          type: 'input_image',
          image_url: `data:${templateMime};base64,${templateBase64}`,
        },
        {
          type: 'input_image',
          image_url: `data:${subjectMime};base64,${subjectBase64}`,
        },
      ],
    }],
    tools: [imageGenTool],
  });

  const imageGenOutputs = (response.output || []).filter(
    (o) => o.type === 'image_generation_call',
  );
  const base64Image = imageGenOutputs[0]?.result;

  if (!base64Image) {
    throw new AppError('OpenAI Responses API image generation returned no output', {
      code: 'OPENAI_IMAGE_EMPTY',
      statusCode: 502,
    });
  }

  return base64Image;
}

module.exports = {
  generateCompositeImage,
};
