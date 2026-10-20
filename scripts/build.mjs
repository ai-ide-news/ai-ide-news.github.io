// Renders data/snapshot.json into a static, SEO-friendly site in dist/.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { TOOLS, CATEGORIES } from './sources.mjs';
import { resolveIcons } from './icons.mjs';
import { pricingFor, PRICING_CHECKED } from './pricing.mjs';
import { LAB_ICONS } from './models.mjs';
import { BENCHMARKS, BENCH_SETS, BENCH_SOURCE, benchKey } from './benchmarks.mjs';
import { AA_SOURCE } from './aa.mjs';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const SITE_URL = (process.env.SITE_URL || 'https://ai-ide-news.github.io').replace(/\/$/, '');
const SITE_NAME = 'Patchwire';
const AUTHOR = { name: 'Abdullah ElTiby', url: 'https://github.com/AbdullahElTiby' };
const REPO_URL = 'https://github.com/ai-ide-news/ai-ide-news.github.io';
const VERIFY = process.env.GOOGLE_SITE_VERIFICATION || '';
const DAY = 86400e3;
// Google AdSense. Unset → no ad code at all. Client alone → Auto ads; slot ids → fixed placements.
const ADS = {
  client: (process.env.ADSENSE_CLIENT || '').trim(),           // ca-pub-XXXXXXXXXXXXXXXX
  side: (process.env.ADSENSE_SLOT_SIDE || '').trim(),          // sidebar unit
  inline: (process.env.ADSENSE_SLOT_INLINE || '').trim(),      // between sections
  preview: process.env.ADS_PREVIEW === '1',                     // local: show placeholder boxes
};
// Cloudflare Web Analytics site token. Unset → no beacon (local builds stay out of the stats).
const CF_BEACON = (process.env.CF_ANALYTICS_TOKEN || '').trim();
// Block the site for visitors running an ad blocker. On whenever AdSense is; ADWALL=1 forces it locally.
const ADWALL = !!ADS.client || process.env.ADWALL === '1';

const snap = JSON.parse(await readFile(new URL('data/snapshot.json', ROOT), 'utf8'));
const NOW = Date.parse(snap.generatedAt);

// ── helpers ───────────────────────────────────────────────
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => {
  const s = Math.max(0, (NOW - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.round(s / 86400 / 30)}mo ago`;
  return `${(s / 86400 / 365).toFixed(1)}y ago`;
};
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dayKey = (iso) => iso.slice(0, 10);
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const time = (iso, cls = '') => `<time class="${cls}" datetime="${esc(iso)}" title="${esc(new Date(iso).toUTCString())}">${ago(iso)}</time>`;
const KIND = { release: 'Release', changelog: 'Changelog', blog: 'Blog', discussion: 'Discussion' };

// Curated tools plus trending ones auto-discovered on GitHub (scripts/discover.mjs).
const discovered = snap.discovered || [];
const tools = [...TOOLS, ...discovered].map((t) => {
  const entry = snap.tools[t.id] || { items: [], meta: {} };
  const items = entry.items;
  const updates = items.filter((i) => i.kind === 'release' || i.kind === 'changelog');
  const latestRelease = items.find((i) => i.kind === 'release');
  const latest = latestRelease || updates[0] || items[0];
  const activity = [...(entry.meta.cadence || []), ...items.filter((i) => i.kind !== 'release').map((i) => i.date)];
  const discussions = snap.discussions.filter((d) => (d.toolIds || [d.toolId]).includes(t.id));
  return { ...t, items, meta: entry.meta || {}, latest, latestRelease, updates, activity, discussions, lastActive: latest?.date || '1970-01-01T00:00:00Z' };
}).sort((a, b) => b.lastActive.localeCompare(a.lastActive));
const byId = Object.fromEntries(tools.map((t) => [t.id, t]));
const trending = tools.filter((t) => t.discovered).sort((a, b) => b.score - a.score);
const trendBadge = (t) => (t.starsPerWeek > 0 ? `↗ +${compact(t.starsPerWeek)}★` : '↗');

// Weekly activity sparkline (12 weeks). Single series → one hue, per-bar hover tooltip.
function sparkline(dates, { weeks = 12, w = 132, h = 32 } = {}) {
  const counts = Array(weeks).fill(0);
  for (const d of dates) {
    const k = Math.floor((NOW - Date.parse(d)) / (7 * DAY));
    if (k >= 0 && k < weeks) counts[weeks - 1 - k]++;
  }
  const max = Math.max(1, ...counts);
  const gap = 2, bw = (w - gap * (weeks - 1)) / weeks;
  const bars = counts.map((c, i) => {
    const bh = c ? Math.max(3, (c / max) * (h - 2)) : 1.5;
    const label = `${c} update${c === 1 ? '' : 's'} · ${weeks - 1 - i === 0 ? 'this week' : `${weeks - 1 - i}w ago`}`;
    return `<g><rect class="hit" x="${(i * (bw + gap)).toFixed(1)}" y="0" width="${(bw + gap).toFixed(1)}" height="${h}"/><rect class="${c ? 'bar' : 'bar zero'}" x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/><title>${label}</title></g>`;
  }).join('');
  const total = counts.reduce((a, b) => a + b, 0);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" role="img" aria-label="${total} updates in the last ${weeks} weeks">${bars}</svg>`;
}

// Real logo per tool (scripts/icons.mjs). Mono logos are CSS masks so they follow the theme;
// org avatars fill the tile; anything missing falls back to the coloured monogram.
let ICONS = {};
const icon = (t, root, size = 'md') => {
  const m = ICONS[t.id];
  const src = m?.file && `${root}icons/${m.file}`;
  const art = !src ? '' : m.mono
    ? `<i class="mono" style="-webkit-mask-image:url('${src}');mask-image:url('${src}')"></i>`
    : `<img${m.src === 'github-org-avatar' ? ' class="fill"' : ''} src="${src}" alt="" loading="lazy" decoding="async" width="40" height="40">`;
  return `<span class="ticon ticon-${size}${src ? ' has-logo' : ''}${m?.tone ? ` tone-${m.tone}` : ''}" style="--c:${t.color}" aria-hidden="true">${art}<b>${esc(t.name[0])}</b></span>`;
};

// Labelled ad unit; renders nothing until AdSense and that slot are configured.
const ad = (kind) => ADS.preview ? `<div class="ad ad-${kind}"><p class="ad-label">Advertisement</p><div class="ad-ph">${kind === 'side' ? 'Sidebar ad · 300×250' : 'Banner ad · responsive'}</div></div>` : (!ADS.client || !ADS[kind] ? '' : `<div class="ad ad-${kind}"><p class="ad-label">Advertisement</p><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ADS.client)}" data-ad-slot="${esc(ADS[kind])}" data-ad-format="${kind === 'side' ? 'rectangle' : 'horizontal'}" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({})</script></div>`);

// Full-width banner between page sections.
const banner = () => (ad('inline') && `<div class="wrap">${ad('inline')}</div>`);

// ── layout ────────────────────────────────────────────────
function layout({ root, path, title, description, body, jsonld, active = '' }) {
  const canonical = `${SITE_URL}/${path}`;
  return `<!doctype html>
<html lang="en" data-theme="dark"${ADWALL ? ' data-adwall' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${AUTHOR.name}">
<meta name="pw-generated" content="${snap.generatedAt}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#121211">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta name="twitter:card" content="summary_large_image">
${VERIFY.split(',').filter(Boolean).map((v) => `<meta name="google-site-verification" content="${esc(v.trim())}">`).join('')}
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} — all AI IDE & CLI updates" href="${root}feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}assets/styles.css?v=${NOW}">
${ADS.client ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ADS.client)}" crossorigin="anonymous"></script>` : ''}
<script>try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;else if(matchMedia('(prefers-color-scheme: light)').matches)document.documentElement.dataset.theme='light'}catch(e){}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap nav-in">
    <a class="brand" href="${root}" aria-label="${SITE_NAME} home">
      <span>${SITE_NAME}</span>
    </a>
    <nav class="nav-links" aria-label="Primary">
      ${news.length ? `<a href="${root}news/" ${active === 'news' ? 'aria-current="page"' : ''}>News</a>` : ''}
      ${models.length ? `<a href="${root}models/" ${active === 'models' ? 'aria-current="page"' : ''}>Models</a>` : ''}
      <a href="${root}#versions" ${active === 'versions' ? 'aria-current="page"' : ''}>Latest versions</a>
      <a href="${root}#feed">Changelog</a>
      ${trending.length ? `<a href="${root}#trending">Trending</a>` : ''}
      <a href="${root}#discussions">Community</a>
      <a href="${root}compare/" ${active === 'compare' ? 'aria-current="page"' : ''}>Compare</a>
      <a href="${root}tools/">All tools</a>
    </nav>
    <div class="nav-actions">
      <button class="icon-btn" id="theme" type="button" aria-label="Toggle color theme"><svg class="sun" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></g></svg><svg class="moon" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1"/></svg></button>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div>
      <a class="brand" href="${root}"><span>${SITE_NAME}</span></a>
      <p>Real-time changelog tracker for AI IDEs, coding CLIs and editor agents. Data is pulled straight from official GitHub releases, official changelog &amp; blog RSS feeds, and Hacker News — refreshed automatically every few hours. Trending tools are discovered automatically from GitHub. No mock data.</p>
    </div>
    <div class="foot-meta">
      <p>Last refreshed ${time(snap.generatedAt, 'live-ago')}</p>
      <p><a href="${root}feed.xml">RSS</a> · <a href="${root}data.json">JSON API</a> · <a href="${REPO_URL}" rel="noopener">GitHub</a></p>
      <p class="credit">Made by <a href="${AUTHOR.url}" rel="author noopener">${AUTHOR.name}</a> · <a href="${AUTHOR.url}" rel="noopener">github.com/AbdullahElTiby</a></p>
      <p class="muted">Not affiliated with any of the tools listed. All trademarks belong to their owners.</p>
    </div>
  </div>
