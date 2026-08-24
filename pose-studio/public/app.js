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
  fillSelect($('aspect'), config.aspects.map((a) => ({ id: a, label: a })));
  fillSelect($('count'), Array.from({ length: config.maxBatch }, (_, i) => ({
    id: String(i + 1), label: i === 0 ? '1 image' : `${i + 1} images`,
  })));

  // Defaults: the shot most people want first.
  $('view').value = 'soles';
  $('setting').value = 'yoga-mat';
  $('aspect').value = '4:5';

  setReady(config.ready);
  if (!config.ready) $('setup').classList.add('open');

  $('toggleSetup').addEventListener('click', () => $('setup').classList.toggle('open'));
  $('saveKey').addEventListener('click', saveKey);
  $('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveKey(); });
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
  };
}

function setReady(ready) {
  $('dot').classList.toggle('on', ready);
  $('go').disabled = !ready;
  $('keyState').textContent = ready ? 'Key saved — ready to generate.' : 'No key yet.';
}

async function saveKey() {
  const key = $('key').value.trim();
  if (!key) return;
  $('saveKey').disabled = true;
  $('keyState').textContent = 'Saving…';
  try {
    const { ready } = await api('/api/key', { key });
    $('key').value = '';
    setReady(ready);
    if (ready) setTimeout(() => $('setup').classList.remove('open'), 700);
    fail('');
  } catch (err) {
    $('keyState').textContent = '';
    fail(err.message);
  } finally {
    $('saveKey').disabled = false;
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
    $('go').disabled = !config.ready;
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
