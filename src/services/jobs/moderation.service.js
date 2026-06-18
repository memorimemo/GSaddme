'use strict';

const { DetectFacesCommand, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const config = require('../../config');
const { BLOCKED_MODERATION_CATEGORIES } = require('../../constants');
const rekognitionClient = require('../../lib/rekognition');

function extractRejectedLabels(labels) {
  const blocked = [];

  for (const label of labels) {
    const names = [label.Name, label.ParentName].filter(Boolean);
    const matched = names.some((name) => BLOCKED_MODERATION_CATEGORIES.includes(name));

    if (matched && label.Confidence >= config.aws.moderationMinConfidence) {
      blocked.push({
        confidence: label.Confidence,
        name: label.Name,
        parentName: label.ParentName,
      });
    }
  }

  return blocked;
}

async function moderateImage(buffer) {
  const [moderationResponse, faceResponse] = await Promise.all([
    rekognitionClient.send(
      new DetectModerationLabelsCommand({
        Image: {
          Bytes: buffer,
        },
        MinConfidence: config.aws.moderationMinConfidence,
      }),
    ),
    rekognitionClient.send(
      new DetectFacesCommand({
        Attributes: ['DEFAULT'],
        Image: {
          Bytes: buffer,
        },
      }),
    ),
  ]);

  const labels = moderationResponse.ModerationLabels ?? [];
  const rejectedLabels = extractRejectedLabels(labels);
  const faceCount = faceResponse.FaceDetails?.length ?? 0;

  if (faceCount !== 1) {
    return {
      approved: false,
      faceCount,
      moderationLabels: rejectedLabels,
      rejectionReason:
        faceCount === 0
          ? 'Image must contain exactly one clearly visible face'
          : 'Image must contain only one person',
    };
  }

  if (rejectedLabels.length > 0) {
    return {
      approved: false,
      faceCount,
      moderationLabels: rejectedLabels,
      rejectionReason: 'Image failed moderation checks',
    };
  }

  return {
    approved: true,
    faceCount,
    moderationLabels: [],
  };
}

module.exports = {
  moderateImage,
};
