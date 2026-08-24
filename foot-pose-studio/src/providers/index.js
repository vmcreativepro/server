import { stubProvider } from './stub.js';
import { replicateProvider } from './replicate.js';
import { stabilityProvider } from './stability.js';
import { openaiProvider } from './openai.js';

const PROVIDERS = {
  stub: stubProvider,
  replicate: replicateProvider,
  stability: stabilityProvider,
  openai: openaiProvider,
};

/**
 * A provider is `{ id, label, requiresKey, isConfigured(), generate(req) }`.
 * generate() receives { prompt, negativePrompt, width, height, seed, count }
 * and resolves to an array of { buffer, contentType, seed }.
 */
export function getProvider(id = process.env.IMAGE_PROVIDER || 'stub') {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown image provider "${id}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

export function listProviders() {
  return Object.values(PROVIDERS).map(({ id, label, requiresKey, isConfigured }) => ({
    id, label, requiresKey, configured: isConfigured(),
  }));
}
