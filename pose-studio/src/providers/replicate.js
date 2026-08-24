// Paid. Best quality for feet, but Replicate throttles hard until a payment
// method is on file (6 predictions/minute, burst of 1) and answers 429 with a
// retry_after. Honour that instead of failing the job.
const API = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'black-forest-labs/flux-1.1-pro';

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Cancelled')); }, { once: true });
});

/** POST with backoff on 429, reading Replicate's own retry_after when present. */
async function postWithBackoff(url, init, signal, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, signal });
    if (res.status !== 429) return res;
    if (attempt >= attempts) return res;

    const body = await res.clone().json().catch(() => ({}));
    const headerWait = Number(res.headers.get('retry-after'));
    const seconds = Number(body.retry_after) || (Number.isFinite(headerWait) ? headerWait : 0) || 2 ** attempt;
    await wait(Math.min(seconds, 30) * 1000 + 250, signal);
  }
}

async function settle(url, token, signal, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!res.ok) throw new Error(`Replicate poll failed (${res.status}).`);

    const body = await res.json();
    if (body.status === 'succeeded') return body;
    if (body.status === 'failed') throw new Error(body.error || 'The model failed to produce an image.');
    if (body.status === 'canceled') throw new Error('The generation was cancelled.');
    await wait(1500, signal);
  }
  throw new Error('Timed out waiting for the image.');
}

export const replicate = {
  id: 'replicate',
  label: 'Replicate — best quality, paid',
  free: false,
  needsKey: 'REPLICATE_API_TOKEN',
  keyHint: 'r8_...',
  isReady: () => Boolean(process.env.REPLICATE_API_TOKEN?.trim()),

  async generate({ prompt, negative, aspect, seed, count, signal }) {
    const token = process.env.REPLICATE_API_TOKEN?.trim();
    if (!token) throw new Error('Add a Replicate API key in Setup.');
    const model = process.env.REPLICATE_MODEL?.trim() || DEFAULT_MODEL;

    const out = [];
    // Sequential, because the un-carded rate limit has a burst of 1.
    for (let i = 0; i < count; i++) {
      const created = await postWithBackoff(`${API}/models/${model}/predictions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            prompt,
            negative_prompt: negative,
            aspect_ratio: aspect,
            seed: seed + i,
            output_format: 'jpg',
            output_quality: 95,
          },
        }),
      }, signal);

      if (created.status === 401) throw new Error('Replicate rejected the API key. Check it in Setup.');
      if (created.status === 402) throw new Error('Replicate reports no credit on this account.');
      if (created.status === 429) {
        throw new Error('Replicate is rate-limiting this account (it stays low until a payment method is added). Switch to a free service in Setup, or wait a minute.');
      }
      if (!created.ok) throw new Error(`Replicate refused the request (${created.status}): ${(await created.text()).slice(0, 200)}`);

      const done = await settle((await created.json()).urls.get, token, signal);
      const url = [].concat(done.output ?? [])[0];
      if (!url) throw new Error('Replicate returned no image.');

      const img = await fetch(url, { signal });
      if (!img.ok) throw new Error(`Could not download the image (${img.status}).`);

      out.push({
        buffer: Buffer.from(await img.arrayBuffer()),
        contentType: img.headers.get('content-type') || 'image/jpeg',
        seed: seed + i,
      });
    }
    return out;
  },
};
