// Screen the free-text field before a request is billed. Replicate applies its
// own policy on top; this catches the categories that must never be attempted.
const BLOCKED = [
  /\b(child|children|kid|kids|toddler|infant|baby|minor|underage|teen|teenage|preteen|schoolgirl|schoolboy|loli|shota)\b/i,
  /\b([0-9]|1[0-7])\s*(year|yr)s?[\s-]*old\b/i,
  /\b(nude|naked|nsfw|porn|explicit|genital|erotic|sexual|aroused|orgasm)\b/i,
  /\b(rape|abuse|torture|gore|mutilat)/i,
  /\b(celebrity|lookalike|likeness of|deepfake)\b/i,
];

export function checkExtra(text = '') {
  if (!text.trim()) return { ok: true };
  if (text.length > 400) return { ok: false, reason: 'Keep extra details under 400 characters.' };
  if (BLOCKED.some((re) => re.test(text))) {
    return { ok: false, reason: 'Those details include terms this tool will not generate.' };
  }
  return { ok: true };
}
