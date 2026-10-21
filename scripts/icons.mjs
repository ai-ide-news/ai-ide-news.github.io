// Resolves a real logo for every tool, cached in data/icons/ (manifest.json + files).
// Order: explicit brand icon (lobehub AI icons / Simple Icons) → known org brand →
// the project's own logo from its README → the website's touch/SVG icon →
// the GitHub org avatar. Personal avatars are never used (they're usually a face);
// anything unresolved falls back to the monogram tile.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { Resvg } from '@resvg/resvg-js';

const LOBE = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons';
const SIMPLE = 'https://cdn.simpleicons.org';
const VERSION = 8; // bump to re-resolve every cached icon
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

// GitHub owners whose brand exists in the lobehub set.
const OWNER_BRAND = {
  anthropics: 'claude', openai: 'openai', 'google-gemini': 'gemini', google: 'google', github: 'githubcopilot',
  qwenlm: 'qwen', moonshotai: 'kimi', mistralai: 'mistral', 'minimax-ai': 'minimax', 'zai-org': 'zai',
  'deepseek-ai': 'deepseek', 'vercel-labs': 'vercel', vercel: 'vercel', 'all-hands-ai': 'openhands',
  block: 'goose', 'kilo-org': 'kilocode', rooveterinaryinc: 'roocode', 'roocodeinc': 'roocode', cline: 'cline',
  'sst': 'opencode', anomalyco: 'opencode', xai: 'xai', 'xai-org': 'xai', bytedance: 'bytedance', ollama: 'ollama',
};
// Hosts whose icon would belong to the platform, not the project.
const GENERIC_HOSTS = /(^|\.)(github\.com|github\.io|gitlab\.com|arxiv\.org|medium\.com|npmjs\.com|pypi\.org|x\.com|twitter\.com|discord\.(gg|com)|youtube\.com|notion\.site|vercel\.app|netlify\.app)$/i;

const get = async (url, { json = false, headers = {} } = {}) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return json ? res.json() : res;
};
const gh = (path) => get(`https://api.github.com/${path}`, { json: true, headers: { Accept: 'application/vnd.github+json', ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}) } });

