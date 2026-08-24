const API = 'https://api.replicate.com/v1';

async function poll(url, token, { timeoutMs = 180_000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Replicate poll failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (body.status === 'succeeded') return body;
    if (body.status === 'failed' || body.status === 'canceled') {
      throw new Error(`Replicate prediction ${body.status}: ${body.error ?? 'no detail'}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Replicate prediction timed out');
}

export const replicateProvider = {
  id: 'replicate',
  label: 'Replicate (Flux / SDXL)',
  requiresKey: 'REPLICATE_API_TOKEN',
  isConfigured: () => Boolean(process.env.REPLICATE_API_TOKEN),

  async generate({ prompt, negativePrompt, width, height, seed, count }) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('REPLICATE_API_TOKEN is not set');
    const model = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-1.1-pro';

    const res = await fetch(`${API}/models/${model}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          seed,
          num_outputs: count,
          output_format: 'png',
        },
      }),
    });
    if (!res.ok) throw new Error(`Replicate request failed: ${res.status} ${await res.text()}`);

    const created = await res.json();
    const done = await poll(created.urls.get, token);
    const urls = [].concat(done.output ?? []);

    return Promise.all(urls.map(async (url, i) => {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`Could not download Replicate output: ${img.status}`);
      return {
        buffer: Buffer.from(await img.arrayBuffer()),
        contentType: img.headers.get('content-type') || 'image/png',
        seed: seed + i,
      };
    }));
  },
};
