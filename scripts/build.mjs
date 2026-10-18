// Renders data/snapshot.json into a static, SEO-friendly site in dist/.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { TOOLS, CATEGORIES } from './sources.mjs';
import { resolveIcons } from './icons.mjs';
import { pricingFor, PRICING_CHECKED } from './pricing.mjs';

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
<html lang="en" data-theme="dark">
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
      <a href="${root}#versions" ${active === 'versions' ? 'aria-current="page"' : ''}>Versions</a>
      <a href="${root}#feed">Feed</a>
      ${trending.length ? `<a href="${root}#trending">Trending</a>` : ''}
      <a href="${root}#discussions">Discussions</a>
      <a href="${root}compare/" ${active === 'compare' ? 'aria-current="page"' : ''}>Compare</a>
      <a href="${root}tools/">All tools</a>
    </nav>
    <div class="nav-actions">
      <a class="icon-btn" href="${root}feed.xml" title="RSS feed" aria-label="RSS feed"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M5 3a16 16 0 0 1 16 16h-3A13 13 0 0 0 5 6zm0 6a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7zm2 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4"/></svg></a>
      <a class="icon-btn" href="${REPO_URL}" title="Source on GitHub" aria-label="Source on GitHub" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2"/></svg></a>
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
  const ticker = tools.filter((t) => t.latest).slice(0, 18).map((t) => `<span class="tick" style="--c:${t.color}"><i></i>${esc(t.name)} <code>${esc(t.latestRelease?.version || KIND[t.latest.kind])}</code> ${time(t.latest.date)}</span>`).join('');
  const hottest = [...snap.discussions].sort((a, b) => b.points - a.points);

  const body = `
<section class="hero wrap">
  <div class="dateline"><span>${new Date(NOW).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span><span><span class="dot"></span>Updated ${time(snap.generatedAt, 'live-ago')}</span><span>${tools.length} tools on the wire</span></div>
  <div class="hero-grid">
    <div>
      <h1>Every AI IDE &amp; CLI release, <em>the moment it ships.</em></h1>
      <p class="lede">Release notes, patches and changelogs for Cursor, Claude Code, Codex, Gemini CLI, Copilot, Kiro, Zed and ${tools.length - 7} more — pulled from official sources into one feed.</p>
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
    return `<tr class="prow" data-cat="${t.category}" data-trend="0" data-free="${free.length ? 1 : 0}" data-text="${esc(`${t.name} ${t.vendor} ${pr.plans.map((p) => p.name).join(' ')}`.toLowerCase())}" style="--c:${t.color}">
  <th scope="row"><a class="ptool" href="${root}tools/${t.id}/">${icon(t, root, 'sm')}<span><strong>${esc(t.name)}</strong><small>${esc(t.vendor)} · ${CATEGORIES[t.category].short}</small></span></a></th>
  <td>${free.length ? free.map((p) => `<div class="pfree"><span class="pbadge free">Free</span><div><strong>${esc(p.name)}</strong>${p.note ? `<small>${esc(p.note)}</small>` : ''}</div></div>`).join('') : '<span class="pbadge none">No free plan</span>'}</td>
  <td><div class="pchips">${paid.length ? paid.map((p) => `<span class="pchip"${p.note ? ` title="${esc(p.note)}"` : ''}><span>${esc(p.name)}</span><b>${planPrice(p)}</b>${p.note ? `<small>${esc(p.note)}</small>` : ''}</span>`).join('') : '<span class="muted small">Free only</span>'}</div>${pr.note ? `<p class="pnote">${esc(pr.note)}</p>` : ''}</td>
  <td class="pfrom">${from == null ? '<span class="pbadge free">$0</span>' : `<b>${usd(from)}</b><small>/mo</small>`}${pr.url ? `<a href="${esc(pr.url)}" target="_blank" rel="noopener" aria-label="${esc(t.name)} official pricing">Pricing ↗</a>` : ''}</td>
</tr>`;
  };
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
  <div class="ptable-wrap">
    <table class="ptable">
      <thead><tr><th scope="col">Tool</th><th scope="col">Free plan</th><th scope="col">Paid plans <small>(USD / month)</small></th><th scope="col">Starts at</th></tr></thead>
      <tbody>${rows.map(row).join('')}</tbody>
    </table>
  </div>
  <p class="empty" hidden>No tools match these filters.</p>
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
  ICONS = await resolveIcons(tools, cacheDir);
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
for (const t of tools) await out(`tools/${t.id}/index.html`, toolPage(t));

const allItems = tools.flatMap((t) => t.items).sort((a, b) => b.date.localeCompare(a.date));
await out('feed.xml', rss(allItems.slice(0, 120)));
await out('data.json', JSON.stringify({
  generatedAt: snap.generatedAt, source: SITE_URL,
  tools: tools.map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, category: t.category, trending: !!t.discovered, site: t.site, latestVersion: t.latestRelease?.version || null, lastUpdate: t.latest?.date || null, stars: t.meta.stars ?? null, url: `${SITE_URL}/tools/${t.id}/` })),
  updates: allItems.slice(0, 300).map(({ html, ...i }) => i),
  discussions: snap.discussions,
  news: news.map(({ score, ...n }) => n),
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
<url><loc>${SITE_URL}/compare/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
<url><loc>${SITE_URL}/tools/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
${tools.map((t) => `<url><loc>${SITE_URL}/tools/${t.id}/</loc><lastmod>${t.lastActive}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`).join('\n')}
</urlset>`);
await out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (ADS.client) await out('ads.txt', `google.com, ${ADS.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0
`);
await out('.nojekyll', '');
console.log(`Built ${tools.length + 4} pages → dist/`);
