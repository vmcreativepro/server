const $ = (id) => document.getElementById(id);
let config = null;
let polling = null;

start();

async function start() {
  try {
    config = await api('/api/config');
  } catch (err) {
    return fail(`Cannot reach the server: ${err.message}`);
  }

  fillSelect($('pose'), config.POSES);
  fillSelect($('view'), config.VIEWS);
  fillSelect($('setting'), config.SETTINGS);
  fillSelect($('aspect'), config.aspects);
  fillSelect($('count'), Array.from({ length: config.maxBatch }, (_, i) => ({
    id: String(i + 1), label: i === 0 ? '1 image' : `${i + 1} images`,
  })));

  // Defaults: the shot most people want first.
  $('view').value = 'soles';
  $('setting').value = 'yoga-mat';
  $('aspect').value = '4:5';

  initSetup();

  $('toggleSetup').addEventListener('click', () => $('setup').classList.toggle('open'));
  $('saveSetup').addEventListener('click', saveSetup);
  $('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSetup(); });
  $('provider').addEventListener('change', paintSetup);
  $('go').addEventListener('click', generate);
  $('showPrompt').addEventListener('click', showPrompt);

  render(await api('/api/jobs?limit=40'));
}

function choice() {
  return {
    pose: $('pose').value,
    view: $('view').value,
    setting: $('setting').value,
    aspect: $('aspect').value,
    count: Number($('count').value),
    extra: $('extra').value,
    provider: $('provider') ? $('provider').value : undefined,
  };
}

function current() {
  return config.providers.find((p) => p.id === $('provider').value) ?? config.providers[0];
}

function initSetup() {
  fillSelect($('provider'), config.providers.map((p) => ({
    id: p.id, label: p.free ? `${p.label}  ·  free` : p.label,
  })));
  $('provider').value = config.activeProvider;
  paintSetup();
  if (!current().ready) $('setup').classList.add('open');
}

/** Reflect the selected service: free ones hide the key field entirely. */
function paintSetup() {
  const p = current();
  const needsKey = Boolean(p.needsKey);

  $('keyWrap').style.display = needsKey ? '' : 'none';
  $('keyLabel').textContent = needsKey ? `API key (${p.keyHint || ''})` : 'API key';
  $('key').placeholder = p.keyHint || '';

  $('setupNote').innerHTML = p.free && !needsKey
    ? 'This service is free and needs no account. Just press Save and start generating.'
    : p.free
      ? 'Free tier. Get a token at <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener">huggingface.co/settings/tokens</a> — no card needed.'
      : 'Paid. Get a key at <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener">replicate.com/account/api-tokens</a>. Without a card on file Replicate throttles hard, so free services above are the safer default.';

  const ready = p.ready || !needsKey;
  $('dot').classList.toggle('on', ready);
  $('go').disabled = !ready;
  $('keyState').textContent = needsKey ? (p.ready ? 'Key saved.' : 'No key yet.') : 'Ready — no key needed.';
}

async function saveSetup() {
  $('saveSetup').disabled = true;
  $('keyState').textContent = 'Saving…';
  try {
    const body = { provider: $('provider').value };
    const p = current();
    if (p.needsKey && $('key').value.trim()) {
      body.keyVar = p.needsKey;
      body.key = $('key').value.trim();
    }
    const next = await api('/api/settings', body);
    config.providers = next.providers;
    config.activeProvider = next.activeProvider;
    $('key').value = '';
    paintSetup();
    fail('');
    if (current().ready || !current().needsKey) setTimeout(() => $('setup').classList.remove('open'), 700);
  } catch (err) {
    $('keyState').textContent = '';
    fail(err.message);
  } finally {
    $('saveSetup').disabled = false;
  }
}

async function showPrompt() {
  try {
    const { prompt } = await api('/api/preview', choice());
    fail('');
    alert(prompt);
  } catch (err) {
    fail(err.message);
  }
}

async function generate() {
  $('go').disabled = true;
  $('go').textContent = 'Generating…';
  fail('');
  try {
    const job = await api('/api/generate', choice());
    prepend(pending(job));
    await watch(job.id);
  } catch (err) {
    fail(err.message);
  } finally {
    $('go').disabled = false;
    $('go').textContent = 'Generate';
  }
}

async function watch(id) {
  clearInterval(polling);
  return new Promise((resolve) => {
    polling = setInterval(async () => {
      try {
        const job = await api(`/api/jobs/${id}`);
        if (job.status === 'done' || job.status === 'error') {
          clearInterval(polling);
          if (job.status === 'error') fail(job.error);
          render(await api('/api/jobs?limit=40'));
          resolve();
        }
      } catch {
        clearInterval(polling);
        resolve();
      }
    }, 2000);
  });
}

function render(jobs) {
  const nodes = jobs.flatMap((job) =>
    job.status === 'done' ? job.images.map((img) => photo(job, img)) : [pending(job)]);
  $('grid').replaceChildren(...(nodes.length ? nodes : [el('p', { className: 'none' }, 'Nothing generated yet.')]));
}

function photo(job, img) {
  const fig = el('figure');
  fig.append(
    el('img', { src: img.url, alt: job.prompt, loading: 'lazy', title: job.prompt }),
    el('figcaption', {},
      el('span', {}, `seed ${img.seed}`),
      el('a', { href: img.url, download: img.filename }, 'Save')),
  );
  return fig;
}

function pending(job) {
  const box = el('div', { className: job.status === 'error' ? 'card err' : 'card' });
  if (job.status !== 'error') box.append(el('div', { className: 'spin' }));
  box.append(el('div', {}, job.status === 'error' ? job.error : 'Generating… about 15 seconds'));
  return box;
}

function prepend(node) {
  const empty = $('grid').querySelector('.none');
  if (empty) empty.remove();
  $('grid').prepend(node);
}

async function api(url, body) {
  const res = await fetch(url, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function fillSelect(select, items) {
  select.replaceChildren(...items.map((i) => el('option', { value: i.id }, i.label)));
}

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter(Boolean));
  return node;
}

function fail(message) { $('msg').textContent = message || ''; }
