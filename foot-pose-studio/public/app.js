const $ = (id) => document.getElementById(id);
const els = {
  status: $('status'), error: $('error'), go: $('go'),
  form: $('controls'), prompt: $('promptPreview'), gallery: $('gallery'),
};

const SELECTS = {
  pose: 'POSES', angle: 'ANGLES', framing: 'FRAMING',
  surface: 'SURFACES', lighting: 'LIGHTING', style: 'STYLES', aspect: 'ASPECTS',
};

let options = null;

init();

async function init() {
  try {
    options = await api('/api/options');
  } catch (err) {
    els.status.textContent = 'API unreachable';
    showError(err.message);
    return;
  }

  for (const [id, key] of Object.entries(SELECTS)) fill($(id), options[key]);
  fill($('count'), Array.from({ length: options.maxImages }, (_, i) => ({
    id: String(i + 1), label: `${i + 1} image${i ? 's' : ''}`,
  })));
  fill($('provider'), options.providers.map((p) => ({
    id: p.id,
    label: p.configured ? p.label : `${p.label} — not configured`,
    disabled: !p.configured,
  })));
  $('provider').value = options.activeProvider;

  // Defaults matching the most common reference shot.
  $('angle').value = 'sole';
  $('framing').value = 'feet-legs';
  $('surface').value = 'yoga-mat';

  await initSetup();
  els.status.textContent = `provider: ${options.activeProvider}`;
  els.form.addEventListener('input', debounce(refreshPrompt, 200));
  els.form.addEventListener('submit', onSubmit);
  refreshPrompt();
  renderJobs(await api('/api/jobs?limit=24'));
}

const KEY_FIELD = {
  replicate: 'REPLICATE_API_TOKEN',
  stability: 'STABILITY_API_KEY',
  openai: 'OPENAI_API_KEY',
};

// Setup bar: choose a service and paste its key, no .env editing required.
async function initSetup() {
  const provider = $('setProvider'), key = $('setKey'), save = $('setSave'), state = $('setState');

  fill(provider, options.providers.map((p) => ({ id: p.id, label: p.label })));
  const current = await api('/api/settings');
  provider.value = current.provider;

  const showState = (s) => {
    const field = KEY_FIELD[provider.value];
    key.disabled = !field;
    key.placeholder = field ? 'paste your key here' : 'no key needed';
    if (!field) return void (state.textContent = 'Ready — no key needed.');
    state.innerHTML = s.keys[field]
      ? '<span class="ok">Key saved ✓</span>'
      : 'Needs a key before it can generate.';
  };
  showState(current);

  provider.addEventListener('change', () => showState(current));

  save.addEventListener('click', async () => {
    save.disabled = true;
    state.textContent = 'Saving…';
    try {
      const patch = { IMAGE_PROVIDER: provider.value };
      const field = KEY_FIELD[provider.value];
      if (field && key.value.trim()) patch[field] = key.value.trim();

      const next = await api('/api/settings', patch);
      Object.assign(current, next);
      key.value = '';
      showState(next);

      options = await api('/api/options');
      fill($('provider'), options.providers.map((p) => ({
        id: p.id,
        label: p.configured ? p.label : `${p.label} — not configured`,
        disabled: !p.configured,
      })));
      $('provider').value = next.provider;
      els.status.textContent = `provider: ${next.provider}`;
    } catch (err) {
      state.textContent = err.message;
    } finally {
      save.disabled = false;
    }
  });
}

function selection() {
  const data = Object.fromEntries(new FormData(els.form).entries());
  return { ...data, count: Number(data.count), seed: data.seed.trim() === '' ? null : Number(data.seed) };
}

async function refreshPrompt() {
  try {
    const { prompt } = await api('/api/preview', selection());
    els.prompt.textContent = prompt;
    showError('');
  } catch (err) {
    els.prompt.textContent = '—';
    showError(err.message);
  }
}

async function onSubmit(event) {
  event.preventDefault();
  els.go.disabled = true;
  els.go.textContent = 'Generating…';
  showError('');
  try {
    const job = await api('/api/generate', selection());
    prependPending(job);
    await poll(job.id);
  } catch (err) {
    showError(err.message);
  } finally {
    els.go.disabled = false;
    els.go.textContent = 'Generate';
  }
}

async function poll(id) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = await api(`/api/jobs/${id}`);
    if (job.status === 'done' || job.status === 'error') {
      if (job.status === 'error') showError(job.error);
      renderJobs(await api('/api/jobs?limit=24'));
      return;
    }
    await sleep(1500);
  }
  showError('Timed out waiting for the job to finish.');
}

function renderJobs(jobs) {
  const cards = jobs.flatMap((job) =>
    job.status === 'done'
      ? job.images.map((image) => imageCard(job, image))
      : [statusCard(job)]);

  els.gallery.replaceChildren(
    ...(cards.length ? cards : [el('p', { className: 'empty' }, 'Nothing generated yet.')]));
}

function imageCard(job, image) {
  const card = el('div', { className: 'card' });
  const img = el('img', { src: image.url, alt: job.prompt, loading: 'lazy', title: job.prompt });
  const meta = el('div', { className: 'meta' },
    el('span', {}, `${job.provider} · seed ${image.seed}`),
    el('a', { href: image.url, download: image.filename }, 'Download'));
  card.append(img, meta);
  return card;
}

function statusCard(job) {
  const card = el('div', { className: 'card pending' });
  if (job.status !== 'error') card.append(el('div', { className: 'spinner' }));
  card.append(el('div', {}, job.status === 'error' ? `Failed: ${job.error}` : `${job.status}…`));
  return card;
}

function prependPending(job) {
  const first = els.gallery.querySelector('.empty');
  if (first) first.remove();
  els.gallery.prepend(statusCard(job));
}

async function api(url, body) {
  const res = await fetch(url, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function fill(select, items) {
  select.replaceChildren(...items.map((item) => {
    const option = el('option', { value: item.id }, item.label);
    if (item.disabled) option.disabled = true;
    return option;
  }));
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

function showError(message) { els.error.textContent = message || ''; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
