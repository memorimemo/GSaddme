'use strict';

/**
 * Builds the OpenAI image generation prompt for a given job.
 *
 * Scene context is loaded from a per-template JSON sidecar file at sync time
 * and stored in template.promptHint. To add a new template, place a .json file
 * alongside the image (e.g. osimhen/3.json) and re-run the template sync.
 * No code changes are required.
 *
 * JSON sidecar schema:
 *   sceneContext       — what is happening in the photo and where
 *   existingCharacters — who is already in the template and must not be altered
 *   placeholderType    — "silhouette" (explicit dark cutout) | "open" (no cutout)
 *   userPlacement      — exact position and pose the user should take
 *   lightingNotes      — specific lighting cues for the inserted subject
 */

/**
 * Proportion rules appended to every prompt regardless of template type.
 * Ensures the inserted person is composited at the correct scale and depth —
 * they should feel like a natural second player, NOT a foreground subject.
 */
const PROPORTION_RULES = [
  'SCALE AND PROPORTION (critical):',
  '- The inserted person must match the EXACT SAME SCALE as the existing player in the template.',
  '- Their head size, body height, and limb proportions must be visually consistent with the player standing next to them.',
  '- Do NOT make the inserted person appear larger, closer, or more prominent than the existing player.',
  '- Both people should occupy the same depth plane — same distance from the camera, same perspective.',
  '- If the existing player appears at a certain height in the frame, the inserted person must be at the same height.',
  '- The goal is a NATURAL GROUP PHOTO of two equals — not a portrait of one person placed in front of a scene.',
].join('\n');

function buildGenerationPrompt(player, template) {
  const scene = parsePromptHint(template.promptHint);

  // Template-specific custom prompt takes full priority
  if (scene?.customPrompt && typeof scene.customPrompt === 'string' && scene.customPrompt.length > 0) {
    return scene.customPrompt;
  }

  if (scene) {
    return buildSceneAwarePrompt(scene);
  }

  return buildFallbackPrompt(player, template);
}

