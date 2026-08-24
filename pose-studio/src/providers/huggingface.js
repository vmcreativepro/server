// Free tier, needs a free token from huggingface.co/settings/tokens.
// No card required. Slower than paid services and the model may need a
// warm-up call, which returns 503 with an estimated wait.
const MODEL = 'black-forest-labs/FLUX.1-schnell';

export const huggingface = {
  id: 'huggingface',
  label: 'Hugging Face — free tier, free token',
  free: true,
  needsKey: 'HUGGINGFACE_TOKEN',
  keyHint: 'hf_...',
  isReady: () => Boolean(process.env.HUGGINGFACE_TOKEN?.trim()),

  async generate({ prompt, width, height, seed, count, signal }) {
    const token = process.env.HUGGINGFACE_TOKEN?.trim();
    if (!token) throw new Error('Add a free Hugging Face token in Setup.');
    const model = process.env.HUGGINGFACE_MODEL?.trim() || MODEL;

    const out = [];
    for (let i = 0; i < count; i++) {
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width, height, seed: seed + i },
          options: { wait_for_model: true },
        }),
      });

      if (res.status === 401) throw new Error('Hugging Face rejected the token. Check it in Setup.');
      if (res.status === 429) throw new Error('Hugging Face free tier limit reached. Try again shortly.');
      if (res.status === 503) throw new Error('The model is warming up on Hugging Face. Try again in a minute.');
      if (!res.ok) throw new Error(`Hugging Face returned ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) throw new Error('Hugging Face did not return an image.');

      out.push({
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: type,
        seed: seed + i,
      });
    }
    return out;
  },
};
