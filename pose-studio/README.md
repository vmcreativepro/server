# Pose Studio

Generates photoreal foot pose reference images. Three controls — pose, view,
setting — plus an optional free-text field. Paste a Replicate API key into the
app's own Setup panel and start generating; there is no config file to edit.

## Run it

```bash
cd pose-studio
npm install
npm start          # http://localhost:4000
```

Open the page, click **Setup**, paste a key from
[replicate.com/account/api-tokens](https://replicate.com/account/api-tokens),
and press Save. The dot in the header turns green when it's ready.

Images cost a few cents each and take roughly 15 seconds.

## Putting it online

`render.yaml` is a Render blueprint: **New → Blueprint**, point it at this repo,
deploy. The blueprint mounts a 1 GB disk at `data/` so generated images survive
restarts, and leaves `REPLICATE_API_TOKEN` unset so you can either set it in the
Render dashboard or paste it into the Setup panel once the app is live.

Any Node host works — it's a plain Express app with no build step. The only
requirements are Node 20+ and a writable directory for `data/`.

## How realism is handled

Diffusion models produce illustration-looking output when a prompt is a pile of
adjectives, and photograph-looking output when it reads like a shot list. So
every prompt in `src/prompt.js` ends with four fixed blocks:

- **Camera** — full-frame body, 85mm f/1.8 at f/4, 1/250s, ISO 200
- **Skin** — pores, creases, tan lines, redness at the heel, short bare nails
- **Realism** — candid, unretouched, natural colour, subtle grain
- **Anatomy** — exactly five toes per foot, correct order and proportion

The negative prompt attacks the two failure modes directly: toe anatomy
(`six toes`, `fused toes`, `webbed toes`) and the plastic look
(`plastic skin`, `waxy`, `airbrushed`, `cgi`, `3d render`).

Backend is Replicate's Flux 1.1 Pro, which handles feet and toes better than the
alternatives. Override with `REPLICATE_MODEL` if you want to try another.

Tuning a pose is a one-line edit to the arrays in `src/prompt.js`; the UI picks
up the change on reload with no frontend edit.

## Content rules

`src/safety.js` screens the free-text field before a request is billed: no
minors, no explicit content, no real-person likenesses. Replicate applies its own
policy on top, so a prompt that passes locally can still be refused upstream —
the error surfaces in the page.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/config` | Control catalog and whether a key is set. Drives the UI. |
| `POST` | `/api/preview` | The prompt a selection would produce, without generating. |
| `POST` | `/api/key` | Store the Replicate key (process + `.env`). Never returned. |
| `POST` | `/api/generate` | Queue a job; responds `202`, generation runs in the background. |
| `GET` | `/api/jobs` | Recent jobs, newest first. |
| `GET` | `/api/jobs/:id` | One job — poll for `status: done \| error`. |

## Tests

```bash
npm test
```

Covers prompt composition, the photographic cues, the safety screen, and the
negative prompt. No network calls.
