// Hard guard on user-supplied prompt text. The hosted providers run their own
// policy checks too; this stops the obvious cases before we spend a request.
const BLOCKED = [
  /\b(child|children|kid|kids|toddler|infant|baby|minor|underage|teen|teenage|preteen|schoolgirl|schoolboy|loli|shota)\b/i,
  /\b(\d|1[0-7])\s*(year|yr)s?[\s-]*old\b/i,
  /\b(nude|naked|nsfw|porn|explicit|genital|erotic|fetish|sexual|aroused|orgasm)\b/i,
  /\b(rape|abuse|torture|gore|mutilat)/i,
];

// Named real people shouldn't be targets for generated body-part imagery.
const LIKENESS = /\b(celebrity|celebrities|lookalike|likeness of|deepfake)\b/i;

export function checkPrompt(text = '') {
  if (!text.trim()) return { ok: true };

  for (const pattern of BLOCKED) {
    if (pattern.test(text)) {
      return { ok: false, reason: 'The extra details contain terms this tool will not generate.' };
    }
  }
  if (LIKENESS.test(text)) {
    return { ok: false, reason: 'This tool does not generate images resembling real, identifiable people.' };
  }
  if (text.length > 600) {
    return { ok: false, reason: 'Extra details must be 600 characters or fewer.' };
  }
  return { ok: true };
}