</footer>
<script src="${root}assets/app.js?v=${NOW}" defer></script>
${CF_BEACON ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${esc(JSON.stringify({ token: CF_BEACON }))}'></script>` : ''}
</body>
</html>`;
}

// ── components ────────────────────────────────────────────
function feedCard(item, root, { full = false } = {}) {
  const t = byId[item.toolId];
  const cat = t.category;
  const text = `${t.name} ${item.title} ${item.version || ''} ${t.vendor}`.toLowerCase();
  const notes = full && item.html ? `<details class="notes"><summary>Read full notes</summary><div class="prose">${item.html}</div></details>` : '';
  return `<article class="fcard" data-id="${esc(item.id)}" data-kind="${item.kind}" data-cat="${cat}" data-trend="${t.discovered ? 1 : 0}" data-tool="${t.id}" data-text="${esc(text)}" style="--c:${t.color}">
  <div class="fcard-rail">${icon(t, root, 'sm')}</div>
  <div class="fcard-body">
    <div class="fcard-meta">
      ${full ? '' : `<a class="fcard-tool" href="${root}tools/${t.id}/">${esc(t.name)}</a>`}
      <span class="kind kind-${item.kind}">${KIND[item.kind]}</span>
      ${item.version ? `<code class="ver">${esc(item.version)}</code>` : ''}
      ${time(item.date, 'fcard-time')}
    </div>
    <h3 class="fcard-title"><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a></h3>
    ${item.summary ? `<p class="fcard-sum">${esc(item.summary)}</p>` : ''}
    ${notes}
  </div>
</article>`;
}

function timeline(items, root, opts) {
  let out = '', last = '';
  for (const it of items) {
    const k = dayKey(it.date);
    if (k !== last) {
      const diff = Math.floor((Date.parse(dayKey(snap.generatedAt)) - Date.parse(k)) / DAY);
      const label = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : new Date(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
      out += `<h2 class="day" data-day="${k}"><span>${label}</span><i></i><small>${fmtDate(k + 'T00:00:00Z')}</small></h2>`;
      last = k;
    }
    out += feedCard(it, root, opts);
  }
  return out;
}

function discussionList(list, root, limit = 14) {
  if (!list.length) return '<p class="muted small">No recent Hacker News threads.</p>';
  return `<ol class="hn">${list.slice(0, limit).map((d, i) => {
    const t = byId[d.toolId];
    return `<li style="--c:${t.color}"><span class="hn-rank">${String(i + 1).padStart(2, '0')}</span><div>
      <a class="hn-title" href="${esc(d.hnUrl)}" target="_blank" rel="noopener">${esc(d.title)}</a>
      <div class="hn-meta"><span class="pts">▲ ${d.points}</span><span>${d.comments} comments</span><a href="${root}tools/${t.id}/">${esc(t.name)}</a>${time(d.date)}</div>
    </div></li>`;
  }).join('')}</ol>`;
}

// Important news only (scripts/news.mjs scores and filters it).
const news = snap.news || [];
const sourceLink = (s) => `<a class="src${/^X ·/.test(s.name) ? ' src-x' : /^Hacker News/.test(s.name) ? ' src-hn' : ''}" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name.replace(/^X · /, ""))}</a>`;
function newsCard(n, root, { lead = false } = {}) {
  const ts = n.toolIds.map((id) => byId[id]).filter(Boolean);
  const c = ts[0]?.color || '#d4ff3f';
  return `<article class="ncard${lead ? ` ncard-lead${n.summary ? ' tall' : ''}` : ''}${n.major ? ' major' : ''}" data-tag="${esc(n.tag.toLowerCase())}" style="--c:${c}">
  <div class="ncard-meta"><span class="ntag ntag-${esc(n.tag.toLowerCase())}">${esc(n.tag)}</span>${n.major ? '<span class="nmajor">Major</span>' : ''}${time(n.date, 'fcard-time')}</div>
  <h3 class="ncard-title"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
  ${n.summary ? `<p class="ncard-sum">${esc(n.summary)}</p>` : ''}
  <div class="ncard-foot">
    ${ts.slice(0, 3).map((t) => `<a class="ntool" href="${root}tools/${t.id}/" style="--c:${t.color}">${icon(t, root, 'sm')}${esc(t.name)}</a>`).join('')}
    <span class="srcs">${n.sources.slice(0, 3).map(sourceLink).join('')}</span>
  </div>
</article>`;
}
// `limit` keeps the 3-column grid free of orphans: a tall lead fills 4 cells, a short one 2.
function newsGrid(list, root, limit = Infinity) {
  if (!list.length) return '<p class="muted">No major news in the last 30 days.</p>';
  const lead = list.find((n) => n.major) || list[0];
  const rest = list.filter((n) => n !== lead);
  const cells = lead.summary ? 4 : 2;
  const n = Math.min(rest.length, limit === Infinity ? rest.length : limit - 1);
  const fit = n > 3 ? n - ((n + cells) % 3) : n;
  return `<div class="ngrid">${newsCard(lead, root, { lead: true })}${rest.slice(0, fit).map((x) => newsCard(x, root)).join('')}</div>`;
}

// ── models ────────────────────────────────────────────────
// New models from the major labs (scripts/models.mjs, via OpenRouter's public catalog).
// Each model carries its best scores from Epoch AI's benchmarking hub (scripts/benchmarks.mjs), when it has any.
const benchScores = snap.benchmarks?.scores || {};
const models = (snap.models || []).map((m) => ({ ...m, bench: benchScores[benchKey(m.id)] || {} }));
const scored = models.filter((m) => Object.keys(m.bench).length);
const BENCH_DEFAULT = BENCHMARKS.find((b) => b.id === 'gpqa');
const SHOWDOWN_START = 5;
const benchMax = Object.fromEntries(BENCHMARKS.map((b) => [b.id, Math.max(0, ...models.map((m) => m.bench[b.id] ?? 0))]));
// Keep in step with fmt()/bar() in src/app.js.
const benchVal = (b, v) => ({
  min: () => (v >= 60 ? `${+(v / 60).toFixed(1)} h` : `${Math.round(v)} min`),
  elo: () => `${Math.round(v)}`,
  usd: () => `$${Math.round(v).toLocaleString('en-US')}`,
  of10: () => `${v.toFixed(2)}/10`,
}[b.unit] || (() => `${(v * 100).toFixed(1)}%`))();
// Arena ratings start around 1000, so their bars measure from there.
const benchBar = (b, v, max) => Math.max(2, Math.round((b.unit === 'elo' ? (v - 1000) / (max - 1000) : v / max) * 100));
const benchCell = (m, b) => (m.bench[b.id] == null ? '<span class="muted">—</span>'
  : `<span class="mbench">${benchVal(b, m.bench[b.id])}<i style="--w:${benchBar(b, m.bench[b.id], benchMax[b.id])}%"></i></span>`);
const tokens = (n) => (n == null ? '—' : n % 1048576 === 0 ? `${n / 1048576}M` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}K`);
const mprice = (n) => (n === 0 ? 'Free' : `$${n < 0.1 ? +n.toFixed(3) : n.toFixed(2)}`);
const labTile = (m, root) => icon({ id: `lab-${m.labId}`, name: m.lab, color: m.color }, root, 'sm');
const modelTags = (m) => [
  m.free && '<span class="pbadge free">Free tier</span>',
  m.reasoning && '<span class="pbadge">Reasoning</span>',
  m.openWeights && '<span class="pbadge">Open weights</span>',
  m.modalities.includes('image') && '<span class="pbadge">Vision</span>',
].filter(Boolean).join('');
// Detail pages: models/<lab>/<model>/ and models/<lab>/.
const modelPath = (m) => `models/${m.labId}/${m.id.split('/').slice(1).join('/')}/`;
const labPath = (labId) => `models/${labId}/`;
const labs = Object.values(Object.groupBy(models, (m) => m.labId)).sort((a, b) => b.length - a.length);
// Showdown starts with each lab's newest well-scored flagship (small "flash/mini/lite" tiers skipped), newest first.
const flagships = scored.filter((m) => BENCH_SETS[0].ids.filter((id) => m.bench[id] != null).length >= 3 && !/\b(flash|mini|nano|lite|haiku|air)\b/i.test(m.name));
const showdown = flagships.filter((m, i) => flagships.findIndex((x) => x.labId === m.labId) === i).slice(0, SHOWDOWN_START).map((m) => m.id);
// Link into the Models page showdown with these models picked (max 6, as in src/app.js).
const showdownHref = (root, ids) => `${root}models/?vs=${[...new Set(ids)].slice(0, 6).map(encodeURIComponent).join(',')}#showdown`;
// Where a score places among every tracked model with one (higher is better for all benchmarks).
const benchRank = (b, v) => ({ rank: 1 + models.filter((x) => (x.bench[b.id] ?? -Infinity) > v).length, of: models.filter((x) => x.bench[b.id] != null).length });
const modelText = (m) => esc(`${m.name} ${m.lab} ${m.id} ${m.reasoning ? 'reasoning' : ''} ${m.openWeights ? 'open weights' : ''} ${m.free ? 'free' : ''} ${m.modalities.join(' ')}`.toLowerCase());

function modelCard(m, root) {
  const fresh = NOW - Date.parse(m.date) < 3 * DAY;
  return `<a class="mcard" href="${root}${modelPath(m)}" style="--c:${m.color}">
  ${labTile(m, root)}
  <span class="vcard-name"><strong>${esc(m.name)}</strong>${fresh ? '<span class="fresh" title="Listed in the last 3 days">new</span>' : ''}<small>${esc(m.lab)} · ${tokens(m.context)} context</small></span>
  <span class="mcard-price" title="USD per million input / output tokens">${m.input === 0 && m.output === 0 ? 'Free' : `${mprice(m.input)} / ${mprice(m.output)}`}<small>per 1M in / out</small></span>
  <span class="vcard-meta">${time(m.date)}<small>${fmtDate(m.date).replace(/, \d{4}$/, '')}</small></span>
</a>`;
}

function modelRow(m, root) {
  const bdata = BENCHMARKS.map((b) => (m.bench[b.id] == null ? '' : ` data-b-${b.id}="${m.bench[b.id]}"`)).join('');
  return `<tr class="prow mrow" data-id="${esc(m.id)}"${bdata} data-cat="${m.labId}" data-trend="0" data-free="${m.free ? 1 : 0}" data-text="${modelText(m)}" data-date="${m.date}" data-context="${m.context || 0}" data-input="${m.input}" data-output="${m.output}" data-name="${esc(m.name.toLowerCase())}" style="--c:${m.color}">
  <th scope="row"><div class="ptool-cell"><button type="button" class="pick" data-pick="${esc(m.id)}" aria-pressed="false" aria-label="Add ${esc(m.name)} to comparison" title="Add to comparison"></button><div class="ptool">${labTile(m, root)}<span><a class="ptool-name" href="${root}${modelPath(m)}"><strong>${esc(m.name)}</strong></a><small><a class="lab-link" href="${root}${labPath(m.labId)}">${esc(m.lab)}</a> · <code>${esc(m.id)}</code></small></span></div></div>${m.summary ? `<p class="msum">${esc(m.summary)}</p>` : ''}<div class="mtags">${modelTags(m)}</div></th>
  <td class="mnum">${fmtDate(m.date)}<small>${time(m.date)}</small></td>
  <td class="mnum">${tokens(m.context)}${m.maxOutput ? `<small>${tokens(m.maxOutput)} out</small>` : ''}</td>
  <td class="mnum">${mprice(m.input)}</td>
  <td class="mnum">${mprice(m.output)}</td>
  <td class="mnum mbench-cell">${benchCell(m, BENCH_DEFAULT)}</td>
</tr>`;
}

function modelsSection(root) {
  if (!models.length) return '';
  return `<section id="models" class="wrap section">
  <div class="section-head">
    <div><p class="eyebrow">Just released</p><h2>New models</h2></div>
    <p class="muted small section-note">The newest models from Anthropic, OpenAI, Google, xAI, DeepSeek, Qwen and other major labs, with context window and API price per million tokens.</p>
  </div>
  <div class="vgrid mgrid">${models.slice(0, 10).map((m) => modelCard(m, root)).join('')}</div>
  <p class="more-link"><a class="btn ghost" href="${root}models/">All ${models.length} models →</a></p>
</section>`;
}

