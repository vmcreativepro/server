import { pollinations } from './pollinations.js';
import { huggingface } from './huggingface.js';
import { replicate } from './replicate.js';

// Free first: the default costs nothing and needs no account.
const ALL = [pollinations, huggingface, replicate];
const BY_ID = Object.fromEntries(ALL.map((p) => [p.id, p]));

export const DEFAULT_PROVIDER = pollinations.id;

export function getProvider(id) {
  return BY_ID[id] ?? BY_ID[DEFAULT_PROVIDER];
}

export function listProviders() {
  return ALL.map(({ id, label, free, needsKey, keyHint }) => ({
    id, label, free,
    needsKey: needsKey || null,
    keyHint: keyHint || null,
    ready: BY_ID[id].isReady(),
  }));
}

/** Env var names the settings endpoint is allowed to write. */
export const KEY_VARS = ALL.map((p) => p.needsKey).filter(Boolean);
