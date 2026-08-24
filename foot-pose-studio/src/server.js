import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CATALOG, buildPrompt, resolveAspect, NEGATIVE_PROMPT } from './poses.js';
import { getProvider, listProviders } from './providers/index.js';
import { JobStore } from './store.js';
import { checkPrompt } from './safety.js';
import { Settings } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');

loadEnvFile(path.join(appRoot, '.env'));

const OUTPUT_DIR = path.resolve(appRoot, process.env.OUTPUT_DIR || 'data/generations');
const PORT = Number(process.env.PORT) || 4000;
const MAX_IMAGES = 4;

const settings = new Settings(appRoot);
const store = new JobStore({ outputDir: OUTPUT_DIR });
await store.init();

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(appRoot, 'public')));
app.use('/generations', express.static(OUTPUT_DIR, { maxAge: '1h' }));
app.use('/api', requireApiKey);

app.get('/api/health', (req, res) => {
  const provider = getProvider();
  res.json({ ok: true, provider: provider.id, configured: provider.isConfigured() });
});

app.get('/api/settings', (req, res) => {
  res.json(settings.publicState());
});

app.post('/api/settings', async (req, res) => {
  try {
    res.json(await settings.update(req.body ?? {}));
  } catch (err) {
    console.error('Could not save settings:', err);
    res.status(500).json({ error: 'Could not save settings to .env' });
  }
});

app.get('/api/options', (req, res) => {
  res.json({
    ...CATALOG,
    providers: listProviders(),
    activeProvider: getProvider().id,
    maxImages: MAX_IMAGES,
  });
});

app.post('/api/preview', (req, res) => {
  const verdict = checkPrompt(req.body?.extra ?? '');
  if (!verdict.ok) return res.status(400).json({ error: verdict.reason });
  res.json({ prompt: buildPrompt(req.body ?? {}), negativePrompt: NEGATIVE_PROMPT });
});

app.post('/api/generate', async (req, res) => {
  const sel = req.body ?? {};

  const verdict = checkPrompt(sel.extra ?? '');
  if (!verdict.ok) return res.status(400).json({ error: verdict.reason });

  let provider;
  try {
    provider = getProvider(sel.provider);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!provider.isConfigured()) {
    return res.status(503).json({
      error: `Provider "${provider.id}" is not configured. Set ${provider.requiresKey} in the environment, or use the stub provider.`,
    });
  }

  const aspect = resolveAspect(sel.aspect);
  const count = clamp(Number(sel.count) || 1, 1, MAX_IMAGES);
  const seed = Number.isInteger(Number(sel.seed))
    ? Number(sel.seed)
    : Math.floor(Math.random() * 2 ** 31);
  const prompt = buildPrompt(sel);

  const job = store.create({
    prompt,
    negativePrompt: NEGATIVE_PROMPT,
    selection: sel,
    provider: provider.id,
    seed,
    count,
    aspect: aspect.id,
  });
  await store.persist();

  res.status(202).json(job);
  runJob(job, provider, { prompt, aspect, seed, count });
});

app.get('/api/jobs', (req, res) => {
  res.json(store.list({ limit: clamp(Number(req.query.limit) || 30, 1, 100) }));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'No such job' });
  res.json(job);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

/** Run the generation in the background and fold results back into the job. */
async function runJob(job, provider, { prompt, aspect, seed, count }) {
  await store.update(job.id, { status: 'running', startedAt: new Date().toISOString() });
  try {
    const results = await provider.generate({
      prompt,
      negativePrompt: NEGATIVE_PROMPT,
      width: aspect.width,
      height: aspect.height,
      aspectRatio: aspect.id,
      seed,
      count,
    });
    const images = [];
    for (const [i, result] of results.entries()) {
      images.push(await store.saveImage(job.id, result, i));
    }
    await store.update(job.id, { status: 'done', images, finishedAt: new Date().toISOString() });
  } catch (err) {
    console.error(`Job ${job.id} failed:`, err);
    await store.update(job.id, { status: 'error', error: err.message, finishedAt: new Date().toISOString() });
  }
}

/** Optional shared-secret gate; no API_KEYS set means the API is open. */
function requireApiKey(req, res, next) {
  const allowed = (process.env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return next();
  const presented = req.get('x-api-key') || '';
  if (allowed.includes(presented)) return next();
  res.status(401).json({ error: 'Missing or invalid X-Api-Key header' });
}

// Minimal KEY=value .env reader so the app has no dotenv dependency.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

app.listen(PORT, () => {
  console.log(`Foot Pose Studio on http://localhost:${PORT} (provider: ${getProvider().id})`);
});
