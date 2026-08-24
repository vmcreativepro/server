// OpenAI's image endpoint has no negative-prompt field, so exclusions are
// folded into the prompt text instead.
export const openaiProvider = {
  id: 'openai',
  label: 'OpenAI Images (gpt-image-1)',
  requiresKey: 'OPENAI_API_KEY',
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),

  async generate({ prompt, negativePrompt, width, height, seed, count }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set');

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt: `${prompt} Avoid: ${negativePrompt}.`,
        n: count,
        size: nearestSize(width, height),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);

    const body = await res.json();
    return Promise.all((body.data ?? []).map(async (item, i) => ({
      buffer: item.b64_json
        ? Buffer.from(item.b64_json, 'base64')
        : Buffer.from(await (await fetch(item.url)).arrayBuffer()),
      contentType: 'image/png',
      seed: seed + i,
    })));
  },
};

function nearestSize(width, height) {
  if (width === height) return '1024x1024';
  return width > height ? '1536x1024' : '1024x1536';
}