function parsePromptHint(promptHint) {
  if (!promptHint) return null;

  try {
    const parsed = JSON.parse(promptHint);
    // Accept if it has either a customPrompt or a sceneContext
    const hasCustomPrompt = typeof parsed.customPrompt === 'string' && parsed.customPrompt.length > 0;
    const hasSceneContext = typeof parsed.sceneContext === 'string' && parsed.sceneContext.length > 0;
    if (hasCustomPrompt || hasSceneContext) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function buildSceneAwarePrompt(scene) {
  if (scene.placeholderType === 'silhouette') {
    return buildSilhouettePlaceholderPrompt(scene);
  }

  return buildOpenTemplatePrompt(scene);
}

/**
 * Prompt for templates that have an explicit dark silhouette placeholder
 * (e.g. Icardi template-5 / template-6).
 */
function buildSilhouettePlaceholderPrompt(scene) {
  return [
    'Photorealistic sports photo compositing task.',
    '',
    `SCENE — ${scene.sceneContext}`,
    '',
    'IMAGE 1 is the fixed base template.',
    'IMAGE 2 is a reference photo of the person whose face and identity must be used.',
    '',
    `EXISTING CHARACTERS: ${scene.existingCharacters ?? 'All persons already in IMAGE 1.'}`,
    '',
    `PLACEMENT: ${scene.userPlacement ?? 'Fill the dark silhouette placeholder in IMAGE 1 with the person from IMAGE 2.'}`,
    '',
    'RULE: The dark silhouette area is the ONLY region to modify. Every other pixel in IMAGE 1 is permanently locked.',
    '',
    'PRESERVE from IMAGE 1 with zero exceptions:',
    '- Every existing character: face, body, clothing, pose, expression — unchanged pixel-for-pixel',
    '- Entire background: stadium, crowd, sponsors, all environmental elements',
    '- Scene lighting: exact direction, color temperature, intensity',
    '- Camera: focal length, depth-of-field, focus plane, lens rendering',
    '- Color grade, contrast, saturation, tone mapping, all photographic qualities',
    '',
    PROPORTION_RULES,
    '',
    'COMPOSITING REQUIREMENTS for the person filling the silhouette:',
    `- Lighting: ${scene.lightingNotes ?? 'Match scene lighting exactly.'}`,
    '- Dress them in the Galatasaray kit matching the style in IMAGE 1',
    '- Their body pose must naturally mirror the silhouette shape and match the energy of the existing player',
    '- Apply matching depth-of-field blur for their position in the scene',
    '- Cast accurate contact shadows and ground ambient occlusion',
    '- Blend all edges seamlessly — zero halos, no compositing seams',
    '- Preserve the inserted person\'s exact face, skin tone, and identity from IMAGE 2 — do not alter their features',
    '- Final result must be indistinguishable from an original unedited professional sports photograph',
  ].join('\n');
}

/**
 * Prompt for "open" templates — no built-in silhouette placeholder.
 * At runtime the image service extends the canvas: original photo on the LEFT,
 * dark placeholder on the RIGHT.
 */
function buildOpenTemplatePrompt(scene) {
  return [
    'Photorealistic sports photo GROUP PORTRAIT compositing task.',
    '',
    `SCENE — ${scene.sceneContext}`,
    '',
    'IMAGE 1 is a SIDE-BY-SIDE composite:',
    `  LEFT HALF  — the original sports photograph containing ${scene.existingCharacters ?? 'the existing player'}. Completely locked and immutable.`,
    '  RIGHT HALF — a solid dark placeholder. This is the ONLY region to generate new content in.',
    '',
    'IMAGE 2 is a reference photo of the NEW PERSON whose face and identity must be used for the right half.',
    '',
    'CRITICAL RULES:',
    '1. The LEFT HALF is PERMANENT — do not touch, modify, blend, or alter any pixel of it.',
    `2. ${scene.existingCharacters ?? 'The player in the left half'} — face, body, jersey, pose, expression must survive pixel-perfect.`,
    '3. DO NOT perform face-swapping. DO NOT apply IMAGE 2\'s face to the person in the left half.',
    '4. The final image must contain TWO VISUALLY DISTINCT PEOPLE with TWO COMPLETELY DIFFERENT FACES.',
    '5. Generate content ONLY inside the dark right half.',
    '',
    PROPORTION_RULES,
    '',
    'NEW PERSON (right half):',
    '- Use the face and identity from IMAGE 2 exactly — preserve their facial features, skin tone, hair',
    '- Dress them in the Galatasaray kit matching the style worn by the player in the left half',
    '- Standing upright in a natural athletic pose appropriate to the scene energy',
    `- ${scene.userPlacement ?? 'Stand naturally in the right half of the frame.'}`,
    '',
    'BACKGROUND CONTINUITY for the right half:',
    `- Continue the same background seamlessly from the left half (${scene.sceneContext.split('.')[0]})`,
    '- Match the depth-of-field blur level of the left half exactly',
    '- No visible seam or boundary at the join between the two halves',
    '',
    'LIGHTING for the new person:',
    `- ${scene.lightingNotes ?? 'Match the scene lighting exactly.'}`,
    '- Cast accurate contact shadows and ground ambient occlusion beneath them',
    '- Blend all subject edges seamlessly — no halos, no compositing seams',
    '',
    'The final output must look like a single seamlessly shot professional sports photograph of two athletes standing together as equals.',
  ].join('\n');
}

function buildFallbackPrompt(player, template) {
  return [
    'Photorealistic sports photo compositing task.',
    '',
    `IMAGE 1 is a fixed Galatasaray sports photography template featuring ${player.displayName}.`,
    'Every pixel outside the user placeholder area must remain completely unchanged.',
    '',
    'IMAGE 2 is a reference photo of the person to composite into the template.',
    '',
    'TASK: Place the person from IMAGE 2 naturally into the template as a second player alongside the existing one.',
    '',
    'PRESERVE ABSOLUTELY (no modifications to existing content):',
    `- ${player.displayName} and all other players already in the scene`,
    '- All background elements: stadium, pitch, crowd, banners, sky, architecture',
    '- Scene lighting, camera characteristics, color grade, and all photographic qualities',
    `- Composition and visual balance of template variant "${template.variantName}"`,
    '',
    PROPORTION_RULES,
    '',
    'COMPOSITING REQUIREMENTS:',
    '- Match the person\'s scale and perspective to the existing player — same depth plane, same camera distance',
    '- Dress the subject in a Galatasaray kit that matches the visual context of IMAGE 1',
    '- Apply scene-accurate lighting matching direction, color temperature, and intensity',
    '- Generate accurate contact shadows and ground ambient occlusion',
    '- Blend all subject edges seamlessly — zero compositing artifacts',
    '- Faithfully preserve the inserted person\'s facial features, skin tone, and identity from IMAGE 2',
    '- The final result must be indistinguishable from an original unedited professional sports photograph',
  ].join('\n');
}

module.exports = {
  buildGenerationPrompt,
};
