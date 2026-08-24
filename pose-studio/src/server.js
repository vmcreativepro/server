import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG, buildPrompt, NEGATIVE } from './prompt.js';
import { generate, hasKey } from './replicate.js';
import { checkExtra } from './safety.js';
import { Store } from './store.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv(path.join(root, '.env'));

const PORT = Number(process.env.PORT) || 4000;
const IMAGES = path.resolve(root, process.env.IMAGE_DIR || 'data/images');
const ASPECTS = ['1:1', '4:5', '3:4', '16:9'];
const MAX_BATCH = 4;

const store = new Store(IMAGES);
await store.init();

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(root, 'public')));
app.use('/images', express.static(IMAGES, { maxAge: '7d' }));

app.get('/api/config', (req, res) => {
  res.json({ ...CATALOG, aspects: ASPECTS, maxBatch: MAX_BATCH, ready: hasKey() });
});

app.post('/api/preview', (req, res) => {
  const verdict = checkExtra(req.body?.extra ?? '');
  if (!verdict.ok) return res.status(400).json({ error: verdict.reason });
  res.json({ prompt: buildPrompt(req.body ?? {}) });
});

// The key is entered in the browser rather than a file. It lives in this
// process and in .env beside the app; it is never sent back to the client.
app.post('/api/key', async (req, res) => {
  const key = String(req.body?.key ?? '').trim();
  if (key && !/^r8_[A-Za-z0-9]{20,}$/.test(key)) {
    return res.status(400).json({ error: 'That does not look like a Replicate key (they start with r8_).' });
  }
  if (key) process.env.REPLICATE_API_TOKEN = key;
  else delete process.env.REPLICATE_API_TOKEN;

  try {
    await saveEnv(path.join(root, '.env'), 'REPLICATE_API_TOKEN', key);
  } catch (err) {
    console.error('Could not persist the key:', err);
    return res.status(500).json({ error: 'Key is active for now, but could not be saved for next restart.' });
  }
  res.json({ ready: hasKey() });
});

app.post('/api/generate', async (req, res) => {
  const body = req.body ?? {};

  const verdict = checkExtra(body.extra ?? '');
  if (!verdict.ok) return res.status(400).json({ error: verdict.reason });
  if (!hasKey()) return res.status(503).json({ error: 'Add your Replicate API key in Setup first.' });

  const aspect = ASPECTS.includes(body.aspect) ? body.aspect : '4:5';
  const count = Math.min(MAX_BATCH, Math.max(1, Number(body.count) || 1));
  const seed = Number.isInteger(Number(body.seed)) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31);
  const prompt = buildPrompt(body);

  const job = store.create({ prompt, selection: body, aspect, seed, count });
  await store.save();
  res.status(202).json(job);

  run(job, { prompt, aspect, seed, count });
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

async function run(job, { prompt, aspect, seed, count }) {
  await store.patch(job.id, { status: 'running' });
  try {
    const results = await generate({ prompt, negative: NEGATIVE, aspect, seed, count });
    const images = [];
    for (const [i, result] of results.entries()) images.push(await store.write(job.id, result, i));
    await store.patch(job.id, { status: 'done', images });
  } catch (err) {
    await store.patch(job.id, { status: 'error', error: err.message });
  }
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function saveEnv(file, key, value) {
  let text = '';
  try {
    text = await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const kept = text.split('\n').filter((l) => !new RegExp(`^\\s*${key}\\s*=`).test(l)).join('\n').trim();
  const next = [kept, value ? `${key}=${value}` : ''].filter(Boolean).join('\n');
  await fs.promises.writeFile(file, next + '\n', { mode: 0o600 });
}

app.listen(PORT, () => {
  console.log(`Pose Studio → http://localhost:${PORT}  ${hasKey() ? '(key loaded)' : '(no key yet — add one in Setup)'}`);
});
