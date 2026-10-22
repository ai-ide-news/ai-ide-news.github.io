// Per-page share images (og:image), 1200×630, in the same light "wire" style as static/og.png
// (scripts/og.html). Drawn as SVG and rasterised with resvg using the TTFs in scripts/fonts/.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const FONT_DIR = new URL('fonts/', import.meta.url);
const fontFiles = readdirSync(FONT_DIR).filter((f) => f.endsWith('.ttf')).map((f) => fileURLToPath(new URL(f, FONT_DIR)));
const C = { bg: '#f4f1e9', ink: '#1b1a17', ink2: '#4c4a44', ink3: '#75726a', line: 'rgba(27,26,23,.24)', accent: '#c8401a', ok: '#2f6b2f' };
const SANS = 'Geist', MONO = 'Geist Mono', SERIF = 'Instrument Serif';
const x = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Rough Geist advance widths (em), enough to fit text without measuring glyphs.
const em = (s, k = 0.56) => [...s].reduce((w, ch) => w + (/[ilj.,:;'|!]/.test(ch) ? 0.27 : /[mwMW@]/.test(ch) ? 0.85 : /[A-Z0-9]/.test(ch) ? 0.64 : k), 0);
// Split into at most `lines` lines that fit `width` at `size`, shrinking the size until they do.
function fit(text, width, { max = 96, min = 48, lines = 2 } = {}) {
  const words = String(text).split(/\s+/);
  for (let size = max; size >= min; size -= 2) {
    const out = [];
    for (const w of words) {
      const last = out[out.length - 1];
      if (last && em(`${last} ${w}`) * size <= width) out[out.length - 1] = `${last} ${w}`;
      else out.push(w);
    }
    if (out.length <= lines && out.every((l) => em(l) * size <= width)) return { size, out };
  }
  const size = min, per = Math.floor(width / (0.58 * size));
  return { size, out: [String(text).slice(0, per - 1) + '…'] };
}
const clip = (s, width, size, k) => {
  s = String(s);
  while (s.length > 1 && em(s, k) * size > width) s = s.slice(0, -2) + '…';
  return s;
};

// card: { kicker, title, sub, stats: [[label, value], …] (≤3), foot, icon: data URI }
// icon: { href: data URI, mono } — mono logos are single-colour masks on the site, so they get inked here.
export function ogSvg({ kicker = '', title, sub = '', stats = [], foot = '', icon }) {
  const L = 64, R = 1136, hasStats = stats.length > 0;
  const colW = hasStats ? 716 : R - L;
  const t = fit(title, colW, { max: hasStats ? 92 : 104 });
  const lh = Math.round(t.size * 1.02);
  const blockH = t.out.length * lh + (sub ? 64 : 0);
  let y = 150 + Math.max(0, (380 - blockH) / 2) + t.size * 0.8;
  const titleSvg = t.out.map((l, i) => `<text x="${L}" y="${(y + i * lh).toFixed(0)}" font-family="${SANS}" font-weight="600" font-size="${t.size}" letter-spacing="${(-0.045 * t.size).toFixed(1)}" fill="${C.ink}">${x(l)}</text>`).join('');
  y += (t.out.length - 1) * lh;
  const subSize = Math.max(40, Math.min(56, Math.floor(colW / (em(sub, 0.4) || 1))));
  const subSvg = sub ? `<text x="${L}" y="${(y + 66).toFixed(0)}" font-family="${SERIF}" font-style="italic" font-size="${subSize}" fill="${C.accent}">${x(clip(sub, colW, subSize, 0.4))}</text>` : '';
  const sx = 836, rows = stats.slice(0, 3);
  const top = 315 - rows.length * 33;
  const statSvg = hasStats ? `<rect x="${sx}" y="${top}" width="${R - sx}" height="2" fill="${C.ink}"/>${rows.map(([k, v], i) => {
    const ry = top + (i + 1) * 66, lw = Math.min(150, [...String(k)].length * 16 * 0.6);
    const vs = Math.max(22, Math.min(32, Math.floor((R - sx - lw - 20) / (em(String(v), 0.52) || 1))));
    return `<text x="${sx}" y="${ry - 24}" font-family="${MONO}" font-size="16" fill="${C.ink2}">${x(clip(k, 150, 16, 0.6))}</text>`
      + `<text x="${R}" y="${ry - 20}" text-anchor="end" font-family="${SANS}" font-weight="600" font-size="${vs}" letter-spacing="-1" fill="${C.ink}">${x(clip(v, R - sx - lw - 20, vs, 0.52))}</text>`
      + `<rect x="${sx}" y="${ry}" width="${R - sx}" height="1" fill="${C.line}"/>`;
  }).join('')}` : '';
  const kx = icon ? L + 52 : L;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${C.bg}"/>
<rect x="${L}" y="52" width="18" height="18" fill="${C.accent}"/>
<text x="${L + 32}" y="72" font-family="${SANS}" font-weight="600" font-size="34" letter-spacing="-1" fill="${C.ink}">aiticker</text>
<circle cx="${R - 300}" cy="61" r="4.5" fill="${C.ok}"/>
<text x="${R}" y="67" text-anchor="end" font-family="${MONO}" font-size="17" fill="${C.ink3}">Live · updated automatically</text>
<rect x="${L}" y="100" width="${R - L}" height="2" fill="${C.ink}"/>
${icon ? `${icon.mono ? `<filter id="ink"><feFlood flood-color="${C.ink}"/><feComposite in2="SourceAlpha" operator="in"/></filter>` : ''}<image x="${L}" y="134" width="36" height="36" xlink:href="${icon.href}" preserveAspectRatio="xMidYMid meet"${icon.mono ? ' filter="url(#ink)"' : ''}/>` : ''}
<text x="${kx}" y="${icon ? 159 : 156}" font-family="${MONO}" font-size="19" letter-spacing="1.5" fill="${C.ink3}">${x(clip(kicker.toUpperCase(), R - kx, 19, 0.62))}</text>
${titleSvg}${subSvg}${statSvg}
<rect x="${L}" y="552" width="${R - L}" height="1" fill="${C.line}"/>
<text x="${L}" y="584" font-family="${MONO}" font-size="18" fill="${C.ink2}">${x(clip(foot, R - L, 18, 0.6))}</text>
</svg>`;
}

export const ogPng = (svg) => new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: SANS },
}).render().asPng();
