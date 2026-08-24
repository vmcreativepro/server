import crypto from 'node:crypto';

// Deterministic placeholder renderer. Draws an SVG "contact sheet" card so the
// whole app — queue, gallery, downloads — is exercisable with no API key.
function svgFor({ prompt, width, height, seed }) {
  const hash = crypto.createHash('sha256').update(`${prompt}:${seed}`).digest();
  const hue = hash[0] * 360 / 256;
  const hue2 = (hue + 40) % 360;
  const wrapped = wrap(prompt, 46).slice(0, 12);
  const lines = wrapped
    .map((line, i) => `<text x="48" y="${height * 0.52 + i * 26}" class="p">${escapeXml(line)}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(${hue.toFixed(0)} 55% 22%)"/>
    <stop offset="100%" stop-color="hsl(${hue2.toFixed(0)} 60% 12%)"/>
  </linearGradient>
  <style>
    .t{font:600 34px system-ui,sans-serif;fill:#fff}
    .s{font:500 18px system-ui,sans-serif;fill:hsl(${hue.toFixed(0)} 70% 78%);letter-spacing:.14em}
    .p{font:400 19px ui-monospace,monospace;fill:#ffffffcc}
  </style></defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  ${footGlyph(width, height, hue)}
  <text x="48" y="76" class="s">STUB PROVIDER — NO MODEL CALLED</text>
  <text x="48" y="${height * 0.44}" class="t">Foot Pose Studio</text>
  ${lines}
  <text x="48" y="${height - 44}" class="p">seed ${seed} · ${width}×${height}</text>
</svg>`;
}

// A simple stylised sole shape so the placeholder reads as a foot at a glance.
function footGlyph(w, h, hue) {
  const cx = w * 0.74, cy = h * 0.30, s = Math.min(w, h) / 900;
  const toes = [0, 1, 2, 3, 4]
    .map((i) => {
      const r = (26 - i * 3.4) * s;
      const x = cx - 96 * s + i * 46 * s;
      const y = cy - 118 * s + i * 17 * s;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 1.25).toFixed(1)}"/>`;
    })
    .join('');
  return `<g fill="hsl(${hue.toFixed(0)} 40% 82%)" opacity="0.30">
    <ellipse cx="${cx}" cy="${cy}" rx="${(120 * s).toFixed(1)}" ry="${(190 * s).toFixed(1)}"/>
    ${toes}
  </g>`;
}

function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > width) { out.push(line.trim()); line = word; }
    else line += ' ' + word;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export const stubProvider = {
  id: 'stub',
  label: 'Local stub (no API key)',
  requiresKey: false,
  isConfigured: () => true,
  async generate({ prompt, width, height, seed, count }) {
    return Array.from({ length: count }, (_, i) => {
      const s = seed + i;
      return {
        buffer: Buffer.from(svgFor({ prompt, width, height, seed: s }), 'utf8'),
        contentType: 'image/svg+xml',
        seed: s,
      };
    });
  },
};