// Favicons often recolour themselves under @media (prefers-color-scheme: dark), which would
// fight the tile's own theming; keep only their default (light-mode) look.
function dropDarkMedia(svg) {
  let out = svg, i;
  while ((i = out.search(/@media[^{]*prefers-color-scheme[^{]*\{/i)) >= 0) {
    let j = out.indexOf('{', i) + 1, depth = 1;
    while (j < out.length && depth) { if (out[j] === '{') depth++; else if (out[j] === '}') depth--; j++; }
    out = out.slice(0, i) + out.slice(j);
  }
  return out;
}

// Downloads an image and checks it really is one; returns { buf, ext } or null.
export async function image(url) {
  try {
    const res = await get(url);
    const type = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > 600_000) return null;
    const head = buf.subarray(0, 300).toString('utf8');
    if (/svg/.test(type) || /<svg[\s>]/i.test(head)) {
      const svg = buf.toString('utf8');
      return /<svg[\s>]/i.test(svg) ? { buf: Buffer.from(dropDarkMedia(svg)), ext: 'svg' } : null;
    }
    if (buf[0] === 0x89 && buf[1] === 0x50) return { buf, ext: 'png' };
    if (buf[0] === 0xff && buf[1] === 0xd8) return { buf, ext: 'jpg' };
    if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return { buf, ext: 'webp' };
    if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1) return { buf, ext: 'ico' };
    return null;
  } catch { return null; }
}

// Width/height ratio of an SVG (viewBox) or PNG (IHDR); null when unknown.
function ratio({ buf, ext }) {
  if (ext === 'png' && buf.length > 24) return buf.readUInt32BE(16) / buf.readUInt32BE(20);
  if (ext === 'svg') {
    const svg = buf.toString('utf8').match(/<svg\b[^>]*>/i)?.[0] || '';
    const vb = svg.match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (vb) return +vb[1] / +vb[2];
    const w = +(svg.match(/\bwidth=["']([\d.]+)/i)?.[1] || 0), h = +(svg.match(/\bheight=["']([\d.]+)/i)?.[1] || 0);
    if (w && h) return w / h;
  }
  return null;
}
// A one-colour SVG (e.g. a white logo made for dark sites) is rendered as a themed mask.
function singleColor({ buf, ext }) {
  if (ext !== 'svg') return false;
  const svg = buf.toString('utf8');
  if (/<(linearGradient|radialGradient|image|pattern)\b/i.test(svg)) return false;
  // Fills only: editor metadata (e.g. Inkscape's stroke="black") would otherwise count as a colour.
  const colors = new Set([...svg.matchAll(/\bfill\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)/gi)]
    .map((m) => m[1].toLowerCase()).filter((c) => !['none', 'transparent', 'currentcolor', 'inherit'].includes(c)));
  return colors.size <= 1;
}

// 'dark' / 'light' when a logo is nearly all black or white on a transparent background,
// so the tile can give it a contrasting backdrop in the theme where it would vanish.
// Measured on real pixels: SVGs are rendered with resvg, PNGs decoded with pngjs.
function tone({ buf, ext }) {
  try {
    let data;
    if (ext === 'svg') data = new Resvg(buf, { fitTo: { mode: 'width', value: 64 } }).render().pixels;
    else if (ext === 'png') data = PNG.sync.read(buf).data;
    else return null; // jpg/webp avatars are opaque and carry their own background
    let visible = 0, clear = 0, dark = 0, light = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) { clear++; continue; }
      const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      visible++;
      if (l < 0.18) dark++; else if (l > 0.85) light++;
    }
    if (!visible || clear / (visible + clear) < 0.08) return null; // opaque: has its own background
    return dark / visible > 0.6 ? 'dark' : light / visible > 0.6 ? 'light' : null;
  } catch { return null; }
}

// A logo for a square tile: not a wide wordmark or banner.
const squarish = (r) => { const q = ratio(r); return q == null || (q > 0.5 && q < 2); };

// lobehub: prefer the full-colour variant; mono variants use currentColor and get themed.
async function lobe(name) {
  const color = await image(`${LOBE}/${name}-color.svg`);
  if (color) return { ...color, mono: false, src: `lobehub:${name}-color` };
  const mono = await image(`${LOBE}/${name}.svg`);
  return mono && { ...mono, mono: /currentColor/.test(mono.buf.toString('utf8')), src: `lobehub:${name}` };
}

async function simple(slug) {
  const r = await image(`${SIMPLE}/${slug}`);
  return r && { ...r, mono: false, src: `simpleicons:${slug}` };
}

// First README image that is plainly a logo/icon (not a screenshot or banner).
async function readmeLogo(repo) {
  try {
    const { content, download_url: dl } = await gh(`repos/${repo}/readme`);
    const md = Buffer.from(content, 'base64').toString('utf8').slice(0, 20000);
    const srcs = [
      ...[...md.matchAll(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi)].map((m) => ({ src: m[1], tag: m[0] })),
      ...[...md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)].map((m) => ({ src: m[2], tag: m[1] })),
    ];
    const repoName = repo.split('/')[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const { src, tag } of srcs) {
      const hay = `${src} ${tag}`.toLowerCase();
      const file = src.split(/[?#]/)[0].split('/').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
      const named = /logo|mascot/.test(hay) || (/icon/.test(file) && file.includes(repoName));
      if (!named || /banner|screenshot|demo|badge|shields\.io|simple-?icons|img\.shields|star-history|contrib|sponsor|discord|twitter|wordmark|preset-icons/.test(hay)) continue;
      const url = new URL(src.replace(/^\.?\//, ''), dl.replace(/[^/]+$/, '')).href.replace('://github.com/', '://raw.githubusercontent.com/').replace('/blob/', '/');
      const r = await image(url);
      if (r && r.ext !== 'ico' && squarish(r)) return { ...r, mono: singleColor(r), src: url };
    }
  } catch {}
  return null;
}

// The website's own high-res icon: apple-touch-icon, SVG icon, or largest <link rel=icon>.
export async function siteIcon(site) {
  let base;
  try { base = new URL(site); } catch { return null; }
  if (GENERIC_HOSTS.test(base.hostname)) return null;
  try {
    const html = (await (await get(base.href)).text()).slice(0, 200000);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((l) => /rel=["'][^"']*icon/i.test(l));
    const score = (l) => {
      const size = +(l.match(/sizes=["'](\d+)/i)?.[1] || 0);
      if (/\.svg|image\/svg/i.test(l)) return 1000;
      if (/apple-touch-icon/i.test(l)) return 500 + size;
      return size || 16;
    };
    const ranked = links.sort((a, b) => score(b) - score(a));
    for (const l of ranked) {
      const href = l.match(/href=["']([^"']+)["']/i)?.[1];
      if (!href || score(l) < 64) continue;
      const r = await image(new URL(href, base).href);
      if (r && r.ext !== 'ico' && squarish(r)) return { ...r, mono: singleColor(r), src: new URL(href, base).href };
    }
    for (const p of ['/apple-touch-icon.png', '/icon.svg', '/logo.svg']) {
      const r = await image(new URL(p, base).href);
      if (r && squarish(r)) return { ...r, mono: singleColor(r), src: new URL(p, base).href };
    }
  } catch {}
  return null;
}

async function orgAvatar(repo) {
  try {
    const owner = await gh(`users/${repo.split('/')[0]}`);
    if (owner.type !== 'Organization') return null;
    const r = await image(`${owner.avatar_url}${owner.avatar_url.includes('?') ? '&' : '?'}s=160`);
    return r && { ...r, mono: false, src: 'github-org-avatar' };
  } catch { return null; }
}

async function resolve(t) {
  const [kind, name] = (t.logo || '').split(':');
  if (kind === 'lobe') { const r = await lobe(name); if (r) return r; }
  if (kind === 'simple') { const r = await simple(name); if (r) return r; }
  if (kind === 'site') { const r = await siteIcon(t.site); if (r) return r; }
  const owner = t.github?.split('/')[0].toLowerCase();
  if (t.discovered && OWNER_BRAND[owner]) { const r = await lobe(OWNER_BRAND[owner]); if (r) return r; }
  if (t.github) { const r = await readmeLogo(t.github); if (r) return r; }
  { const r = await siteIcon(t.site); if (r) return r; }
  if (t.github) { const r = await orgAvatar(t.github); if (r) return r; }
  return null;
}

/** Ensures data/icons/ holds a logo per tool; returns { [id]: { file, mono } }. */
export async function resolveIcons(tools, cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  const manifestUrl = new URL('manifest.json', cacheDir);
  let manifest = {};
  try { manifest = JSON.parse(await readFile(manifestUrl, 'utf8')); } catch {}
  if (manifest.version !== VERSION) manifest = { version: VERSION, icons: {} };

  const queue = tools.filter((t) => {
    const m = manifest.icons[t.id];
    return !m || m.logo !== (t.logo || null) || (!m.file && Date.now() - m.checked > 7 * 864e5); // retry misses weekly
  });
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < queue.length) {
      const t = queue[i++];
      const r = await resolve(t);
      const entry = { logo: t.logo || null, checked: Date.now(), file: null, mono: false, src: null };
      if (r) {
        entry.file = `${t.id}.${r.ext}`; entry.mono = r.mono; entry.src = r.src; entry.tone = r.mono ? null : tone(r);
        await writeFile(new URL(entry.file, cacheDir), r.buf);
      }
      manifest.icons[t.id] = entry;
    }
  }));
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 1));
  return manifest.icons;
}
