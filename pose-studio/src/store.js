import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/** Images on disk plus a small in-memory job list, trimmed to `max`. */
export class Store {
  constructor(dir, max = 200) {
    this.dir = dir;
    this.max = max;
    this.jobs = new Map();
    this.index = path.join(dir, 'index.json');
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      for (const job of JSON.parse(await fs.readFile(this.index, 'utf8'))) this.jobs.set(job.id, job);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  create(fields) {
    const job = { id: crypto.randomUUID(), status: 'queued', createdAt: new Date().toISOString(), images: [], error: null, ...fields };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id) { return this.jobs.get(id) ?? null; }

  list(limit = 60) {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async patch(id, fields) {
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, fields);
    await this.save();
    return job;
  }

  async write(jobId, { buffer, contentType, seed }, i) {
    const ext = contentType.includes('png') ? 'png' : contentType.includes('svg') ? 'svg' : 'jpg';
    const filename = `${jobId}-${i}.${ext}`;
    await fs.writeFile(path.join(this.dir, filename), buffer);
    return { filename, url: `/images/${filename}`, seed };
  }

  async save() {
    this.trim();
    await fs.writeFile(this.index, JSON.stringify(this.list(this.max), null, 2));
  }

  trim() {
    const ordered = [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const job of ordered.slice(this.max)) {
      this.jobs.delete(job.id);
      for (const img of job.images) fs.rm(path.join(this.dir, img.filename), { force: true }).catch(() => {});
    }
  }
}
