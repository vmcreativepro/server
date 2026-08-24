import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG, buildPrompt, NEGATIVE } from './prompt.js';
import { getProvider, listProviders, DEFAULT_PROVIDER, KEY_VARS } from './providers/index.js';
import { checkExtra } from './safety.js';
import { Store } from './store.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENV_FILE = path.join(root, '.env');
loadEnv(ENV_FILE);

const PORT = Number(process.env.PORT) || 4000;
const IMAGES = path.resolve(root, process.env.IMAGE_DIR || 'data/images');
const MAX_BATCH = 4;

// Pixel sizes travel with the aspect so keyless backends, which take width and
// height rather than a ratio string, get usable dimensions.
const ASPECTS = [
  { id: '4:5', label: 'Portrait 4:5', width: 896, height: 1120 },
  { id: '1:1', label: 'Square 1:1', width: 1024, height: 1024 },
  { id: '3:4', label: 'Portrait 3:4', width: 896, height: 1194 },
  { id: '16:9', label: 'Landscape 16:9', width: 1344, height: 756 },
];

const store = new Store(IMAGES);
await store.init();

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(root, 'public')));
app.use('/images', express.static(IMAGES, { maxAge: '7d' }));

app.get('/api/config', (req, res) => {
  res.json({
    ...CATALOG,
    aspects: ASPECTS,
    maxBatch: MAX_BATCH,
    providers: listProviders(),
    activeProvider: activeProviderId(),
  });
});

app.post('/api/preview', (req, res) => {
  const verdict = checkExtra(req.body?.extra ?? '');
  if (!verdict.ok) return res.status(400).json({ error: verdict.reason });
  res.json({ prompt: buildPrompt(req.body ?? {}), negative: NEGATIVE });
});

/** Store a provider key and/or the chosen provider. Keys are never sent back. */
app.post('/api/settings', async (req, res) => {
  const { provider, keyVar, key } = req.body ?? {};

  if (provider) {
    if (!listProviders().some((p) => p.id === provider)) {
      return res.status(400).json({ error: 'Unknown service.' });
    }
    process.env.IMAGE_PROVIDER = provider;
  }

  if (keyVar) {
    if (!KEY_VARS.includes(keyVar)) return res.status(400).json({ error: 'Unknown key field.' });
    const value = String(key ?? '').trim();
    if (value) process.env[keyVar] = value;
    else delete process.env[keyVar];
  }

  try {
    await persistEnv();
  } catch (err) {
    console.error('Could not write .env:', err);
    return res.status(500).json({ error: 'Settings are active now, but could not be saved for next restart.' });
  }
  res.json({ providers: listProviders(), activeProvider: activeProviderId() });
});

app.post('/api/generate', async (req, res) => {
  const body = req.body ?? {};

  const verdict = checkExtra(body.extra ?? '');
  if (!verdict.ok) return res.status(400).json({ error: verdict.reason });

  const provider = getProvider(body.provider || activeProviderId());
  if (!provider.isReady()) {
    return res.status(503).json({ error: `${provider.label} needs a key. Add one in Setup, or switch to a free service.` });
  }

  const aspect = ASPECTS.find((a) => a.id === body.aspect) ?? ASPECTS[0];
  const count = Math.min(MAX_BATCH, Math.max(1, Number(body.count) || 1));
  const seed = Number.isInteger(Number(body.seed)) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31);
  const prompt = buildPrompt(body);

  const job = store.create({ prompt, selection: body, provider: provider.id, aspect: aspect.id, seed, count });
  await store.save();
  res.status(202).json(job);

  run(job, provider, { prompt, aspect, seed, count });
});

app.get('/api/jobs', (req, res) => res.json(store.list(Number(req.query.limit) || 40)));

app.get('/api/jobs/:id', (req, res) => {
  const job = store.get(req.params.id);
  job ? res.json(job) : res.status(404).json({ error: 'No such job' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

async function run(job, provider, { prompt, aspect, seed, count }) {
  await store.patch(job.id, { status: 'running' });
  try {
    const results = await provider.generate({
      prompt,
      negative: NEGATIVE,
      aspect: aspect.id,
      width: aspect.width,
      height: aspect.height,
      seed,
      count,
    });
    const images = [];
    for (const [i, result] of results.entries()) images.push(await store.write(job.id, result, i));
    await store.patch(job.id, { status: 'done', images });
  } catch (err) {
    await store.patch(job.id, { status: 'error', error: err.message });
  }
}

function activeProviderId() {
  const id = process.env.IMAGE_PROVIDER?.trim();
  return listProviders().some((p) => p.id === id) ? id : DEFAULT_PROVIDER;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function persistEnv() {
  const managed = ['IMAGE_PROVIDER', ...KEY_VARS];
  let text = '';
  try {
    text = await fs.promises.readFile(ENV_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const kept = text.split('\n')
    .filter((line) => !managed.some((key) => new RegExp(`^\\s*${key}\\s*=`).test(line)))
    .join('\n').trim();
  const lines = managed.filter((key) => process.env[key]).map((key) => `${key}=${process.env[key]}`);
  await fs.promises.writeFile(ENV_FILE, [kept, ...lines].filter(Boolean).join('\n') + '\n', { mode: 0o600 });
}

app.listen(PORT, () => {
  const active = getProvider(activeProviderId());
  console.log(`Pose Studio → http://localhost:${PORT}   service: ${active.label}${active.isReady() ? '' : ' (needs a key)'}`);
});
