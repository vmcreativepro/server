import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt, CATALOG, NEGATIVE, POSES, VIEWS, SETTINGS } from '../src/prompt.js';
import { checkExtra } from '../src/safety.js';
import { hasKey } from '../src/replicate.js';

test('every control group is populated with id/label/prompt', () => {
  for (const group of [POSES, VIEWS, SETTINGS]) {
    assert.ok(group.length > 0);
    for (const entry of group) {
      assert.equal(typeof entry.id, 'string');
      assert.equal(typeof entry.label, 'string');
      assert.ok(entry.prompt.length > 20, `${entry.id} has a real description`);
    }
  }
});

test('a prompt carries the photographic cues that drive realism', () => {
  const prompt = buildPrompt({ pose: 'toe-splay', view: 'soles', setting: 'yoga-mat' });
  assert.match(prompt, /adult/i);
  assert.match(prompt, /toes deliberately spread/);
  assert.match(prompt, /plantar surfaces/);
  assert.match(prompt, /85mm/);            // camera
  assert.match(prompt, /visible pores/);    // skin
  assert.match(prompt, /unretouched/);      // realism
  assert.match(prompt, /five toes on each foot/);
});

test('partial and empty selections still produce a prompt', () => {
  assert.match(buildPrompt({ pose: 'arched' }), /ballet pointe/);
  assert.ok(buildPrompt({}).includes('85mm'));
});

test('extra details are appended before the fixed cues', () => {
  const prompt = buildPrompt({ pose: 'flexed', extra: 'freckled skin' });
  assert.ok(prompt.indexOf('freckled skin') < prompt.indexOf('85mm'));
});

test('negative prompt blocks both anatomy and category failures', () => {
  for (const term of ['six toes', 'fused toes', 'plastic skin', '3d render', 'child', 'nsfw']) {
    assert.ok(NEGATIVE.includes(term), `blocks "${term}"`);
  }
});

test('safety screen passes ordinary detail and rejects the hard cases', () => {
  assert.equal(checkExtra('').ok, true);
  assert.equal(checkExtra('pale skin, chipped polish').ok, true);
  for (const bad of ['teen model', 'nude', '16 year old', 'likeness of a celebrity']) {
    assert.equal(checkExtra(bad).ok, false, `rejects "${bad}"`);
  }
  assert.equal(checkExtra('x'.repeat(500)).ok, false);
});

test('hasKey reflects the environment', () => {
  const saved = process.env.REPLICATE_API_TOKEN;
  delete process.env.REPLICATE_API_TOKEN;
  assert.equal(hasKey(), false);
  process.env.REPLICATE_API_TOKEN = 'r8_x';
  assert.equal(hasKey(), true);
  if (saved === undefined) delete process.env.REPLICATE_API_TOKEN;
  else process.env.REPLICATE_API_TOKEN = saved;
});
