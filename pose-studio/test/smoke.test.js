import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt, NEGATIVE, POSES, VIEWS, SETTINGS } from '../src/prompt.js';
import { checkExtra } from '../src/safety.js';
import { getProvider, listProviders, DEFAULT_PROVIDER, KEY_VARS } from '../src/providers/index.js';

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
  assert.match(prompt, /85mm/);
  assert.match(prompt, /visible pores/);
  assert.match(prompt, /unretouched/);
  assert.match(prompt, /five toes on each foot/);
});

test('partial and empty selections still produce a prompt', () => {
  assert.match(buildPrompt({ pose: 'arched' }), /ballet pointe/);
  assert.ok(buildPrompt({}).includes('85mm'));
});

test('extra details land before the fixed cues', () => {
  const prompt = buildPrompt({ pose: 'flexed', extra: 'freckled skin' });
  assert.ok(prompt.indexOf('freckled skin') < prompt.indexOf('85mm'));
});

test('negative prompt blocks anatomy and category failures', () => {
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

test('the default service is free and usable with no key at all', () => {
  const providers = listProviders();
  const fallback = providers.find((p) => p.id === DEFAULT_PROVIDER);
  assert.ok(fallback.free, 'default is a free service');
  assert.equal(fallback.needsKey, null, 'default needs no key');
  assert.equal(fallback.ready, true, 'default is ready out of the box');
});

test('at least one free service exists and paid ones are marked', () => {
  const providers = listProviders();
  assert.ok(providers.filter((p) => p.free).length >= 2);
  const paid = providers.find((p) => !p.free);
  assert.ok(paid && paid.needsKey, 'paid service declares its key');
});

test('unknown provider ids fall back to the free default', () => {
  assert.equal(getProvider('nonsense').id, DEFAULT_PROVIDER);
  assert.equal(getProvider(undefined).id, DEFAULT_PROVIDER);
});

test('key vars are limited to the ones providers declare', () => {
  assert.ok(KEY_VARS.includes('REPLICATE_API_TOKEN'));
  assert.ok(KEY_VARS.includes('HUGGINGFACE_TOKEN'));
  assert.ok(!KEY_VARS.includes('PATH'), 'cannot be used to write arbitrary env vars');
});