// ── leaderboard ───────────────────────────────────────────
// Composite indexes: each benchmark score as a share of the best score any model has on it,
// averaged over the set's benchmarks the model has (at least `min`), then ×100.
const LB_INDEXES = [
  { id: 'intel', name: 'Intelligence', tone: 'accent', desc: 'Patchwire index across reasoning, knowledge, maths and coding', ids: ['gpqa', 'hle', 'arc2', 'fm', 'simple', 'critpt', 'swe', 'tb'], min: 4 },
  { id: 'code', name: 'Coding', tone: 'release', desc: 'Index across SWE-bench, Terminal-Bench, DeepSWE and 7 more coding benchmarks', ids: ['swe', 'tb', 'dswe', 'fswe', 'cursor', 'fcode', 'aider', 'scicode', 'gso', 'mirror'], min: 3 },
  { id: 'agents', name: 'Agents', tone: 'changelog', desc: 'Index across APEX-Agents, OSWorld, GDPval, Remote Labor Index and more', ids: ['apex', 'rli', 'osw2', 'osw', 'gdpval', 'ptb', 'tb'], min: 2 },
  { id: 'reason', name: 'Reasoning', tone: 'blog', desc: "Index across GPQA, Humanity's Last Exam, ARC-AGI, SimpleBench and more", ids: ['gpqa', 'hle', 'arc2', 'arc1', 'simple', 'critpt', 'chess', 'lmca'], min: 3 },
  { id: 'math', name: 'Maths', tone: 'hn', desc: 'Index across FrontierMath (tiers 1–4), ProofBench and OTIS Mock AIME', ids: ['fm', 'fm4', 'proof', 'aime'], min: 2 },
];
const lbIndex = (m, ix) => {
  const ids = ix.ids.filter((id) => m.bench[id] != null && benchMax[id] > 0);
  return ids.length < ix.min ? null : Math.round((ids.reduce((s, id) => s + m.bench[id] / benchMax[id], 0) / ids.length) * 100);
};
const blended = (m) => (3 * m.input + m.output) / 4;
const LB_TOP = 12;
// Artificial Analysis rows matched to our models by slug ("claude-opus-5-5", plus effort suffixes like "-max");
// several efforts of one model keep the best value of each metric.
const AA_EFFORT = /^(-(reasoning|non-reasoning|thinking|adaptive|minimal|low|medium|high|xhigh|max|\d{4,}))*$/;
const aaList = snap.aa?.models || [];
const aaFor = Object.fromEntries(models.map((m) => {
  const keys = [benchKey(m.id), m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')];
  const hits = aaList.filter((a) => keys.some((k) => a.slug === k || (a.slug.startsWith(`${k}-`) && AA_EFFORT.test(a.slug.slice(k.length)))));
  if (!hits.length) return [m.id, null];
  const best = (f, lo) => hits.map((a) => a[f]).filter((v) => v != null).sort((a, b) => (lo ? a - b : b - a))[0] ?? null;
  return [m.id, { intel: best('intel'), code: best('code'), math: best('math'), speed: best('speed'), price: best('price', true) }];
}));
const hasAA = Object.values(aaFor).filter((a) => a?.intel != null).length >= 5;

function lbChart(view, rows, root) {
  const max = Math.max(...rows.map((r) => r.v)) || 1;
  return `<div class="lb-panel" role="tabpanel" id="lb-${view.id}" aria-labelledby="lb-tab-${view.id}"${view.first ? '' : ' hidden'}>
    <div class="lb-head"><h3><i class="lb-sq" style="--t:var(--${['accent', 'hn'].includes(view.tone) ? view.tone : `k-${view.tone}`})"></i>${esc(view.name)}</h3><p class="muted small">${esc(view.desc)} · <b>${view.lower ? 'Lower' : 'Higher'} is better</b></p></div>
    <div class="lb-scroll"><ol class="lb-chart" style="--n:${rows.length}">
      ${rows.map(({ m, v }) => `<li style="--c:${m.color};--h:${Math.max(1.5, (v / max) * 100).toFixed(1)}%">
        <a href="${root}${modelPath(m)}" title="${esc(`${m.name} (${m.lab}) — ${view.fmt(v)}`)}">
          <span class="lb-col"><i class="lb-bar"><span class="lb-v">${view.fmt(v)}</span></i></span>
          ${labTile(m, root)}
          <span class="lb-name">${esc(m.name)}</span>
        </a></li>`).join('')}
    </ol></div>
  </div>`;
}

function leaderboard(root) {
  const top = (rows) => rows.filter((r) => r.v != null).sort((a, b) => b.v - a.v).slice(0, LB_TOP);
  const epoch = (ix) => ({ ...ix, fmt: (v) => String(v), rows: top(models.map((m) => ({ m, v: lbIndex(m, ix) }))) });
  const aaView = (id, name, tone, desc, f, fmt = (v) => String(Math.round(v))) => ({ id, name, tone, desc, fmt, rows: top(models.map((m) => ({ m, v: aaFor[m.id]?.[f] ?? null }))) });
  const [intel, code, ...rest] = LB_INDEXES;
  const views = (hasAA ? [
    aaView('intel', 'Intelligence', 'accent', 'Artificial Analysis Intelligence Index', 'intel'),
    aaView('speed', 'Speed', 'hn', 'Median output tokens per second on the first-party API', 'speed'),
    aaView('code', 'Coding', 'release', 'Artificial Analysis Coding Index', 'code'),
  ] : [epoch(intel), epoch(code)]).concat(rest.map(epoch)).filter((v) => v.rows.length >= 5);
  if (!views.length) return '';
  // Price and context for the same smartest models, so the trade-off is visible.
  const pool = views[0].rows.map((r) => r.m);
  const price = (m) => aaFor[m.id]?.price ?? (m.input > 0 ? blended(m) : null);
  views.splice(Math.min(views.length, hasAA ? 2 : 1), 0,
    { id: 'price', name: 'Price', tone: 'accent', lower: true, desc: `Blended USD per 1M tokens (3:1 input to output) for the top ${pool.length} by intelligence`, fmt: (v) => `$${v < 10 ? v.toFixed(2) : v.toFixed(1)}`, rows: pool.map((m) => ({ m, v: price(m) })).filter((r) => r.v != null).sort((a, b) => a.v - b.v) });
  views.push({ id: 'context', name: 'Context window', tone: 'changelog', desc: `Maximum input tokens for the top ${pool.length} by intelligence`, fmt: tokens, rows: pool.filter((m) => m.context).map((m) => ({ m, v: m.context })).sort((a, b) => b.v - a.v) });
  views[0].first = true;
  return `<section id="leaderboard" class="wrap section lb">
  <div class="section-head">
    <div><p class="eyebrow">At a glance</p><h2>Leaderboard</h2></div>
    <p class="muted small section-note">The top models on each measure${hasAA ? `, with intelligence, coding, speed and price from <a href="${AA_SOURCE.url}" target="_blank" rel="noopener">${AA_SOURCE.name}</a>` : ''}. Our own index scores (from <a href="${BENCH_SOURCE.url}" target="_blank" rel="noopener">${BENCH_SOURCE.name}</a> results) average each benchmark as a share of the best score any model has reached on it, so 100 would mean best on everything. Click a bar for the model's page.</p>
  </div>
  <div class="lb-body">
    <div class="lb-nav" role="tablist" aria-label="Leaderboard metric" aria-orientation="vertical">
      ${views.map((v) => `<button type="button" role="tab" id="lb-tab-${v.id}" aria-controls="lb-${v.id}" aria-selected="${!!v.first}"${v.first ? '' : ' tabindex="-1"'}>${esc(v.name)}</button>`).join('')}
    </div>
    <div class="lb-panels">${views.map((v) => lbChart(v, v.rows, root)).join('')}</div>
  </div>
</section>`;
}

function modelsPage() {
  const root = '../';
  const month = models.filter((m) => NOW - Date.parse(m.date) < 30 * DAY);
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Models</p>
  <h1>Every new <em>AI model</em>, as it lands</h1>
  <p class="lede">${models.length} models from ${labs.length} labs — ${month.length} new in the last 30 days. Release date, context window, API price and benchmark scores for each, with a head-to-head benchmark table you can build yourself.</p>
  <div class="hero-search">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="q" type="search" placeholder="Search models, labs, reasoning, vision…" aria-label="Search models" autocomplete="off">
    <kbd>/</kbd>
  </div>
</section>

${leaderboard(root)}
${banner()}
${showdown.length ? `<section id="showdown" class="wrap section sd-section" data-start="${showdown.join(',')}">
  <div class="section-head">
    <div><p class="eyebrow">Head to head</p><h2>Benchmark showdown</h2></div>
    <p class="muted small section-note">Pick a ready-made set or choose your own benchmarks. Click a model to highlight it, click a benchmark to rank the models by it. Bold is the best score in each row.</p>
  </div>
  <div class="sd-sets">
    <div class="chips" role="group" aria-label="Benchmark set">
      ${BENCH_SETS.map((s, i) => `<button type="button" class="chip${i ? '' : ' on'}" data-set="${s.id}" aria-pressed="${!i}">${esc(s.name)}</button>`).join('')}
    </div>
    <details class="sd-pick">
      <summary class="btn ghost">Choose benchmarks <i class="sd-pick-n"></i></summary>
      <div class="sd-pick-body">
        ${Object.entries(Object.groupBy(BENCHMARKS, (b) => b.group)).map(([g, list]) => `<fieldset><legend>${esc(g)}</legend>${list.map((b) => `<label title="${esc(b.desc)}"><input type="checkbox" value="${b.id}"><span>${esc(b.name)}</span><i>${models.filter((m) => m.bench[b.id] != null).length}</i></label>`).join('')}</fieldset>`).join('')}
        <p class="muted small">The number is how many tracked models have a score.</p>
      </div>
    </details>
  </div>
  <div class="sd-ctl">
    <div class="sd-add">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="sd-q" type="search" list="sd-list" placeholder="Add a model to compare…" aria-label="Add a model to the showdown" autocomplete="off">
      <datalist id="sd-list">${scored.map((m) => `<option value="${esc(m.name)}">${esc(m.lab)}</option>`).join('')}</datalist>
    </div>
    <label class="pctl-check"><input type="checkbox" id="sd-diff"> Show gap to highlighted model</label>
    <label class="pctl-check"><input type="checkbox" id="sd-bars" checked> Bars</label>
    <button type="button" class="btn ghost sd-reset">Reset</button>
  </div>
  <div class="sd-wrap"><table class="sd" aria-describedby="sd-foot"></table></div>
  <div class="sd-suggest" hidden></div>
  <p id="sd-foot" class="muted small sd-foot"></p>
</section>` : ''}
<section class="wrap section">
  <div class="section-head">
    <div class="chips" role="group" aria-label="Filter by price">
      <button class="chip on" data-free="all">All models</button>
      <button class="chip" data-free="1">Has a free tier</button>
    </div>
    <div class="tabs" role="tablist" aria-label="Filter by lab">
      <button role="tab" aria-selected="true" data-cat="all">All <i>${models.length}</i></button>
      ${labs.map((l) => `<button role="tab" aria-selected="false" data-cat="${l[0].labId}">${esc(l[0].lab)} <i>${l.length}</i></button>`).join('')}
    </div>
  </div>
  ${scored.length ? `<div class="pctl">
    <label class="pctl-bench"><span>Benchmark column</span><select id="bench">${Object.entries(Object.groupBy(BENCHMARKS, (b) => b.group)).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((b) => `<option value="${b.id}"${b === BENCH_DEFAULT ? ' selected' : ''}>${esc(b.name)} (${models.filter((m) => m.bench[b.id] != null).length})</option>`).join('')}</optgroup>`).join('')}</select></label>
    <label class="pctl-check"><input type="checkbox" id="scored-only"> Only models with benchmark scores <i>${scored.length}</i></label>
    <p class="pctl-hint muted small"><span class="pick-dot" aria-hidden="true"></span>Tick a model to add it to the showdown.</p>
  </div>` : ''}
  <div class="ptable-wrap">
    <table class="ptable mtable">
      <thead><tr>
        <th scope="col" aria-sort="none"><button type="button" class="psort msort" data-sort="name">Model</button></th>
        <th scope="col" aria-sort="descending"><button type="button" class="psort msort" data-sort="date">Released</button></th>
        <th scope="col" aria-sort="none"><button type="button" class="psort msort" data-sort="context">Context</button></th>
        <th scope="col" aria-sort="none"><button type="button" class="psort msort" data-sort="input">Input <small>/ 1M</small></button></th>
        <th scope="col" aria-sort="none"><button type="button" class="psort msort" data-sort="output">Output <small>/ 1M</small></button></th>
        <th scope="col" aria-sort="none"><button type="button" class="psort msort" data-sort="bench" title="${esc(BENCH_DEFAULT.desc)}">${esc(BENCH_DEFAULT.name)}</button></th>
      </tr></thead>
      <tbody>${models.map((m) => modelRow(m, root)).join('')}</tbody>
    </table>
  </div>
  <p class="empty" hidden>No models match these filters.</p>
  <div class="ctray" hidden role="region" aria-label="Comparison tray">
    <div class="wrap ctray-in"><div class="ctray-picks"></div><span class="ctray-n muted small"></span><button type="button" class="btn ctray-go">View showdown ↑</button></div>
  </div>
  <script type="application/json" id="mcmp-data">${JSON.stringify({
    benchmarks: BENCHMARKS.map(({ id, name, desc, unit, group }) => ({ id, name, desc, unit, group })),
    sets: BENCH_SETS,
    models: Object.fromEntries(models.map((m) => [m.id, {
      name: m.name, lab: m.lab, color: m.color, url: m.url, page: `${root}${modelPath(m)}`, icon: labTile(m, root), released: fmtDate(m.date),
      context: tokens(m.context), maxOutput: m.maxOutput ? tokens(m.maxOutput) : '', input: m.input, output: m.output,
      tags: modelTags(m), bench: m.bench,
    }])),
  }).replace(/</g, '\\u003c')}</script>
  ${ad('inline')}
  <p class="muted small section-note">Dates are when each model was listed on OpenRouter, usually its launch day. Prices are OpenRouter's USD rate per million tokens; first-party API prices can differ. “Free tier” means a rate-limited free variant exists. Benchmark scores are the best result per model (across reasoning settings and agents) from <a href="${BENCH_SOURCE.url}" target="_blank" rel="noopener">${BENCH_SOURCE.name}'s benchmarking hub</a>, licensed CC BY 4.0${snap.benchmarks?.fetchedAt ? `, updated ${fmtDate(snap.benchmarks.fetchedAt)}` : ''}; “—” means the model hasn't been scored yet.</p>
</section>`;
  return layout({
    root, path: 'models/', active: 'models',
    title: `New AI Models — Benchmarks, Context & API Pricing Compared | ${SITE_NAME}`,
    description: `The newest AI models from ${labs.slice(0, 6).map((l) => l[0].lab).join(', ')} and more: ${models.slice(0, 5).map((m) => m.name).join(', ')}. Release dates, context windows and API prices, updated automatically.`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'New AI models',
      itemListElement: models.slice(0, 50).map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.name, url: `${SITE_URL}/${modelPath(m)}` })),
    },
    body,
  });
}

