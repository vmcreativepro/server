import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// In-memory job registry plus on-disk images and a JSON index that survives
// restarts. Small enough that a database would be overkill at this stage.
export class JobStore {
  constructor({ outputDir, maxJobs = 500 }) {
    this.outputDir = outputDir;
    this.maxJobs = maxJobs;
    this.jobs = new Map();
    this.indexPath = path.join(outputDir, 'index.json');
  }

  async init() {
    await fs.mkdir(this.outputDir, { recursive: true });
    try {
      const saved = JSON.parse(await fs.readFile(this.indexPath, 'utf8'));
      for (const job of saved) this.jobs.set(job.id, job);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  create(fields) {
    const job = {
      id: crypto.randomUUID(),
      status: 'queued',
      createdAt: new Date().toISOString(),
      images: [],
      error: null,
      ...fields,
    };
    this.jobs.set(job.id, job);
    this.trim();
    return job;
  }

  get(id) {
    return this.jobs.get(id) ?? null;
  }

  list({ limit = 50 } = {}) {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async update(id, patch) {
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch);
    await this.persist();
    return job;
  }

  /** Write one generated image next to its job and return its public record. */
  async saveImage(jobId, { buffer, contentType, seed }, index) {
    const ext = contentType.includes('svg') ? 'svg' : contentType.includes('jpeg') ? 'jpg' : 'png';
    const filename = `${jobId}-${index}.${ext}`;
    await fs.writeFile(path.join(this.outputDir, filename), buffer);
    return { filename, url: `/generations/${filename}`, contentType, seed };
  }

  async persist() {
    await fs.writeFile(this.indexPath, JSON.stringify(this.list({ limit: this.maxJobs }), null, 2));
  }

  /** Drop the oldest jobs (and their files) once past maxJobs. */
  trim() {
    const ordered = [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const job of ordered.slice(this.maxJobs)) {
      this.jobs.delete(job.id);
      for (const image of job.images) {
        fs.rm(path.join(this.outputDir, image.filename), { force: true }).catch(() => {});
      }
    }
  }
}
