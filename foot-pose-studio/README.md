# Foot Pose Studio

A standalone web app that generates foot **pose reference images** from a structured
set of controls (pose, camera angle, framing, surface, lighting, style) rather than
from free-form prompting. It runs alongside — but independently of — the Practicon
chat server in this repo, so it can be deployed on its own or mounted behind an
existing site.

## Quick start

```bash
cd foot-pose-studio
npm install
cp .env.example .env     # optional — defaults work as-is
npm start                # http://localhost:4000
```

With no configuration it runs the **stub provider**: no API key, no model call, and
a deterministic placeholder image per request. That exercises the entire pipeline
(queue → generation → storage → gallery → download) so you can build and demo the
UI before paying for inference.

## Choosing a real backend

Set `IMAGE_PROVIDER` and the matching key in `.env`:

| Provider     | `IMAGE_PROVIDER` | Key                   | Notes |
|--------------|------------------|-----------------------|-------|
| Local stub   | `stub`           | none                  | Default. Placeholder SVGs. |
| Replicate    | `replicate`      | `REPLICATE_API_TOKEN` | Model via `REPLICATE_MODEL` (default Flux 1.1 Pro). Async create + poll. |
| Stability AI | `stability`      | `STABILITY_API_KEY`   | Model via `STABILITY_MODEL` (default `sd3.5-large`). |
| OpenAI       | `openai`         | `OPENAI_API_KEY`      | Model via `OPENAI_IMAGE_MODEL` (default `gpt-image-1`). |

The provider chosen in `.env` is the default; the UI's Provider dropdown can pick
any provider that is currently configured. Unconfigured ones are greyed out and the
API rejects them with a clear message rather than a stack trace.

### Adding another provider

Drop a module in `src/providers/` exporting an object shaped like:

```js
export const myProvider = {
  id: 'my-provider',
  label: 'My Provider',
  requiresKey: 'MY_API_KEY',
  isConfigured: () => Boolean(process.env.MY_API_KEY),
  async generate({ prompt, negativePrompt, width, height, aspectRatio, seed, count }) {
    return [{ buffer, contentType: 'image/png', seed }];
  },
};
```

Then register it in `src/providers/index.js`. Nothing else changes — the options
endpoint, UI dropdown, and validation all read from that registry.

## How prompts are built

`src/poses.js` holds the taxonomy. Each option is a short prompt fragment, and
`buildPrompt()` composes the selected fragments plus a fixed prefix/suffix into one
description. A shared negative prompt targets the failure mode these models are
worst at — toe count and foot anatomy.

Adding a pose is a one-line edit to the `POSES` array; it appears in the UI on the
next reload with no frontend change.

## API

All endpoints live under `/api`. Set `API_KEYS` to a comma-separated list to require
an `X-Api-Key` header; leave it empty and the API is open (fine behind an existing
site's auth, not on the public internet).

| Method | Path             | Purpose |
|--------|------------------|---------|
| `GET`  | `/api/health`    | Liveness plus active provider and whether it is configured. |
| `GET`  | `/api/options`   | Full catalog of poses/angles/styles + provider list. Drives the UI. |
| `POST` | `/api/preview`   | Returns the prompt a selection would produce, without generating. |
| `POST` | `/api/generate`  | Queues a job. Responds `202` with the job; generation runs in the background. |
| `GET`  | `/api/jobs`      | Recent jobs, newest first (`?limit=`). |
| `GET`  | `/api/jobs/:id`  | One job — poll this for `status: done \| error`. |

```bash
curl -X POST localhost:4000/api/generate -H 'Content-Type: application/json' -d '{
  "pose": "toe-splay", "angle": "sole", "framing": "feet-hands",
  "surface": "yoga-mat", "lighting": "soft", "style": "photo",
  "aspect": "1:1", "count": 2
}'
```

## Storage

Images are written to `OUTPUT_DIR` (default `data/generations/`) and served from
`/generations/`. A JSON index alongside them restores the gallery after a restart,
and the oldest jobs are pruned past 500 so the directory cannot grow without bound.
For a multi-instance deployment, swap `src/store.js` for object storage — it is the
only module that touches the filesystem.

## Content rules

`src/safety.js` screens the free-text field before any request is billed: no minors,
no explicit or sexual content, no real-person likenesses. The hosted providers apply
their own policies on top, so a prompt passing this check can still be refused
upstream — the error surfaces in the UI. Generated images depict fictional adults;
don't publish them in a way that implies a real, identifiable person.