const yesNo = (v) => (v ? 'Yes' : 'No');
const priceLine = (m) => (m.input === 0 && m.output === 0 ? 'Free' : `${mprice(m.input)} / ${mprice(m.output)}`);

// Benchmark scores grouped like the showdown picker, each with its rank among every scored model.
function benchTable(m, root) {
  const rows = BENCHMARKS.filter((b) => m.bench[b.id] != null);
  if (!rows.length) return `<p class="muted">No benchmark scores yet — <a href="${BENCH_SOURCE.url}" target="_blank" rel="noopener">${BENCH_SOURCE.name}</a> hasn't evaluated ${esc(m.name)}. Scores appear here automatically once it does.</p>`;
  return `<div class="ptable-wrap"><table class="ptable dtable">
    <thead><tr><th scope="col">Benchmark</th><th scope="col">Score</th><th scope="col">Rank</th><th scope="col">Leader</th></tr></thead>
    <tbody>${rows.map((b) => {
      const v = m.bench[b.id], { rank, of } = benchRank(b, v);
      const top = models.find((x) => x.bench[b.id] === benchMax[b.id]);
      return `<tr><th scope="row"><strong>${esc(b.name)}</strong><small>${esc(b.group)} · ${esc(b.desc)}</small></th>
        <td class="mnum">${benchCell(m, b)}</td>
        <td class="mnum">${rank === 1 ? '<span class="pbadge free">#1</span>' : `#${rank}`}<small>of ${of}</small></td>
        <td>${top && top.id !== m.id ? `<a href="${root}${modelPath(top)}">${esc(top.name)}</a><small>${benchVal(b, benchMax[b.id])}</small>` : '<span class="muted">This model</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

// A model's standout benchmarks: where it lands in the top half of every scored model, best first.
function strengths(m) {
  const top = BENCHMARKS.filter((b) => m.bench[b.id] != null).map((b) => ({ b, ...benchRank(b, m.bench[b.id]) }))
    .filter((s) => s.of >= 5).map((s) => ({ ...s, pct: Math.max(1, Math.ceil((s.rank / s.of) * 100)) }))
    .filter((s) => s.pct <= 50).sort((a, b) => a.pct - b.pct).slice(0, 4);
  return top.length ? `<ul class="strengths" aria-label="Standout benchmarks">${top.map(({ b, rank, of, pct }) => `<li title="#${rank} of ${of} scored models"><b>${rank === 1 ? '#1' : `Top ${pct}%`}</b>${esc(b.name)}</li>`).join('')}</ul>` : '';
}

// Price vs. score scatter for one benchmark, with the value frontier: the best score money can buy at each price.
// Every model is drawn as its lab's logo. src/app.js adds zoom and pan (it reads the scale from the data-* attributes).
function valueChart(m, root) {
  const b = [BENCH_DEFAULT, ...BENCHMARKS].find((x) => m.bench[x.id] != null && models.filter((y) => y.bench[x.id] != null && y.input > 0).length >= 6);
  if (!b || !(m.input > 0)) return '';
  const pts = models.filter((x) => x.bench[b.id] != null && x.input > 0);
  const W = 640, H = 360, P = { l: 52, r: 16, t: 14, b: 34 };
  const lx = pts.map((x) => Math.log10(x.input)), x0 = Math.floor(Math.min(...lx)), x1 = Math.max(x0 + 1, Math.ceil(Math.max(...lx)));
  const ys = pts.map((x) => x.bench[b.id]), pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const X = (v) => +(P.l + ((Math.log10(v) - x0) / (x1 - x0)) * (W - P.l - P.r)).toFixed(1);
  const Y = (v) => +(H - P.b - ((v - y0) / (y1 - y0)) * (H - P.t - P.b)).toFixed(1);
  let best = -Infinity;
  const frontier = [...pts].sort((a, c) => a.input - c.input || c.bench[b.id] - a.bench[b.id]).filter((x) => (x.bench[b.id] > best ? ((best = x.bench[b.id]), true) : false));
  const step = frontier.map((x, i) => `${i ? `H${X(x.input)}` : `M${X(x.input)} ${H - P.b}`} V${Y(x.bench[b.id])}`).join(' ') + ` H${W - P.r}`;
  const v = m.bench[b.id];
  const beaters = pts.filter((x) => x.id !== m.id && x.input <= m.input && x.bench[b.id] > v).sort((a, c) => c.bench[b.id] - a.bench[b.id]);
  const order = [...pts.filter((x) => x.labId !== m.labId), ...pts.filter((x) => x.labId === m.labId && x.id !== m.id), m];
  const dot = (x) => {
    const me = x.id === m.id, kin = !me && x.labId === m.labId, ic = ICONS[`lab-${x.labId}`] || {}, tone = ic.tone;
    return `<a class="vpt${me ? ' me' : kin ? ' kin' : ''}${tone ? ` tone-${tone}` : ''}" href="${root}${modelPath(x)}" data-x="${X(x.input)}" data-y="${Y(x.bench[b.id])}" transform="translate(${X(x.input)} ${Y(x.bench[b.id])})${me ? ' scale(1.5)' : ''}" style="--c:${x.color}">
      <title>${esc(x.name)} (${esc(x.lab)}) — ${benchVal(b, x.bench[b.id])} · ${mprice(x.input)}/1M in</title>
      <circle r="10"/>${ic.file ? `<image class="logo${ic.mono ? ' logo-mono' : ''}" href="${root}icons/${ic.file}" x="-6.5" y="-6.5" width="13" height="13"/>` : `<text class="mono-letter" y="4" text-anchor="middle">${esc(x.lab[0])}</text>`}
    </a>`;
  };
  const yt = [0, 1, 2, 3].map((i) => y0 + pad + ((y1 - y0 - 2 * pad) * i) / 3);
  const xt = Array.from({ length: x1 - x0 + 1 }, (_, i) => 10 ** (x0 + i));
  const mx = X(m.input), anchor = mx > W * 0.7 ? 'end' : 'start';
  return `<figure class="vchart" style="--c:${m.color}">
    <figcaption><strong>${beaters.length ? `${beaters.length} model${beaters.length === 1 ? '' : 's'} score${beaters.length === 1 ? 's' : ''} higher for the same price or less` : 'On the value frontier'}</strong><span class="muted small">${beaters.length ? `on ${esc(b.name)}, e.g. <a href="${root}${modelPath(beaters[0])}">${esc(beaters[0].name)}</a>.` : `No cheaper model beats ${esc(m.name)} on ${esc(b.name)}.`}</span></figcaption>
    <div class="vzoom">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.name)} score against input price for ${pts.length} models"
        data-x0="${x0}" data-x1="${x1}" data-y0="${y0}" data-y1="${y1}" data-unit="${b.unit || 'pct'}" data-pl="${P.l}" data-pr="${W - P.r}" data-pt="${P.t}" data-pb="${H - P.b}">
        <defs><clipPath id="vclip"><rect x="${P.l}" y="${P.t - 12}" width="${W - P.l - P.r + 12}" height="${H - P.t - P.b + 12}"/></clipPath></defs>
        <g class="axes">
          ${yt.map((t) => `<g class="grid"><line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${benchVal(b, t)}</text></g>`).join('')}
          ${xt.map((t) => `<g class="grid"><line x1="${X(t)}" x2="${X(t)}" y1="${P.t}" y2="${H - P.b}"/><text x="${X(t)}" y="${H - P.b + 18}" text-anchor="middle">${mprice(t)}</text></g>`).join('')}
        </g>
        <g clip-path="url(#vclip)">
          <g class="vplot"><path class="frontier" d="${step}"/></g>
          <g class="vpts">${order.map(dot).join('')}</g>
        </g>
        <text class="me-label" data-x="${mx}" data-y="${Y(v)}" data-dx="${anchor === 'end' ? -20 : 20}" x="${mx + (anchor === 'end' ? -20 : 20)}" y="${Y(v) + 4}" text-anchor="${anchor}">${esc(m.name)}</text>
      </svg>
      <div class="vzoom-ctl" hidden>
        <button type="button" class="icon-btn" data-zoom="in" aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" class="icon-btn" data-zoom="out" aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" class="icon-btn" data-zoom="reset" aria-label="Reset zoom" title="Reset zoom">⟲</button>
      </div>
    </div>
    <p class="vchart-key muted small"><span class="k k-me"></span>${esc(m.name)} <span class="k k-kin"></span>Other ${esc(m.lab)} <span class="k"></span>Other labs <span class="k k-front"></span>Value frontier · ${esc(b.name)} vs. input price per 1M tokens (log scale)<span class="vzoom-hint"> · Drag to pan, pinch or Ctrl + scroll to zoom, double-click to zoom in.</span></p>
  </figure>`;
}

// Every release from one lab on an 18-month axis; dots that would overlap stack upward.
function labTimeline(list, root, highlight, { w: W = 640 } = {}) {
  const every = W < 500 ? 6 : 3;
  const P = 16, start = NOW - 540 * DAY, X = (t) => +(P + ((t - start) / (NOW - start)) * (W - 2 * P)).toFixed(1);
  const lanes = [], dots = [...list].sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    const x = X(Date.parse(m.date));
    let lane = lanes.findIndex((last) => x - last >= 12);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = x;
    return { m, x, lane };
  });
  const H = 44 + lanes.length * 13, base = H - 26;
  const months = [];
  for (let d = new Date(start); d <= NOW; d.setUTCMonth(d.getUTCMonth() + 1)) if (d.getUTCMonth() % every === 0) months.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return `<svg class="ltl" style="--c:${list[0].color}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${list.length} releases over the last 18 months">
    <line class="axis" x1="${P}" x2="${W - P}" y1="${base}" y2="${base}"/>
    ${months.filter((t) => t >= start).map((t) => `<g class="grid"><line x1="${X(t)}" x2="${X(t)}" y1="${base}" y2="${base + 5}"/><text x="${X(t)}" y="${base + 18}" text-anchor="middle">${new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</text></g>`).join('')}
    ${dots.map(({ m, x, lane }) => `<a href="${root}${modelPath(m)}"><circle class="pt kin${m.id === highlight ? ' me' : ''}" cx="${x}" cy="${base - 8 - lane * 13}" r="${m.id === highlight ? 6.5 : 5}"><title>${esc(m.name)} — ${fmtDate(m.date)}</title></circle></a>`).join('')}
  </svg>`;
}

const modelList = (list, root) => `<ul class="similar">${list.map((x) => `<li><a href="${root}${modelPath(x)}" style="--c:${x.color}">${labTile(x, root)}<span>${esc(x.name)}</span><code>${fmtDate(x.date).replace(/, \d{4}$/, '')}</code></a></li>`).join('')}</ul>`;

function modelPage(m) {
  const root = '../../../';
  const lab = models.filter((x) => x.labId === m.labId);
  const siblings = lab.filter((x) => x.id !== m.id).slice(0, 8);
  const rivals = models.filter((x) => showdown.includes(x.id) && x.labId !== m.labId);
  const nScores = Object.keys(m.bench).length;
  const body = `
<section class="wrap tool-hero" style="--c:${m.color}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">Home</a><span>/</span><a href="${root}models/">Models</a><span>/</span><a href="${root}${labPath(m.labId)}">${esc(m.lab)}</a><span>/</span><span>${esc(m.name)}</span></nav>
  <div class="tool-head">
    ${icon({ id: `lab-${m.labId}`, name: m.lab, color: m.color }, root, 'xl')}
    <div>
      <p class="eyebrow"><a class="lab-link" href="${root}${labPath(m.labId)}">${esc(m.lab)}</a> · Released ${fmtDate(m.date)}</p>
      <h1>${esc(m.name)}</h1>
      ${m.summary ? `<p class="lede">${esc(m.summary)}</p>` : ''}
      <div class="mtags mtags-hero">${modelTags(m)}</div>
      ${strengths(m)}
      <div class="tool-links">
        ${nScores ? `<a class="btn" href="${showdownHref(root, [m.id, ...rivals.map((x) => x.id)])}">Compare in showdown →</a>` : ''}
        <a class="btn ghost" href="${esc(m.url)}" target="_blank" rel="noopener">OpenRouter ↗</a>
        <a class="btn ghost" href="${root}${labPath(m.labId)}">All ${esc(m.lab)} models</a>
      </div>
    </div>
  </div>
  <dl class="stats tool-stats">
    <div><dt>Released</dt><dd>${fmtDate(m.date).replace(/, \d{4}$/, '')}<small> ${new Date(m.date).getUTCFullYear()}</small></dd></div>
    <div><dt>Context window</dt><dd>${tokens(m.context)}${m.maxOutput ? `<small> ${tokens(m.maxOutput)} out</small>` : ''}</dd></div>
    <div><dt>Input / 1M tokens</dt><dd>${mprice(m.input)}</dd></div>
    <div><dt>Output / 1M tokens</dt><dd>${mprice(m.output)}</dd></div>
  </dl>
</section>

${banner()}

<section class="wrap section">
  <div class="feed-layout">
    <div class="feed">
      ${valueChart(m, root) ? `<div class="section-head"><div><p class="eyebrow">Value</p><h2>Price vs. performance</h2></div></div>${valueChart(m, root)}` : ''}
      <div ${valueChart(m, root) ? 'class="section-head dsub"' : 'class="section-head"'}><div><p class="eyebrow">Benchmarks</p><h2>${nScores ? `${nScores} benchmark score${nScores === 1 ? '' : 's'}` : 'Benchmark scores'}</h2></div></div>
      ${benchTable(m, root)}
      <div class="section-head dsub"><div><p class="eyebrow">Specs</p><h2>Details</h2></div></div>
      <dl class="specs">
        <div><dt>Model ID</dt><dd><code>${esc(m.id)}</code></dd></div>
        <div><dt>Developer</dt><dd><a href="${root}${labPath(m.labId)}">${esc(m.lab)}</a></dd></div>
        <div><dt>Release date</dt><dd>${fmtDate(m.date)} · ${time(m.date)}</dd></div>
        <div><dt>Context window</dt><dd>${m.context ? `${m.context.toLocaleString('en-US')} tokens` : '—'}</dd></div>
        <div><dt>Max output</dt><dd>${m.maxOutput ? `${m.maxOutput.toLocaleString('en-US')} tokens` : '—'}</dd></div>
        <div><dt>API price</dt><dd>${priceLine(m)} <span class="muted">per 1M input / output tokens</span></dd></div>
        <div><dt>Input types</dt><dd>${esc(m.modalities.join(', ') || '—')}</dd></div>
        <div><dt>Reasoning</dt><dd>${yesNo(m.reasoning)}</dd></div>
        <div><dt>Tool calling</dt><dd>${yesNo(m.tools)}</dd></div>
        <div><dt>Open weights</dt><dd>${yesNo(m.openWeights)}</dd></div>
        <div><dt>Free tier</dt><dd>${yesNo(m.free)}</dd></div>
      </dl>
      <p class="muted small section-note">Release date and prices from OpenRouter's catalog; first-party API prices can differ. Benchmark scores are the best result per benchmark from <a href="${BENCH_SOURCE.url}" target="_blank" rel="noopener">${BENCH_SOURCE.name}</a>, licensed CC BY 4.0. Rank counts every model tracked here with a score.</p>
    </div>
    <aside class="side">
      ${ad('side')}
      ${lab.length > 1 ? `<div class="side-card"><p class="eyebrow">Release history</p><h2>${esc(m.lab)} timeline</h2>${labTimeline(lab, root, m.id, { w: 340 })}</div>` : ''}
      ${siblings.length ? `<div class="side-card"><p class="eyebrow">${esc(m.lab)}</p><h2>More from ${esc(m.lab)}</h2>${modelList(siblings, root)}<p class="side-more"><a href="${root}${labPath(m.labId)}">All ${lab.length} ${esc(m.lab)} models →</a></p></div>` : ''}
      ${rivals.length ? `<div class="side-card"><p class="eyebrow">Rivals</p><h2>Other flagships</h2>${modelList(rivals, root)}</div>` : ''}
    </aside>
  </div>
</section>

${banner()}`;
  return layout({
    root, path: modelPath(m), active: 'models',
    title: `${m.name} — Benchmarks, Context Window & API Pricing | ${SITE_NAME}`,
    description: `${m.name} by ${m.lab}, released ${fmtDate(m.date)}: ${tokens(m.context)} context, ${priceLine(m)} per 1M input/output tokens${nScores ? `, ${nScores} benchmark scores` : ''}. ${m.summary || ''}`.slice(0, 300),
    jsonld: {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: m.name, applicationCategory: 'AI model',
      url: `${SITE_URL}/${modelPath(m)}`, datePublished: m.date, creator: { '@type': 'Organization', name: m.lab, url: `${SITE_URL}/${labPath(m.labId)}` },
      ...(m.summary ? { description: m.summary } : {}),
    },
    body,
  });
}

function labPage(list) {
  const root = '../../';
  const [newest] = list, { lab, labId, color } = newest;
  const month = list.filter((m) => NOW - Date.parse(m.date) < 30 * DAY);
  const paid = list.filter((m) => m.input > 0);
  const cheapest = paid.length ? paid.reduce((a, b) => (b.input < a.input ? b : a)) : null;
  const biggest = list.reduce((a, b) => ((b.context || 0) > (a.context || 0) ? b : a));
  const labScored = list.filter((m) => Object.keys(m.bench).length);
  // The lab's best model on each benchmark, with where it ranks overall.
  const bests = BENCHMARKS.map((b) => {
    const top = labScored.filter((m) => m.bench[b.id] != null).sort((x, y) => y.bench[b.id] - x.bench[b.id])[0];
    return top && { b, m: top, ...benchRank(b, top.bench[b.id]) };
  }).filter(Boolean);
  const others = labs.filter((l) => l[0].labId !== labId);
  const span = (Date.parse(newest.date) - Date.parse(list.at(-1).date)) / DAY;
  const cadence = list.length > 2 ? span / (list.length - 1) : null;
  const body = `
<section class="wrap tool-hero" style="--c:${color}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">Home</a><span>/</span><a href="${root}models/">Models</a><span>/</span><span>${esc(lab)}</span></nav>
  <div class="tool-head">
    ${icon({ id: `lab-${labId}`, name: lab, color }, root, 'xl')}
    <div>
      <p class="eyebrow">AI lab · ${list.length} model${list.length === 1 ? '' : 's'} tracked</p>
      <h1>${esc(lab)} <em>models</em></h1>
      <p class="lede">Every ${esc(lab)} model released in the last 18 months, with release dates, context windows, API prices and benchmark scores. Newest: <a href="${root}${modelPath(newest)}">${esc(newest.name)}</a>, ${ago(newest.date)}.</p>
      <div class="tool-links">
        ${labScored.length ? `<a class="btn" href="${showdownHref(root, labScored.slice(0, 6).map((m) => m.id))}">Compare ${esc(lab)} models →</a>` : ''}
        <a class="btn ghost" href="${root}models/">All labs</a>
      </div>
    </div>
  </div>
  <dl class="stats tool-stats">
    <div><dt>Models · 30 days</dt><dd>${month.length}<small> of ${list.length}</small></dd></div>
    <div><dt>Latest release</dt><dd>${ago(newest.date)}</dd></div>
    <div><dt>Cheapest input / 1M</dt><dd>${cheapest ? mprice(cheapest.input) : 'Free'}${cheapest ? `<small> ${esc(cheapest.name)}</small>` : ''}</dd></div>
    <div><dt>Largest context</dt><dd>${tokens(biggest.context)}<small> ${esc(biggest.name)}</small></dd></div>
  </dl>
</section>

<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Release history</p><h2>Timeline</h2></div><p class="muted small section-note">${cadence != null ? `${esc(lab)} ships a new model about every <strong>${cadence < 1.5 ? 'day' : `${Math.round(cadence)} days`}</strong>.` : ''} Each dot is a release; click one to open it.</p></div>
  ${labTimeline(list, root, null, { w: 1200 })}
</section>

${banner()}

<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Lineup</p><h2>All ${esc(lab)} models</h2></div></div>
  <div class="ptable-wrap">
    <table class="ptable dtable">
      <thead><tr><th scope="col">Model</th><th scope="col">Released</th><th scope="col">Context</th><th scope="col">Input <small>/ 1M</small></th><th scope="col">Output <small>/ 1M</small></th><th scope="col">${esc(BENCH_DEFAULT.name)}</th></tr></thead>
      <tbody>${list.map((m) => `<tr>
        <th scope="row"><a class="ptool" href="${root}${modelPath(m)}">${labTile(m, root)}<span><strong>${esc(m.name)}</strong><small><code>${esc(m.id)}</code></small></span></a><div class="mtags">${modelTags(m)}</div></th>
        <td class="mnum">${fmtDate(m.date)}<small>${time(m.date)}</small></td>
        <td class="mnum">${tokens(m.context)}${m.maxOutput ? `<small>${tokens(m.maxOutput)} out</small>` : ''}</td>
        <td class="mnum">${mprice(m.input)}</td>
        <td class="mnum">${mprice(m.output)}</td>
        <td class="mnum">${benchCell(m, BENCH_DEFAULT)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>
</section>

${bests.length ? `<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Benchmarks</p><h2>${esc(lab)}'s best scores</h2></div><p class="muted small section-note">The top ${esc(lab)} model on each benchmark, and where it ranks among all ${models.length} tracked models.</p></div>
  <div class="ptable-wrap"><table class="ptable dtable">
    <thead><tr><th scope="col">Benchmark</th><th scope="col">Best ${esc(lab)} model</th><th scope="col">Score</th><th scope="col">Overall rank</th></tr></thead>
    <tbody>${bests.map(({ b, m, rank, of }) => `<tr><th scope="row"><strong>${esc(b.name)}</strong><small>${esc(b.group)}</small></th>
      <td><a href="${root}${modelPath(m)}">${esc(m.name)}</a></td>
      <td class="mnum">${benchCell(m, b)}</td>
      <td class="mnum">${rank === 1 ? '<span class="pbadge free">#1</span>' : `#${rank}`}<small>of ${of}</small></td></tr>`).join('')}</tbody>
  </table></div>
</section>` : ''}

<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Directory</p><h2>Other labs</h2></div></div>
  <ul class="lab-grid">${others.map((l) => `<li><a href="${root}${labPath(l[0].labId)}" style="--c:${l[0].color}">${labTile(l[0], root)}<span>${esc(l[0].lab)}</span><small>${l.length}</small></a></li>`).join('')}</ul>
  ${ad('inline')}
</section>`;
  return layout({
    root, path: labPath(labId), active: 'models',
    title: `${lab} AI Models — Every Release, Benchmarks & API Pricing | ${SITE_NAME}`,
    description: `All ${list.length} ${lab} models tracked: ${list.slice(0, 5).map((m) => m.name).join(', ')}. Release dates, context windows, API prices and benchmark scores, updated automatically.`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'ItemList', name: `${lab} AI models`,
      itemListElement: list.slice(0, 50).map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.name, url: `${SITE_URL}/${modelPath(m)}` })),
    },
    body,
  });
}

function versionCard(t, root) {
  const l = t.latest;
  const ver = t.latestRelease ? t.latestRelease.version : null;
  const fresh = l && NOW - Date.parse(l.date) < 2 * DAY;
  return `<a class="vcard" href="${root}tools/${t.id}/" data-cat="${t.category}" data-trend="${t.discovered ? 1 : 0}" data-tool="${t.id}" data-text="${esc(`${t.name} ${t.vendor}`.toLowerCase())}" style="--c:${t.color}">
  ${icon(t, root, 'sm')}
  <span class="vcard-name"><strong>${esc(t.name)}</strong>${fresh ? '<span class="fresh" title="Shipped in the last 48 hours">new</span>' : ''}${t.discovered ? `<span class="trend" title="Trending on GitHub${t.starsPerWeek > 0 ? ` · +${t.starsPerWeek} stars this week` : ''}">${trendBadge(t)}</span>` : ''}<small>${esc(t.vendor)} · ${CATEGORIES[t.category].short}</small></span>
  <span class="vcard-ver">${ver ? `<code>${esc(ver)}</code>` : `<span class="vcard-upd">${esc(l?.title || '—')}</span>`}</span>
  <span class="vcard-meta">${l ? time(l.date) : 'no data'}${t.meta.stars ? `<small>★ ${compact(t.meta.stars)}</small>` : ''}</span>
  ${sparkline(t.activity)}
</a>`;
}

const catTabs = (withCounts = true) => `<div class="tabs" role="tablist" aria-label="Filter by category">
  <button role="tab" aria-selected="true" data-cat="all">All${withCounts ? ` <i>${tools.length}</i>` : ''}</button>
  ${Object.entries(CATEGORIES).map(([k, c]) => `<button role="tab" aria-selected="false" data-cat="${k}">${c.label}${withCounts ? ` <i>${tools.filter((t) => t.category === k).length}</i>` : ''}</button>`).join('')}
  ${trending.length ? `<button role="tab" aria-selected="false" data-cat="trending">↗ Trending${withCounts ? ` <i>${trending.length}</i>` : ''}</button>` : ''}
</div>`;

// ── pages ─────────────────────────────────────────────────
function indexPage() {
  const root = '';
  const recent = tools.flatMap((t) => t.items).filter((i) => NOW - Date.parse(i.date) < 75 * DAY).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500);
  const week = recent.filter((i) => NOW - Date.parse(i.date) < 7 * DAY);
  const weekUpdates = week.filter((i) => i.kind !== 'blog').length;
  const shippedToday = new Set(recent.filter((i) => NOW - Date.parse(i.date) < DAY && i.kind !== 'blog').map((i) => i.toolId)).size;
  const ticker = tools.filter((t) => t.latest).slice(0, 18).map((t) => `<span class="tick" style="--c:${t.color}">${icon(t, root, "sm")}${esc(t.name)} <code>${esc(t.latestRelease?.version || KIND[t.latest.kind])}</code> ${time(t.latest.date)}</span>`).join('');
  const hottest = [...snap.discussions].sort((a, b) => b.points - a.points);

  const body = `
<section class="hero wrap">
  <div class="dateline"><span>${new Date(NOW).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span><span><span class="dot"></span>Updated ${time(snap.generatedAt, 'live-ago')}</span><span>${tools.length} tools on the wire</span></div>
  <div class="hero-grid">
    <div>
      <h1>What changed in your AI coding tools, <em>and why it matters.</em></h1>
      <p class="lede">New versions, model launches, pricing changes and security alerts for Cursor, Claude Code, Codex, Gemini CLI, Copilot, Kiro, Zed and ${tools.length - 7} more — straight from official sources, with the noise filtered out.</p>
      <div class="hero-search">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="q" type="search" placeholder="Search tools, versions, features…" aria-label="Search updates" autocomplete="off">
        <kbd>/</kbd>
      </div>
    </div>
    <dl class="stats hero-stats">
      <div><dt>Tools tracked</dt><dd>${tools.length}${trending.length ? `<small> ${trending.length} trending</small>` : ''}</dd></div>
      <div><dt>Updates, last 7 days</dt><dd>${weekUpdates}</dd></div>
      <div><dt>Tools shipped in 24h</dt><dd>${shippedToday}</dd></div>
      <div><dt>HN threads, 60 days</dt><dd>${snap.discussions.length}</dd></div>
    </dl>
  </div>
</section>

<div class="ticker" aria-label="Latest versions"><div class="ticker-track">${ticker}${ticker.replace(/<span class="tick"/g, '<span aria-hidden="true" class="tick"')}</div></div>

${news.length ? `<section id="news" class="wrap section">
  <div class="section-head">
    <div><p class="eyebrow">What matters</p><h2>Important news</h2></div>
    <p class="muted small section-note">Only the stories that change things: launches, new models, pricing &amp; limits, security incidents, deprecations and deals — from official blogs, official X accounts and the biggest Hacker News threads. Routine posts are filtered out.</p>
  </div>
  ${newsGrid(news, root, 9)}
  ${news.length > 7 ? `<p class="more-link"><a class="btn ghost" href="${root}news/">All ${news.length} important stories →</a></p>` : ''}
</section>` : ''}

${modelsSection(root)}

${banner()}

<section id="versions" class="wrap section">
  <div class="section-head">
    <div><p class="eyebrow">Version board</p><h2>Latest versions</h2></div>
    ${catTabs()}
  </div>
  <div class="vgrid" id="vgrid">${tools.map((t) => versionCard(t, root)).join('')}</div>
  <p class="empty" hidden>No tools match your search.</p>
</section>

${banner()}

${trending.length ? `<section id="trending" class="wrap section">
  <div class="section-head">
    <div><p class="eyebrow">Rising on GitHub</p><h2>Trending AI coding tools</h2></div>
    <p class="muted small section-note">Auto-discovered open-source coding agents, IDEs and extensions that are gaining stars and shipping releases. Ranked by star velocity; the list refreshes itself every few hours.</p>
  </div>
  <div class="vgrid">${trending.slice(0, 12).map((t) => versionCard(t, root)).join('')}</div>
  ${trending.length > 12 ? `<p class="more-link"><a class="btn ghost" href="${root}tools/#trending">See all ${trending.length} trending tools →</a></p>` : ''}
</section>` : ''}

${banner()}

<section id="feed" class="wrap section">
  <div class="section-head">
    <div><p class="eyebrow">Everything that shipped</p><h2>The update feed</h2></div>
    <div class="chips" role="group" aria-label="Filter by type">
      <button class="chip on" data-kind="all">All</button>
      <button class="chip" data-kind="release"><i class="k release"></i>Releases</button>
      <button class="chip" data-kind="changelog"><i class="k changelog"></i>Changelogs</button>
      <button class="chip" data-kind="blog"><i class="k blog"></i>Blog posts</button>
    </div>
  </div>
  <div class="feed-layout">
    <div class="feed" id="feedlist" data-page="40">${timeline(recent, root)}</div>
    <aside id="discussions" class="side">
      ${ad('side')}
      <div class="side-card">
        <p class="eyebrow">Community</p>
        <h2>Hot on Hacker News</h2>
        <p class="muted small">Top-voted threads about these tools, last 60 days.</p>
        ${discussionList(hottest, root)}
      </div>
    </aside>
  </div>
  <div class="feed-more"><button id="more" class="btn">Load more updates</button><p class="empty" hidden>Nothing matches these filters.</p></div>
</section>`;

  return layout({
    root, path: '', active: 'home',
    title: `AI IDE & CLI News — Latest Updates for Cursor, Claude Code, Codex, Gemini CLI | ${SITE_NAME}`,
    description: `Live tracker of the latest releases, patches and changelogs for AI IDEs and coding CLIs: Cursor, Claude Code, Codex CLI, Gemini CLI, GitHub Copilot, Kiro, Zed, Windsurf, OpenCode, Cline and more. Real data, updated automatically.`,
    jsonld: {
      '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/`, description: 'Latest news, releases and changelogs for AI IDEs and AI coding CLIs.', author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url } },
        { '@type': 'ItemList', name: 'AI coding tools tracked', itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/tools/${t.id}/`, name: t.name })) },
      ],
    },
    body,
  });
}

function toolPage(t) {
  const root = '../../';
  const rel90 = t.updates.filter((i) => NOW - Date.parse(i.date) < 90 * DAY);
  const rels = t.items.filter((i) => i.kind === 'release');
  const gaps = rels.slice(0, 15).map((r, i, a) => (i ? (Date.parse(a[i - 1].date) - Date.parse(r.date)) / DAY : null)).filter((x) => x != null);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const ver = t.latestRelease?.version;
  const similar = tools.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 6);

  const body = `
<section class="wrap tool-hero" style="--c:${t.color}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">Home</a><span>/</span><a href="${root}tools/">Tools</a><span>/</span><span>${esc(t.name)}</span></nav>
  <div class="tool-head">
    ${icon(t, root, 'xl')}
    <div>
      <p class="eyebrow">${CATEGORIES[t.category].label} · ${esc(t.vendor)}${t.discovered ? ` · <span class="trend">↗ Trending on GitHub</span>` : ''}</p>
      <h1>${esc(t.name)} <em>changelog</em></h1>
      <p class="lede">${esc(t.blurb)}</p>
      <div class="tool-links">
        <a class="btn" href="${esc(t.site)}" target="_blank" rel="noopener">Official site ↗</a>
        ${t.meta.repoUrl ? `<a class="btn ghost" href="${esc(t.meta.repoUrl)}" target="_blank" rel="noopener">GitHub ↗</a>` : ''}
        ${snap.x?.handles?.[t.id]?.handle ? `<a class="btn ghost" href="https://x.com/${esc(snap.x.handles[t.id].handle)}" target="_blank" rel="noopener">𝕏 @${esc(snap.x.handles[t.id].handle)} ↗</a>` : ''}
      </div>
    </div>
  </div>
  <dl class="stats tool-stats">
    <div><dt>${ver ? 'Latest version' : 'Latest update'}</dt><dd>${ver ? `<code>${esc(ver)}</code>` : (t.latest ? fmtDate(t.latest.date) : '—')}</dd></div>
    <div><dt>Last shipped</dt><dd>${t.latest ? ago(t.latest.date) : '—'}</dd></div>
    ${t.discovered ? `<div><dt>GitHub stars</dt><dd>${compact(t.meta.stars || 0)}${t.starsPerWeek > 0 ? `<small> +${compact(t.starsPerWeek)}/wk</small>` : ''}</dd></div>` : `<div><dt>Updates · 90 days</dt><dd>${rel90.length}</dd></div>`}
    <div><dt>${avgGap != null ? 'Avg. release gap' : 'GitHub stars'}</dt><dd>${avgGap != null ? `${avgGap < 1 ? '<1' : avgGap.toFixed(1)}<small> days</small>` : (t.meta.stars ? compact(t.meta.stars) : '—')}</dd></div>
  </dl>
  <div class="tool-spark"><span class="muted small">Weekly activity · last 26 weeks</span>${sparkline(t.activity, { weeks: 26, w: 520, h: 56 })}</div>
</section>

${banner()}

<section class="wrap section">
  <div class="feed-layout">
    <div class="feed tool-feed">
      <div class="section-head"><div><p class="eyebrow">Release history</p><h2>Recent updates</h2></div></div>
      ${t.items.length ? timeline(t.items, root, { full: true }) : '<p class="muted">No updates found yet.</p>'}
    </div>
    <aside class="side">
      ${ad('side')}
      <div class="side-card">
        <p class="eyebrow">Community</p><h2>On Hacker News</h2>
        ${discussionList(t.discussions, root, 10)}
      </div>
      ${plansCard(t, root)}
      <div class="side-card">
        <p class="eyebrow">Compare</p><h2>Similar tools</h2>
        <ul class="similar">${similar.map((s) => `<li><a href="${root}tools/${s.id}/" style="--c:${s.color}">${icon(s, root, 'sm')}<span>${esc(s.name)}</span><code>${esc(s.latestRelease?.version || '')}</code></a></li>`).join('')}</ul>
      </div>
    </aside>
  </div>
</section>

${banner()}`;

  return layout({
    root, path: `tools/${t.id}/`,
    title: `${t.name} Changelog & Latest Version${ver ? ` (${ver})` : ''} — Release Notes | ${SITE_NAME}`,
    description: `${t.name} release notes, latest version${ver ? ` ${ver}` : ''}, patches and news from ${t.vendor}. ${t.blurb} Updated automatically from official sources.`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: t.name, applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Windows, macOS, Linux', url: t.site, publisher: { '@type': 'Organization', name: t.vendor },
      ...(ver ? { softwareVersion: ver } : {}), ...(t.latest ? { dateModified: t.latest.date } : {}),
    },
    body,
  });
}

function toolsIndexPage() {
  const root = '../';
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Directory</p>
  <h1>All <em>${tools.length}</em> tracked tools</h1>
  <p class="lede">Every AI IDE, coding CLI and editor agent we follow — sorted by most recent ship.</p>
</section>

${banner()}
<section class="wrap section">
  <div class="section-head"><div></div>${catTabs()}</div>
  <div class="vgrid">${tools.map((t) => versionCard(t, root)).join('')}</div>
  ${ad('inline')}
</section>`;
  return layout({
    root, path: 'tools/', title: `All AI IDEs & Coding CLIs — Latest Versions | ${SITE_NAME}`,
    description: `Latest versions of ${tools.length} AI coding tools: ${tools.map((t) => t.name).join(', ')}.`, body,
  });
}

function newsPage() {
  const root = '../';
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">News</p>
  <h1>Important <em>news</em></h1>
  <p class="lede">The AI coding stories that actually matter from the last 30 days. Every candidate from official blogs, official X accounts and Hacker News is scored for importance; routine posts never make it here.</p>
</section>

${banner()}
<section class="wrap section">${newsGrid(news, root)}${ad('inline')}</section>`;
  return layout({
    root, path: 'news/', active: 'news', title: `AI Coding News — Launches, Models, Security & Pricing | ${SITE_NAME}`,
    description: `The important AI IDE and coding-agent news: ${news.slice(0, 4).map((n) => n.title).join(' · ')}`, body,
  });
}

// ── pricing ───────────────────────────────────────────────
const usd = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const planPrice = (p) => (p.price == null ? 'Custom' : p.price === 0 ? 'Free' : `${p.from ? 'from ' : ''}${usd(p.price)}<small>/${p.seat ? 'seat/' : ''}mo</small>`);
const pricing = (t) => pricingFor(t.id, { discovered: !!t.discovered });
const startsAt = (pr) => {
  const paid = pr.plans.filter((p) => p.price > 0);
  return paid.length ? Math.min(...paid.map((p) => p.price)) : null;
};

function plansCard(t, root) {
  const pr = pricing(t);
  if (!pr) return '';
  return `<div class="side-card">
    <p class="eyebrow">Pricing</p><h2>Free &amp; paid plans</h2>
    ${pr.note ? `<p class="muted small">${esc(pr.note)}</p>` : ''}
    <ul class="plans">${pr.plans.map((p) => `<li><div><strong>${esc(p.name)}</strong>${p.note ? `<span>${esc(p.note)}</span>` : ''}</div><b class="${p.price === 0 ? 'free' : ''}">${planPrice(p)}</b></li>`).join('')}</ul>
    <p class="muted small">${pr.url ? `<a href="${esc(pr.url)}" target="_blank" rel="noopener">Official pricing ↗</a> · ` : ''}<a href="${root}compare/">Compare all tools →</a></p>
  </div>`;
}

function comparePage() {
  const root = '../';
  const rows = tools.filter((t) => !t.discovered).map((t) => ({ t, pr: pricing(t) })).filter((r) => r.pr)
    .map((r) => ({ ...r, from: startsAt(r.pr), free: r.pr.plans.filter((p) => p.price === 0) }))
    .sort((a, b) => (a.from ?? -1) - (b.from ?? -1) || a.t.name.localeCompare(b.t.name));
  const freeCount = rows.filter((r) => r.free.length).length;
  const row = ({ t, pr, from, free }) => {
    const paid = pr.plans.filter((p) => p.price !== 0);
    return `<tr class="prow" data-id="${t.id}" data-cat="${t.category}" data-trend="0" data-free="${free.length ? 1 : 0}" data-text="${esc(`${t.name} ${t.vendor} ${pr.plans.map((p) => p.name).join(' ')}`.toLowerCase())}" style="--c:${t.color}">
  <th scope="row"><div class="ptool-cell"><button type="button" class="pick" data-pick="${t.id}" aria-pressed="false" aria-label="Add ${esc(t.name)} to comparison" title="Add to comparison"></button><a class="ptool" href="${root}tools/${t.id}/">${icon(t, root, 'sm')}<span><strong>${esc(t.name)}</strong><small>${esc(t.vendor)} · ${CATEGORIES[t.category].short}</small></span></a></div></th>
  <td>${free.length ? free.map((p) => `<div class="pfree"><span class="pbadge free">Free</span><div><strong>${esc(p.name)}</strong>${p.note ? `<small>${esc(p.note)}</small>` : ''}</div></div>`).join('') : '<span class="pbadge none">No free plan</span>'}</td>
  <td><div class="pchips">${paid.length ? paid.map((p) => `<span class="pchip" data-price="${p.price ?? ''}"${p.note ? ` title="${esc(p.note)}"` : ''}><span>${esc(p.name)}</span><b>${planPrice(p)}</b><em class="ptotal" hidden></em>${p.note ? `<small>${esc(p.note)}</small>` : ''}</span>`).join('') : '<span class="muted small">Free only</span>'}</div>${pr.note ? `<p class="pnote">${esc(pr.note)}</p>` : ''}</td>
  <td class="pfrom">${from == null ? '<span class="pbadge free">$0</span>' : `<b class="pfrom-v">${usd(from)}</b><small>/mo</small>`}${pr.url ? `<a href="${esc(pr.url)}" target="_blank" rel="noopener" aria-label="${esc(t.name)} official pricing">Pricing ↗</a>` : ''}</td>
</tr>`;
  };
  // Client-side data for the budget, team-size, sort and side-by-side controls.
  const cmpData = Object.fromEntries(rows.map(({ t, pr }) => [t.id, {
    name: t.name, vendor: t.vendor, color: t.color, href: `${root}tools/${t.id}/`, url: pr.url || '', note: pr.note || '',
    icon: icon(t, root, 'md'), plans: pr.plans.map((p) => ({ name: p.name, price: p.price, seat: !!p.seat, from: !!p.from, note: p.note || '' })),
  }]));
  const oss = tools.filter((t) => t.discovered);
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Compare</p>
  <h1>Free &amp; paid <em>plans</em>, side by side</h1>
  <p class="lede">Every plan for ${rows.length} AI IDEs, coding CLIs and editor agents — what you get for free, and what each paid tier costs per month. ${freeCount} of ${rows.length} have a free option.</p>
  <div class="hero-search">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="q" type="search" placeholder="Search tools or plans…" aria-label="Search plans" autocomplete="off">
    <kbd>/</kbd>
  </div>
</section>

${banner()}
<section class="wrap section">
  <div class="section-head">
    <div class="chips" role="group" aria-label="Filter by price">
      <button class="chip on" data-free="all">All plans</button>
      <button class="chip" data-free="1">Has a free plan</button>
      <button class="chip" data-free="0">Paid only</button>
    </div>
    ${catTabs(false).replace(/\s*<button[^>]*data-cat="trending"[\s\S]*?<\/button>/, '')}
  </div>
  <div class="pctl">
    <label class="pctl-budget"><span>Budget per seat <output id="budget-out">Any</output></span><input id="budget" type="range" min="0" max="12" step="1" value="12" aria-describedby="budget-out"></label>
    <div class="pctl-seats"><span id="seats-l">Team size</span><div class="stepper" role="group" aria-labelledby="seats-l"><button type="button" data-step="-1" aria-label="Fewer seats">−</button><input id="seats" type="number" min="1" max="500" value="1" inputmode="numeric" aria-labelledby="seats-l"><button type="button" data-step="1" aria-label="More seats">+</button></div></div>
    <p class="pctl-hint muted small"><span class="pick-dot" aria-hidden="true"></span>Tick up to 4 tools to compare them side by side.</p>
  </div>
  <div class="ptable-wrap">
    <table class="ptable">
      <thead><tr><th scope="col" aria-sort="none"><button type="button" class="psort" data-sort="name">Tool</button></th><th scope="col">Free plan</th><th scope="col">Paid plans <small>(USD / month)</small></th><th scope="col" aria-sort="ascending"><button type="button" class="psort" data-sort="from">Starts at</button></th></tr></thead>
      <tbody>${rows.map(row).join('')}</tbody>
    </table>
  </div>
  <p class="empty" hidden>No tools match these filters.</p>
  <div class="ctray" hidden role="region" aria-label="Comparison tray">
    <div class="wrap ctray-in"><div class="ctray-picks"></div><span class="ctray-n muted small"></span><button type="button" class="btn ghost ctray-clear">Clear</button><button type="button" class="btn ctray-go">Compare</button></div>
  </div>
  <dialog class="cmp" aria-labelledby="cmp-title">
    <div class="cmp-head"><h2 id="cmp-title">Side by side</h2><p class="muted small cmp-sub"></p><button type="button" class="icon-btn cmp-x" aria-label="Close comparison">×</button></div>
    <div class="cmp-body"></div>
  </dialog>
  <script type="application/json" id="cmp-data">${JSON.stringify(cmpData).replace(/</g, '\\u003c')}</script>
  ${ad('inline')}
  <p class="muted small section-note">Prices checked ${fmtDate(PRICING_CHECKED + 'T00:00:00Z')} from each vendor's official pricing page; monthly billing in USD before tax. Vendors change plans often — always confirm on the official page before you subscribe.</p>
</section>
${oss.length ? `<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Open source</p><h2>Free trending tools</h2></div><p class="muted small section-note">These auto-discovered projects are free and open source — you only pay your model provider (or nothing, with local models).</p></div>
  <ul class="oss-list">${oss.map((t) => `<li><a href="${root}tools/${t.id}/" style="--c:${t.color}">${icon(t, root, 'sm')}<span>${esc(t.name)}</span><span class="pbadge free">Free</span></a></li>`).join('')}</ul>
</section>` : ''}`;
  return layout({
    root, path: 'compare/', active: 'compare',
    title: `AI Coding Tools Pricing Compared — Free vs Paid Plans | ${SITE_NAME}`,
    description: `Compare free and paid plans for ${rows.map((r) => r.t.name).slice(0, 10).join(', ')} and more AI IDEs and coding CLIs. Monthly prices, free tiers and what each plan includes.`,
    body,
  });
}

function rss(items) {
  const x = (s) => esc(s);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${SITE_NAME} — AI IDE &amp; CLI updates</title><link>${SITE_URL}/</link>
<atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
<description>Latest releases, patches and changelogs for AI IDEs and coding CLIs.</description>
<lastBuildDate>${new Date(NOW).toUTCString()}</lastBuildDate>
${items.map((i) => `<item><title>${x(i.title)}</title><link>${x(i.url)}</link><guid isPermaLink="false">${x(i.id)}</guid><pubDate>${new Date(i.date).toUTCString()}</pubDate><category>${x(byId[i.toolId].name)}</category><description>${x(i.summary)}</description></item>`).join('\n')}
</channel></rss>`;
}

// ── write ─────────────────────────────────────────────────
async function icons() {
  await mkdir(new URL('icons/', DIST), { recursive: true });
  const cacheDir = new URL('data/icons/', ROOT);
  ICONS = await resolveIcons([...tools, ...LAB_ICONS], cacheDir);
  await Promise.all(Object.values(ICONS).filter((m) => m.file).map((m) => cp(new URL(m.file, cacheDir), new URL(`icons/${m.file}`, DIST))));
}

const out = async (path, content) => {
  const url = new URL(path, DIST);
  await mkdir(new URL('./', url), { recursive: true });
  await writeFile(url, content);
};

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(new URL('src/', ROOT), new URL('assets/', DIST), { recursive: true });
await cp(new URL('static/', ROOT), DIST, { recursive: true });
await icons();

await out('index.html', indexPage());
await out('tools/index.html', toolsIndexPage());
await out('news/index.html', newsPage());
await out('compare/index.html', comparePage());
if (models.length) await out('models/index.html', modelsPage());
for (const l of labs) await out(`${labPath(l[0].labId)}index.html`, labPage(l));
for (const m of models) await out(`${modelPath(m)}index.html`, modelPage(m));
for (const t of tools) await out(`tools/${t.id}/index.html`, toolPage(t));

const allItems = tools.flatMap((t) => t.items).sort((a, b) => b.date.localeCompare(a.date));
await out('feed.xml', rss(allItems.slice(0, 120)));
await out('data.json', JSON.stringify({
  generatedAt: snap.generatedAt, source: SITE_URL,
  tools: tools.map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, category: t.category, trending: !!t.discovered, site: t.site, latestVersion: t.latestRelease?.version || null, lastUpdate: t.latest?.date || null, stars: t.meta.stars ?? null, url: `${SITE_URL}/tools/${t.id}/` })),
  updates: allItems.slice(0, 300).map(({ html, ...i }) => i),
  discussions: snap.discussions,
  news: news.map(({ score, ...n }) => n),
  models: models.map(({ color, labId, ...m }) => m),
  benchmarkSource: BENCH_SOURCE,
}));
// Tiny file the open page polls to announce new updates without a full reload of data.json.
await out('version.json', JSON.stringify({
  generatedAt: snap.generatedAt,
  latest: allItems.filter((i) => i.kind !== 'blog').slice(0, 30).map((i) => ({ id: i.id, title: i.title, tool: byId[i.toolId].name, url: `${SITE_URL}/tools/${i.toolId}/`, date: i.date })),
  // Pre-rendered home-feed cards, so the open page can insert new updates in place.
  cards: allItems.filter((i) => NOW - Date.parse(i.date) < 2 * DAY).slice(0, 20).map((i) => ({ id: i.id, date: i.date, html: feedCard(i, '') })),
}));
await out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>
<url><loc>${SITE_URL}/news/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>hourly</changefreq><priority>0.9</priority></url>
${models.length ? `<url><loc>${SITE_URL}/models/</loc><lastmod>${models[0].date}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n` : ''}${labs.map((l) => `<url><loc>${SITE_URL}/${labPath(l[0].labId)}</loc><lastmod>${l[0].date}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`).join('')}${models.map((m) => `<url><loc>${SITE_URL}/${modelPath(m)}</loc><lastmod>${snap.benchmarks?.fetchedAt || m.date}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`).join('')}<url><loc>${SITE_URL}/compare/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
<url><loc>${SITE_URL}/tools/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
${tools.map((t) => `<url><loc>${SITE_URL}/tools/${t.id}/</loc><lastmod>${t.lastActive}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`).join('\n')}
</urlset>`);
await out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (ADS.client) await out('ads.txt', `google.com, ${ADS.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0
`);
await out('.nojekyll', '');
console.log(`Built ${tools.length + 4 + (models.length ? 1 + labs.length + models.length : 0)} pages → dist/`);
