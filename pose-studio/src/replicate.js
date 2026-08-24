// Replicate only. Flux handles hands and feet better than the alternatives,
// and one well-tuned backend beats four half-tuned ones.
const API = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'black-forest-labs/flux-1.1-pro';

export function hasKey() {
  return Boolean(process.env.REPLICATE_API_TOKEN?.trim());
}

/** Poll a prediction to a terminal state. */
async function settle(url, token, { timeoutMs = 180_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Replicate poll failed (${res.status})`);

    const body = await res.json();
    if (body.status === 'succeeded') return body;
    if (body.status === 'failed') throw new Error(body.error || 'The model failed to produce an image.');
    if (body.status === 'canceled') throw new Error('The generation was cancelled.');

    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Timed out waiting for the image.');
}

/**
 * Generate `count` images. Resolves to [{ buffer, contentType, seed }].
 * Flux returns one image per prediction, so requests fan out.
 */
export async function generate({ prompt, negative, aspect, seed, count }) {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new Error('No Replicate API key set. Add one in Setup.');
  const model = process.env.REPLICATE_MODEL?.trim() || DEFAULT_MODEL;

  return Promise.all(Array.from({ length: count }, async (_, i) => {
    const thisSeed = seed + i;

    const created = await fetch(`${API}/models/${model}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          prompt,
          negative_prompt: negative,
          aspect_ratio: aspect,
          seed: thisSeed,
          output_format: 'jpg',
          output_quality: 95,
          safety_tolerance: 2,
          prompt_upsampling: false,
        },
      }),
    });

    if (created.status === 401) throw new Error('Replicate rejected the API key. Check it in Setup.');
    if (created.status === 402) throw new Error('Replicate reports no credit on this account.');
    if (!created.ok) throw new Error(`Replicate refused the request (${created.status}): ${await created.text()}`);

    const done = await settle((await created.json()).urls.get, token);
    const url = [].concat(done.output ?? [])[0];
    if (!url) throw new Error('Replicate returned no image.');

    const img = await fetch(url);
    if (!img.ok) throw new Error(`Could not download the image (${img.status}).`);

    return {
      buffer: Buffer.from(await img.arrayBuffer()),
      contentType: img.headers.get('content-type') || 'image/jpeg',
      seed: thisSeed,
    };
  }));
}
