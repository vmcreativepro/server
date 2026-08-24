// Smoke tests: the modules load and the prompt builder composes selections.
// Run with `npm test` (node:test, no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt, CATALOG, NEGATIVE_PROMPT, resolveAspect } from '../foot-pose-studio/src/poses.js';
import { listProviders, getProvider } from '../foot-pose-studio/src/providers/index.js';
import { checkPrompt } from '../foot-pose-studio/src/safety.js';

test('catalog exposes every control group', () => {
  for (const group of ['POSES', 'ANGLES', 'FRAMING', 'STYLES', 'SURFACES', 'LIGHTING', 'ASPECTS']) {
    assert.ok(Array.isArray(CATALOG[group]) && CATALOG[group].length > 0, `${group} is populated`);
  }
});

test('buildPrompt folds the selected fragments into one description', () => {
  const prompt = buildPrompt({
    pose: 'toe-splay', angle: 'sole', framing: 'feet-hands',
    surface: 'yoga-mat', lighting: 'soft', style: 'photo',
  });
  assert.match(prompt, /adult/i);
  assert.match(prompt, /toes spread wide apart/);
  assert.match(prompt, /plantar view/);
  assert.match(prompt, /five toes per foot/);
});

test('buildPrompt tolerates a partial selection', () => {
  assert.match(buildPrompt({ pose: 'flexed' }), /flexed sharply upward/);
  assert.ok(buildPrompt({}).length > 0);
});

test('unknown aspect falls back to the first entry', () => {
  assert.equal(resolveAspect('nonsense').id, CATALOG.ASPECTS[0].id);
});

test('negative prompt covers the anatomy failures and the hard blocks', () => {
  for (const term of ['extra toes', 'fused toes', 'child', 'minor', 'nsfw']) {
    assert.ok(NEGATIVE_PROMPT.includes(term), `negative prompt mentions "${term}"`);
  }
});

test('safety screen rejects minors, explicit content and likenesses', () => {
  assert.equal(checkPrompt('pale skin, short nails').ok, true);
  assert.equal(checkPrompt('').ok, true);
  for (const bad of ['a teen girl', 'nude photo', '15 year old', 'likeness of a celebrity']) {
    assert.equal(checkPrompt(bad).ok, false, `rejects "${bad}"`);
  }
});

test('the stub provider is always usable and returns the requested count', async () => {
  const stub = getProvider('stub');
  assert.equal(stub.isConfigured(), true);

  const images = await stub.generate({
    prompt: 'test', negativePrompt: '', width: 256, height: 256, seed: 7, count: 2,
  });
  assert.equal(images.length, 2);
  assert.deepEqual(images.map((i) => i.seed), [7, 8]);
  assert.ok(images[0].buffer.length > 0);
});

test('every registered provider declares the required shape', () => {
  const providers = listProviders();
  assert.ok(providers.length >= 4);
  for (const p of providers) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.label, 'string');
    assert.equal(typeof p.configured, 'boolean');
  }
});

test('an unknown provider id is rejected', () => {
  assert.throws(() => getProvider('nope'), /Unknown image provider/);
});
