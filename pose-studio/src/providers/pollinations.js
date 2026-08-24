// Free, no account, no key, no card. Quality is below Flux Pro but it costs
// nothing, so it is the default. The API is a plain GET that returns image
// bytes: https://image.pollinations.ai/prompt/<url-encoded prompt>?...
const BASE = 'https://image.pollinations.ai/prompt';

export const pollinations = {
  id: 'pollinations',
  label: 'Pollinations — free, no key',
  free: true,
  needsKey: false,
  isReady: () => true,

  async generate({ prompt, width, height, seed, count, signal }) {
    const out = [];
    // Sequential: the free tier is happier with one request at a time.
    for (let i = 0; i < count; i++) {
      const url = new URL(`${BASE}/${encodeURIComponent(prompt)}`);
      url.searchParams.set('width', String(width));
      url.searchParams.set('height', String(height));
      url.searchParams.set('seed', String(seed + i));
      url.searchParams.set('model', 'flux');
      url.searchParams.set('nologo', 'true');
      url.searchParams.set('enhance', 'false');

      const res = await fetch(url, { signal });
      if (res.status === 429) throw new Error('Pollinations is busy right now. Wait a few seconds and try again.');
      if (!res.ok) throw new Error(`Pollinations returned ${res.status}.`);

      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) throw new Error('Pollinations did not return an image.');

      out.push({
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: type,
        seed: seed + i,
      });
    }
    return out;
  },
};
