import fs from 'node:fs/promises';
import path from 'node:path';

// Runtime settings entered through the web UI. Written to .env next to the app
// so a restart keeps them, and mirrored into process.env so providers — which
// read process.env directly — pick them up without a restart.
const KEYS = ['IMAGE_PROVIDER', 'REPLICATE_API_TOKEN', 'STABILITY_API_KEY', 'OPENAI_API_KEY'];

export class Settings {
  constructor(appRoot) {
    this.envPath = path.join(appRoot, '.env');
  }

  /** What the UI may see: never the secrets themselves, only whether they're set. */
  publicState() {
    return {
      provider: process.env.IMAGE_PROVIDER || 'stub',
      keys: Object.fromEntries(
        KEYS.filter((k) => k !== 'IMAGE_PROVIDER')
          .map((k) => [k, Boolean(process.env[k]?.trim())]),
      ),
    };
  }

  /** Apply a patch immediately, then persist it. Empty string clears a key. */
  async update(patch = {}) {
    for (const key of KEYS) {
      if (!(key in patch)) continue;
      const value = String(patch[key] ?? '').trim();
      if (value) process.env[key] = value;
      else delete process.env[key];
    }
    await this.persist();
    return this.publicState();
  }

  async persist() {
    let existing = '';
    try {
      existing = await fs.readFile(this.envPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Drop the lines we manage, keep anything the user added themselves.
    const kept = existing
      .split('\n')
      .filter((line) => !KEYS.some((key) => new RegExp(`^\\s*${key}\\s*=`).test(line)))
      .join('\n')
      .trim();

    const managed = KEYS
      .filter((key) => process.env[key])
      .map((key) => `${key}=${process.env[key]}`)
      .join('\n');

    await fs.writeFile(this.envPath, [kept, managed].filter(Boolean).join('\n') + '\n', {
      mode: 0o600,
    });
  }
}
