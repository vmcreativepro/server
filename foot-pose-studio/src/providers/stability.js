export const stabilityProvider = {
  id: 'stability',
  label: 'Stability AI (SD 3.5)',
  requiresKey: 'STABILITY_API_KEY',
  isConfigured: () => Boolean(process.env.STABILITY_API_KEY),

  async generate({ prompt, negativePrompt, seed, count, aspectRatio }) {
    const key = process.env.STABILITY_API_KEY;
    if (!key) throw new Error('STABILITY_API_KEY is not set');
    const model = process.env.STABILITY_MODEL || 'sd3.5-large';

    // Stability returns one image per call, so fan out for count > 1.
    return Promise.all(Array.from({ length: count }, async (_, i) => {
      const form = new FormData();
      form.set('prompt', prompt);
      form.set('negative_prompt', negativePrompt);
      form.set('model', model);
      form.set('aspect_ratio', aspectRatio || '1:1');
      form.set('output_format', 'png');
      form.set('seed', String(seed + i));

      const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
        body: form,
      });
      if (!res.ok) throw new Error(`Stability request failed: ${res.status} ${await res.text()}`);

      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || 'image/png',
        seed: seed + i,
      };
    }));
  },
};
