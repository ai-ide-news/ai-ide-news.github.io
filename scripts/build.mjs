// Renders data/snapshot.json into a static, SEO-friendly site in dist/.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { TOOLS, CATEGORIES } from './sources.mjs';
import { resolveIcons } from './icons.mjs';
import { resolvePortraits, subjects } from './portraits.mjs';
import { pricingFor, PRICING_CHECKED } from './pricing.mjs';
import { LAB_ICONS, MODEL_LABS, labKey } from './models.mjs';
import { TOOL_LAUNCH, COMPANIES, fmtLaunch } from './launches.mjs';
import { BENCHMARKS, BENCH_SETS, BENCH_SOURCE, benchKey } from './benchmarks.mjs';
import { AA_SOURCE } from './aa.mjs';
import { OPENCODE_SOURCE } from './opencode.mjs';
import { learnBody, LEARN_SECTIONS } from './learn.mjs';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const SITE_URL = (process.env.SITE_URL || 'https://ai-ide-news.github.io').replace(/\/$/, '');
const SITE_NAME = 'aiticker';
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
// Cloudflare Worker (worker/) that reads users' own sources for the My feed page; unset hides custom sources.
const FEED_PROXY = (process.env.FEED_PROXY || '').trim().replace(/\/$/, '');
// Block the site for visitors running an ad blocker. On whenever AdSense is; ADWALL=1 forces it locally.
const ADWALL = !!ADS.client || process.env.ADWALL === '1';
const PRIVACY_UPDATED = '21 October 2026';
// Android app (Trusted Web Activity, see play/). sha256 lists the signing-key fingerprints allowed
// to open the site full-screen: the upload key, plus Play's app-signing key once Play Console shows it.
const ANDROID_APP = { id: 'io.github.aiidenews.aiticker', sha256: [
  '61:DC:7C:17:8F:8A:58:5F:35:AE:BA:3E:87:8C:53:37:89:6E:3A:05:09:63:1A:78:A9:D7:96:93:31:E1:BA:D3', // upload key
  '0D:DB:C5:50:1C:0B:36:6A:22:13:D4:39:85:EB:FE:2B:DE:F0:55:45:3B:68:46:06:0C:2C:65:B3:83:B6:DD:7B', // Play app-signing key
] };

const snap = JSON.parse(await readFile(new URL('data/snapshot.json', ROOT), 'utf8'));
const NOW = Date.parse(snap.generatedAt);

// ── helpers ───────────────────────────────────────────────
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Detail-page title: the name types itself out behind a moving caret (src/app.js); the text never reflows.
const scrawl = (s) => `<span class="typed">${esc(s)}</span>`;
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

// ── first releases ────────────────────────────────────────
// A tool's launch: hand-checked for curated tools, otherwise its earliest fetched release when that
// history is complete (not cut off by the fetch cap or a cadenceFrom gap).
const MAX_HISTORY = 1000;
function firstRelease(t) {
  if (TOOL_LAUNCH[t.id]) return TOOL_LAUNCH[t.id];
  const c = t.meta.cadence || [];
  if (!c.length || t.meta.cadenceFrom || c.length >= MAX_HISTORY) return null;
  const date = c.reduce((a, b) => (a < b ? a : b)).slice(0, 10);
  const src = t.meta.npm ? 'npm' : t.cask ? 'Homebrew' : 'GitHub';
  return { date, note: `First ${src} release` };
}
const launchAgo = (d) => {
  const yrs = (NOW - Date.parse(d.length === 4 ? `${d}-07-01` : d.length === 7 ? `${d}-15` : d)) / (365.25 * DAY);
  return yrs < 1 ? `${Math.max(1, Math.round(yrs * 12))} mo ago` : `${yrs < 10 ? yrs.toFixed(1).replace(/\.0$/, '') : Math.round(yrs)} yr ago`;
};
const est = (name) => (COMPANIES[name]?.founded ? ` <span class="est" title="${esc(COMPANIES[name].parent ? `Part of ${COMPANIES[name].parent}, founded ${COMPANIES[name].founded}` : `Founded ${COMPANIES[name].founded}`)}">est. ${COMPANIES[name].founded}</span>` : '');
const trending = tools.filter((t) => t.discovered).sort((a, b) => b.score - a.score);
const trendBadge = (t) => (t.starsPerWeek > 0 ? `↗ +${compact(t.starsPerWeek)}★` : '↗');

// Weekly activity sparkline (12 weeks). Single series → one hue, per-bar hover tooltip.
// Weeks that end before `since` (where the fetched history starts) are drawn as "no data", not zero.
function sparkline(dates, { weeks = 12, w = 132, h = 32, since = null } = {}) {
  const counts = Array(weeks).fill(0);
  for (const d of dates) {
    const k = Math.floor((NOW - Date.parse(d)) / (7 * DAY));
    if (k >= 0 && k < weeks) counts[weeks - 1 - k]++;
  }
  const known = (i) => !since || NOW - (weeks - 1 - i) * 7 * DAY >= Date.parse(since);
  const max = Math.max(1, ...counts);
  const gap = 2, bw = (w - gap * (weeks - 1)) / weeks;
  const bars = counts.map((c, i) => {
    const ago = weeks - 1 - i === 0 ? 'this week' : `${weeks - 1 - i}w ago`;
    const x = (i * (bw + gap)).toFixed(1), hit = `<rect class="hit" x="${x}" y="0" width="${(bw + gap).toFixed(1)}" height="${h}"/>`;
    if (!known(i)) return `<g>${hit}<rect class="bar none" x="${x}" y="${h - 1}" width="${bw.toFixed(1)}" height="1" rx="0.5"/><title>No data · ${ago}</title></g>`;
    const bh = c ? Math.max(3, (c / max) * (h - 2)) : 1.5;
    return `<g>${hit}<rect class="${c ? 'bar' : 'bar zero'}" x="${x}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/><title>${c} update${c === 1 ? '' : 's'} · ${ago}</title></g>`;
  }).join('');
  const total = counts.reduce((a, b) => a + b, 0);
  const shown = counts.filter((_, i) => known(i)).length;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" role="img" aria-label="${total} updates in the last ${shown} weeks">${bars}</svg>`;
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
// The masthead groups its sections by what you came for; each group opens a small menu.
function navGroups(root, active) {
  const groups = [
    ['Updates', 'What shipped', [
      ['Changelog', `${root}#feed`, 'Every release, live', ''],
      ['Latest versions', `${root}#versions`, 'Current version of each tool', 'versions'],
      trending.length && ['Trending', `${root}#trending`, 'Rising on GitHub', ''],
      news.length && ['News', `${root}news/`, 'Only the important stories', 'news'],
      ['Community', `${root}#discussions`, 'Hacker News threads', ''],
      ['My feed', `${root}my-feed/`, 'Your own pick of sources', 'myfeed'],
    ]],
    ['Tools', 'Pick your setup', [
      ['All tools', `${root}tools/`, `${tools.length} IDEs, CLIs and agents`, 'tools'],
      ['Compare', `${root}compare/`, 'Plans and pricing side by side', 'compare'],
      ['Companies', `${root}companies/`, `${companies.length} labs and tool makers`, 'companies'],
    ]],
    models.length && ['Models', 'Under the hood', [
      ['Models', `${root}models/`, 'Benchmarks, prices, leaderboard', 'models'],
      ['Learn', `${root}learn/`, 'How models work, narrated', 'learn'],
    ]],
    (ECO.skills.list.length || ECO.mcp.list.length) && ['Extend', 'Plug things in', [
      ECO.skills.list.length && ['Skills', `${root}skills/`, 'Agent skills worth installing', 'skills'],
      ECO.mcp.list.length && ['MCP', `${root}mcp/`, 'MCP servers for your agent', 'mcp'],
    ]],
  ].filter(Boolean);
  return groups.map(([label, hint, raw], g) => {
    const items = raw.filter(Boolean);
    const cur = items.some((it) => it[3] && it[3] === active);
    return `<div class="nav-grp"><button class="nav-cat${cur ? ' cur' : ''}" type="button" aria-expanded="false" aria-controls="nav-m${g}">${label}<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="nav-menu" id="nav-m${g}"><p class="nav-hint">${hint}</p>${items.map(([n, u, s, key]) => `<a href="${u}"${key && key === active ? ' aria-current="page"' : ''}><b>${n}</b><small>${esc(s)}</small></a>`).join('')}</div></div>`;
  });
}

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
<link rel="icon" href="${root}favicon.ico" sizes="32x32">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<link rel="manifest" href="${root}manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="${SITE_NAME}">
<meta name="mobile-web-app-capable" content="yes">
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
    <a class="brand nav-brand" href="${root}" aria-label="${SITE_NAME} home">
      <svg class="brand-sig" viewBox="0 0 32 19.4" aria-hidden="true"><path class="sig-chev" d="M0 0h5l7 7-7 7H0l7-7z"/><path class="sig-tick" d="M4 16.6h4.42l3-3h3.98v2.8h-2.82l-3 3H4zM15.4 16.02l2.42-2.42H26v2.8h-7.02l-3 3h-.58z"/><rect class="sig-cur" x="26" y="11.2" width="6" height="6.8"/></svg><span>${SITE_NAME}</span><em class="brand-live" aria-hidden="true">on the wire</em>
    </a>
    <nav class="nav-links" id="nav-links" aria-label="Primary">
      <span class="nav-glide" aria-hidden="true"></span>
      ${navGroups(root, active).join('')}
    </nav>
    <div class="nav-actions">
      <button class="nav-seek" id="seek-open" type="button" aria-label="Search the whole site" aria-haspopup="dialog" data-root="${root}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Search tools, models, news…</span><kbd data-mod>Ctrl K</kbd></button>
      <button class="icon-btn nav-toggle" id="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path class="nt-a" d="M4 7h16"/><path class="nt-b" d="M4 12h16"/><path class="nt-c" d="M4 17h16"/></g></svg></button>
      <button class="icon-btn" id="refresh" type="button" aria-label="Check for new updates" title="Check for new updates"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></button>
      <button class="icon-btn" id="theme" type="button" aria-label="Toggle color theme"><svg class="sun" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></g></svg><svg class="moon" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1"/></svg></button>
    </div>
    <span class="nav-wire" aria-hidden="true"></span>
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
      <p class="credit">Made by <a href="${AUTHOR.url}" rel="author noopener">${AUTHOR.name}</a> · <a href="${AUTHOR.url}" rel="noopener">github.com/AbdullahElTiby</a></p>
      <p class="muted">Not affiliated with any of the tools listed. All trademarks belong to their owners. <a href="${root}privacy/">Privacy</a></p>
    </div>
  </div>
</footer>
<script src="${root}assets/app.js?v=${NOW}" defer></script>
<script src="${root}assets/seek.js?v=${NOW}" defer></script>
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
  return `<article class="ncard${lead ? ` ncard-lead${n.summary ? ' tall' : ''}` : ''}${n.major ? ' major' : ''}" data-tag="${esc(n.tag.toLowerCase())}" data-tools="${esc(n.toolIds.join(' '))}" data-srcs="${[...new Set(n.sources.map((s) => /^X ·/.test(s.name) ? 'x' : /^Hacker News/.test(s.name) ? 'hn' : 'official'))].join(' ')}" data-date="${esc(n.date)}" data-text="${esc([n.title, n.summary, n.tag, ...ts.map((t) => t.name)].join(' ').toLowerCase())}" style="--c:${c}">
  <header class="ncard-by">${ts[0] ? `<a class="ncard-av" href="${root}tools/${ts[0].id}/" tabindex="-1" aria-hidden="true">${icon(ts[0], root)}</a>` : '<span class="ncard-av"><span class="ticon ticon-md" aria-hidden="true"><b>★</b></span></span>'}<div class="ncard-who">${ts[0] ? `<a href="${root}tools/${ts[0].id}/"><b>${esc(ts[0].name)}</b></a>` : `<b>${esc(n.sources[0]?.name.replace(/^X · /, '') || 'News')}</b>`}<small>${ts[0]?.vendor ? `${esc(ts[0].vendor)} · ` : ''}${time(n.date)}</small></div></header>
  <div class="ncard-meta"><span class="ntag ntag-${esc(n.tag.toLowerCase())}">${esc(n.tag)}</span>${n.major ? '<span class="nmajor">Major</span>' : ''}${time(n.date, 'fcard-time')}</div>
  <h3 class="ncard-title"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
  ${n.summary ? `<p class="ncard-sum">${esc(n.summary)}</p>` : ''}
  ${n.image ? `<a class="ncard-img" href="${esc(n.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="${esc(n.image)}" alt="" loading="${lead ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>` : ''}
  <div class="ncard-foot">
    ${ts.slice(0, 3).map((t) => `<a class="ntool" href="${root}tools/${t.id}/" style="--c:${t.color}">${icon(t, root, 'sm')}${esc(t.name)}</a>`).join('')}
    <span class="srcs">${n.sources.slice(0, 3).map(sourceLink).join('')}</span>
  </div>
</article>`;
}
// `limit` keeps the 3-column grid free of orphans: a tall lead fills 4 cells, a short one 2.
// The News page (`feed`) shows every story, newest first, so nothing is dropped or hoisted.
function newsFit(list, limit = Infinity, { feed = false } = {}) {
  if (!list.length || feed) return list;
  const lead = list.find((n) => n.major) || list[0];
  const rest = list.filter((n) => n !== lead);
  const cells = lead.summary ? 4 : 2;
  const n = Math.min(rest.length, limit === Infinity ? rest.length : limit - 1);
  const fit = n > 3 ? n - ((n + cells) % 3) : n;
  return [lead, ...rest.slice(0, fit)];
}
function newsGrid(list, root, limit = Infinity, { feed = false } = {}) {
  if (!list.length) return '<p class="muted">No major news in the last 30 days.</p>';
  const [lead, ...rest] = newsFit(list, limit, { feed });
  return `<div class="ngrid${feed ? ' feed' : ''}">${newsCard(lead, root, { lead: true })}${rest.map((x) => newsCard(x, root)).join('')}</div>`;
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
// Retired releases OpenRouter no longer lists (data/history.json), drawn on lab timelines only.
const liveKeys = new Set(models.flatMap((m) => [m.id, `${m.labId}:${m.name.toLowerCase()}`]));
const retiredByLab = Object.groupBy(
  JSON.parse(await readFile(new URL('data/history.json', ROOT), 'utf8')).models.flatMap((h) => {
    const lab = MODEL_LABS[h.id.split('/')[0]];
    if (!lab) return [];
    const labId = labKey(lab.name);
    return liveKeys.has(h.id) || liveKeys.has(`${labId}:${h.name.toLowerCase()}`) ? []
      : [{ ...h, lab: lab.name, labId, color: lab.color, retired: true }];
  }),
  (m) => m.labId,
);

// ── companies ─────────────────────────────────────────────
// One page per company, derived from whoever makes a tracked tool or model, so a new vendor or lab gets one
// on the next build. Names normalise so display names and GitHub org spellings meet ("mistralai", "zai-org").
const coKey = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const coInfo = (name) => COMPANIES[name] || Object.entries(COMPANIES).find(([k]) => coKey(k) === coKey(name))?.[1] || {};
const companies = (() => {
  const byKey = new Map(), list = [];
  const slugs = new Set();
  const slugFor = (s) => { let x = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company'; while (slugs.has(x)) x += '-co'; slugs.add(x); return x; };
  for (const l of labs) {
    const c = { name: l[0].lab, slug: slugFor(l[0].labId), labId: l[0].labId, color: l[0].color, iconId: `lab-${l[0].labId}`, models: l, tools: [] };
    byKey.set(coKey(c.name), c).set(coKey(c.labId), c);
    list.push(c);
  }
  for (const t of tools) {
    const k = coKey(coInfo(t.vendor).alias || t.vendor);
    let c = byKey.get(k) || byKey.get(k.replace(/(ai|org)$/, ''));
    if (!c) {
      c = { name: t.vendor, slug: slugFor(t.vendor), color: t.color, iconId: t.id, models: [], tools: [] };
      byKey.set(k, c);
      list.push(c);
    }
    c.tools.push(t);
  }
  for (const c of list) {
    c.info = coInfo(c.name);
    c.last = [c.tools[0]?.lastActive, c.models[0]?.date].filter(Boolean).sort().at(-1) || '1970-01-01T00:00:00Z';
  }
  return list.sort((a, b) => (b.tools.length + b.models.length) - (a.tools.length + a.models.length) || b.last.localeCompare(a.last));
})();
const coPath = (c) => `companies/${c.slug}/`;
const coByVendor = new Map(companies.flatMap((c) => c.tools.map((t) => [t.vendor, c])));
const coByLab = new Map(companies.filter((c) => c.labId).map((c) => [c.labId, c]));
const coByName = (name) => companies.find((c) => coKey(c.name) === coKey(name));
const coTile = (c, root, size = 'sm') => icon({ id: c.iconId, name: c.name, color: c.color }, root, size);

// Founder photo / shareholder logo (scripts/portraits.mjs); tracked companies use their own tile, else initials.
let PORTRAITS = {};
const ownerAvatar = (name, root) => {
  const co = coByName(name);
  if (co && ICONS[co.iconId]?.file) return coTile(co, root);
  const p = PORTRAITS[name];
  if (p?.file) return `<img class="av av-${p.kind}" src="${root}portraits/${p.file}" alt="" title="${esc(p.credit || '')}" loading="lazy" decoding="async" width="28" height="28">`;
  return `<span class="av av-none" aria-hidden="true">${esc(name.split(/[\s-]+/).filter((w) => /^\p{Lu}/u.test(w)).slice(0, 2).map((w) => w[0]).join('') || name[0])}</span>`;
};
// "Larry Page & Sergey Brin (…)" → one chip, an avatar per name.
const ownerChip = (label, root) => `<li>${subjects(label).map((n) => ownerAvatar(n, root)).join('')}<span>${esc(label)}</span></li>`;
const coCounts = (c) => [c.tools.length && `${c.tools.length} tool${c.tools.length === 1 ? '' : 's'}`, c.models.length && `${c.models.length} model${c.models.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
const vendorLink = (name, root) => `<a class="lab-link" href="${root}${coPath(coByVendor.get(name))}">${esc(name)}</a>`;
const coGrid = (list, root) => `<ul class="lab-grid co-grid">${list.map((c) => `<li><a href="${root}${coPath(c)}" style="--c:${c.color}">${coTile(c, root)}<span>${esc(c.name)}</span><small>${coCounts(c)}</small></a></li>`).join('')}</ul>`;
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
  <td class="mnum">${mprice(m.input)}${provCount(m) > 1 ? `<small>${provCount(m)} providers</small>` : ''}</td>
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
  { id: 'intel', name: 'Intelligence', tone: 'accent', desc: 'aiticker index across reasoning, knowledge, maths and coding', ids: ['gpqa', 'hle', 'arc2', 'fm', 'simple', 'critpt', 'swe', 'tb'], min: 4 },
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
const LB_TOP = 20;
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

// Every provider serving the model (scripts/models.mjs, via OpenRouter), cheapest first by blended price (3:1 input:output).
const provCount = (m) => new Set((m.providers || []).map((p) => p.name)).size;
function providerTable(m) {
  const list = m.providers || [];
  if (!list.length) return `<p class="muted">No provider list for ${esc(m.name)} yet. It appears here after the next data refresh.</p>`;
  // Free endpoints (often free for a limited time, with tight rate limits) and subscription plans ($0 per token, but you pay
  // for the plan) are listed first but kept out of the price comparison.
  const free = list.filter((p) => p.free), plans = list.filter((p) => p.plan), paid = list.filter((p) => !p.free && !p.plan);
  const nameList = (l) => { const n = [...new Set(l.map((p) => p.name))]; return `<strong>${n.slice(0, 5).map(esc).join(', ')}${n.length > 5 ? ` +${n.length - 5} more` : ''}</strong>`; };
  const freeLead = (free.length ? `Free to try on ${nameList(free)} — free endpoints are often limited-time and rate-limited. ` : '')
    + (plans.length ? `Included in ${nameList(plans)}. ` : '');
  const low = paid.length ? Math.min(...paid.map(blended)) : 0, high = paid.length ? Math.max(...paid.map(blended)) : 0;
  const cheapest = paid.filter((p) => blended(p) === low);
  const has = (k) => list.some((p) => p[k] != null);
  const cols = [
    has('cacheRead') && ['Cache read', (p) => (p.cacheRead == null ? '<span class="muted">—</span>' : p.plan ? '<span class="muted">Plan</span>' : mprice(p.cacheRead))],
    ['Context', (p) => tokens(p.context)],
    has('maxOutput') && ['Max output', (p) => tokens(p.maxOutput)],
    has('speed') && ['Speed', (p) => (p.speed == null ? '<span class="muted">—</span>' : `${p.speed}<small>tok/s</small>`)],
    has('latency') && ['Latency', (p) => (p.latency == null ? '<span class="muted">—</span>' : `${(p.latency / 1000).toFixed(2)}<small>s</small>`)],
    has('uptime') && ['Uptime', (p) => (p.uptime == null ? '<span class="muted">—</span>' : `${p.uptime}%<small>24h</small>`)],
  ].filter(Boolean);
  const names = [...new Set(cheapest.map((p) => p.name))];
  const lead = !paid.length
    ? 'No paid endpoint right now.'
    : paid.length === 1
      ? `${free.length || plans.length ? 'Pay per token: only' : 'Only'} <strong>${esc(paid[0].name)}</strong>${free.length || plans.length ? `, at ${priceLine(paid[0])} per 1M input / output tokens.` : ` serves ${esc(m.name)} right now.`}`
      : low === high
        ? `All ${new Set(paid.map((p) => p.name)).size} paid providers charge the same: ${priceLine(paid[0])} per 1M input / output tokens.`
        : `Cheapest: <strong>${names.slice(0, 3).map(esc).join(', ')}${names.length > 3 ? ` +${names.length - 3} more` : ''}</strong> at ${priceLine(cheapest[0])} per 1M input / output tokens — ${Math.round((1 - low / high) * 100)}% less than the priciest option.`;
  return `<p class="prov-lead">${freeLead}${lead}</p>
  <div class="ptable-wrap"><table class="ptable dtable prov-table">
    <thead><tr><th scope="col">Provider</th><th scope="col">Input</th><th scope="col">Output</th>${cols.map(([h]) => `<th scope="col">${h}</th>`).join('')}<th scope="col">vs. best</th></tr></thead>
    <tbody>${[...free, ...plans, ...paid].map((p) => {
      const d = low > 0 ? Math.round((blended(p) / low - 1) * 100) : (blended(p) > 0 ? null : 0);
      const best = p.free ? '<span class="pbadge free">Free</span>' : p.plan ? '<span class="pbadge">Plan</span>' : blended(p) === low ? '<span class="pbadge free">Cheapest</span>' : d == null ? 'Paid' : `+${d}%`;
      const name = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name);
      const price = (n) => (p.plan ? '<span class="muted">Plan</span>' : mprice(n));
      return `<tr${p.free || (!p.plan && blended(p) === low) ? ' class="prov-best"' : ''}><th scope="row"><strong>${name}</strong><small>${[p.free && 'free · may be limited-time', p.plan && 'subscription plan', p.region, p.quant && p.quant.toUpperCase(), !p.tools && 'no tool calling'].filter(Boolean).map(esc).join(' · ')}</small></th>
        <td class="mnum">${price(p.input)}</td>
        <td class="mnum">${price(p.output)}</td>
        ${cols.map(([, f]) => `<td class="mnum">${f(p)}</td>`).join('')}
        <td class="mnum">${best}</td></tr>`;
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

// Every release from one lab, from its first known model to today; retired ones are hollow and unlinked.
// Dots that would overlap stack upward.
function labTimeline(list, root, highlight, { w: W = 640 } = {}) {
  const all = [...list, ...(retiredByLab[list[0].labId] || [])];
  const P = 16, start = Math.min(...all.map((m) => Date.parse(m.date))) - 30 * DAY;
  const X = (t) => +(P + ((t - start) / (NOW - start)) * (W - 2 * P)).toFixed(1);
  // Month tick step that keeps labels about 80px apart.
  const every = [1, 3, 6, 12, 24].find((n) => (NOW - start) / (n * 30.4 * DAY) <= W / 80) || 48;
  const lanes = [], dots = all.sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    const x = X(Date.parse(m.date));
    let lane = lanes.findIndex((last) => x - last >= 12);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = x;
    return { m, x, lane };
  });
  const H = 44 + lanes.length * 13, base = H - 26;
  const months = [];
  for (let d = new Date(start); d <= NOW; d.setUTCMonth(d.getUTCMonth() + 1)) if ((d.getUTCFullYear() * 12 + d.getUTCMonth()) % every === 0) months.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const tick = every >= 12 ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: 'numeric', timeZone: 'UTC' };
  const retired = all.length - list.length;
  return `<svg class="ltl" style="--c:${list[0].color}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${all.length} releases since ${new Date(start + 30 * DAY).getUTCFullYear()}${retired ? `, ${retired} of them retired` : ''}">
    <line class="axis" x1="${P}" x2="${W - P}" y1="${base}" y2="${base}"/>
    ${months.filter((t) => t >= start).map((t) => `<g class="grid"><line x1="${X(t)}" x2="${X(t)}" y1="${base}" y2="${base + 5}"/><text x="${X(t)}" y="${base + 18}" text-anchor="middle">${new Date(t).toLocaleDateString('en-US', tick)}</text></g>`).join('')}
    ${dots.map(({ m, x, lane }) => {
      const cy = base - 8 - lane * 13;
      return m.retired
        ? `<circle class="pt kin retired" cx="${x}" cy="${cy}" r="4.5"><title>${esc(m.name)} — ${fmtDate(m.date)} · retired</title></circle>`
        : `<a href="${root}${modelPath(m)}"><circle class="pt kin${m.id === highlight ? ' me' : ''}" cx="${x}" cy="${cy}" r="${m.id === highlight ? 6.5 : 5}"><title>${esc(m.name)} — ${fmtDate(m.date)}</title></circle></a>`;
    }).join('')}
  </svg>`;
}

const modelList = (list, root) => `<ul class="similar">${list.map((x) => `<li><a href="${root}${modelPath(x)}" style="--c:${x.color}">${labTile(x, root)}<span>${esc(x.name)}</span><code>${fmtDate(x.date).replace(/, \d{4}$/, '')}</code></a></li>`).join('')}</ul>`;

function modelPage(m) {
  const root = '../../../';
  const lab = models.filter((x) => x.labId === m.labId);
  const siblings = lab.filter((x) => x.id !== m.id).slice(0, 8);
  const rivals = models.filter((x) => showdown.includes(x.id) && x.labId !== m.labId);
  const nScores = Object.keys(m.bench).length;
  const metered = (m.providers || []).filter((p) => !p.plan);
  const cheap = metered.length ? { input: Math.min(...metered.map((p) => p.input)), output: Math.min(...metered.map((p) => p.output)) } : null;
  const body = `
<section class="wrap tool-hero" style="--c:${m.color}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">Home</a><span>/</span><a href="${root}models/">Models</a><span>/</span><a href="${root}${labPath(m.labId)}">${esc(m.lab)}</a><span>/</span><span>${esc(m.name)}</span></nav>
  <div class="tool-head">
    ${icon({ id: `lab-${m.labId}`, name: m.lab, color: m.color }, root, 'xl')}
    <div>
      <p class="eyebrow"><a class="lab-link" href="${root}${labPath(m.labId)}">${esc(m.lab)}</a> · Released ${fmtDate(m.date)}</p>
      <h1>${scrawl(m.name)}</h1>
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
    <div><dt>Input / 1M tokens</dt><dd>${mprice(m.input)}${cheap && cheap.input < m.input ? `<small> from ${mprice(cheap.input)}</small>` : ''}</dd></div>
    <div><dt>Output / 1M tokens</dt><dd>${mprice(m.output)}${cheap && cheap.output < m.output ? `<small> from ${mprice(cheap.output)}</small>` : ''}</dd></div>
  </dl>
</section>

${banner()}

<section class="wrap section">
  <div class="feed-layout">
    <div class="feed">
      <div class="section-head"><div><p class="eyebrow">Where to run it</p><h2>${provCount(m) > 1 ? `${provCount(m)} providers compared` : 'Providers'}</h2></div></div>
      ${providerTable(m)}
      ${valueChart(m, root) ? `<div class="section-head dsub"><div><p class="eyebrow">Value</p><h2>Price vs. performance</h2></div></div>${valueChart(m, root)}` : ''}
      <div class="section-head dsub"><div><p class="eyebrow">Benchmarks</p><h2>${nScores ? `${nScores} benchmark score${nScores === 1 ? '' : 's'}` : 'Benchmark scores'}</h2></div></div>
      ${benchTable(m, root)}
      <div class="section-head dsub"><div><p class="eyebrow">Specs</p><h2>Details</h2></div></div>
      <dl class="specs">
        <div><dt>Model ID</dt><dd><code>${esc(m.id)}</code></dd></div>
        <div><dt>Developer</dt><dd><a href="${root}${labPath(m.labId)}">${esc(m.lab)}</a></dd></div>
        <div><dt>Release date</dt><dd>${fmtDate(m.date)} · ${time(m.date)}</dd></div>
        <div><dt>Context window</dt><dd>${m.context ? `${m.context.toLocaleString('en-US')} tokens` : '—'}</dd></div>
        <div><dt>Max output</dt><dd>${m.maxOutput ? `${m.maxOutput.toLocaleString('en-US')} tokens` : '—'}</dd></div>
        <div><dt>API price</dt><dd>${priceLine(m)} <span class="muted">per 1M input / output tokens</span></dd></div>
        <div><dt>Providers</dt><dd>${provCount(m) || '—'}</dd></div>
        <div><dt>Input types</dt><dd>${esc(m.modalities.join(', ') || '—')}</dd></div>
        <div><dt>Reasoning</dt><dd>${yesNo(m.reasoning)}</dd></div>
        <div><dt>Tool calling</dt><dd>${yesNo(m.tools)}</dd></div>
        <div><dt>Open weights</dt><dd>${yesNo(m.openWeights)}</dd></div>
        <div><dt>Free tier</dt><dd>${yesNo(m.free)}</dd></div>
      </dl>
      <p class="muted small section-note">Release date and prices from OpenRouter's catalog; providers from OpenRouter and <a href="https://models.dev" target="_blank" rel="noopener">models.dev</a>. Buying directly from a provider can cost a little differently. Speed, latency and uptime are measured on OpenRouter only; uptime is the share of OpenRouter requests each provider served over the last day. Benchmark scores are the best result per benchmark from <a href="${BENCH_SOURCE.url}" target="_blank" rel="noopener">${BENCH_SOURCE.name}</a>, licensed CC BY 4.0. Rank counts every model tracked here with a score.</p>
    </div>
    <aside class="side">
      ${ad('side')}
      ${lab.length + (retiredByLab[m.labId]?.length || 0) > 1 ? `<div class="side-card"><p class="eyebrow">Release history</p><h2>${esc(m.lab)} timeline</h2>${labTimeline(lab, root, m.id, { w: 340 })}</div>` : ''}
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
  const co = COMPANIES[lab] || {};
  const body = `
<section class="wrap tool-hero" style="--c:${color}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">Home</a><span>/</span><a href="${root}models/">Models</a><span>/</span><span>${esc(lab)}</span></nav>
  <div class="tool-head">
    ${icon({ id: `lab-${labId}`, name: lab, color }, root, 'xl')}
    <div>
      <p class="eyebrow">AI lab${co.parent ? ` · ${esc(co.parent)}` : ''}${co.founded ? ` · founded ${co.founded}` : ''} · ${list.length} model${list.length === 1 ? '' : 's'} tracked</p>
      <h1>${scrawl(lab)} <em>models</em></h1>
      <p class="lede">Every ${esc(lab)} model on the API today, with release dates, context windows, API prices and benchmark scores. Newest: <a href="${root}${modelPath(newest)}">${esc(newest.name)}</a>, ${ago(newest.date)}.</p>
      <div class="tool-links">
        ${labScored.length ? `<a class="btn" href="${showdownHref(root, labScored.slice(0, 6).map((m) => m.id))}">Compare ${esc(lab)} models →</a>` : ''}
        <a class="btn ghost" href="${root}${coPath(coByLab.get(labId))}">${esc(lab)} profile</a>
        <a class="btn ghost" href="${root}models/">All labs</a>
      </div>
    </div>
  </div>
  <dl class="stats tool-stats${co.firstModel ? ' stats-5' : ''}">
    ${co.firstModel ? `<div><dt>First model</dt><dd>${fmtLaunch(co.firstModel.date)}<small> ${esc(co.firstModel.name)}</small></dd></div>` : ''}
    <div><dt>Models · 30 days</dt><dd>${month.length}<small> of ${list.length}</small></dd></div>
    <div><dt>Latest release</dt><dd>${ago(newest.date)}</dd></div>
    <div><dt>Cheapest input / 1M</dt><dd>${cheapest ? mprice(cheapest.input) : 'Free'}${cheapest ? `<small> ${esc(cheapest.name)}</small>` : ''}</dd></div>
    <div><dt>Largest context</dt><dd>${tokens(biggest.context)}<small> ${esc(biggest.name)}</small></dd></div>
  </dl>
</section>

<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Release history</p><h2>Timeline</h2></div><p class="muted small section-note">${cadence != null ? `${esc(lab)} ships a new model about every <strong>${cadence < 1.5 ? 'day' : `${Math.round(cadence)} days`}</strong>.` : ''} Each dot is a release; click one to open it.${retiredByLab[labId] ? ' Hollow dots are retired models.' : ''}</p></div>
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

function companyPage(c) {
  const root = '../../';
  const { info } = c;
  const parent = info.parent && coByName(info.parent);
  const family = companies.filter((x) => x !== c && (coKey(x.info.parent) === coKey(c.name) || (info.parent && coKey(x.info.parent) === coKey(info.parent))));
  const items = c.tools.flatMap((t) => t.items).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const stars = c.tools.reduce((n, t) => n + (t.meta.stars || 0), 0);
  const coNews = news.filter((n) => n.toolIds.some((id) => c.tools.some((t) => t.id === id)));
  const rel90 = c.tools.flatMap((t) => t.updates).filter((i) => NOW - Date.parse(i.date) < 90 * DAY).length + c.models.filter((m) => NOW - Date.parse(m.date) < 90 * DAY).length;
  const what = [c.tools.length && `${c.tools.length} AI coding tool${c.tools.length === 1 ? '' : 's'}`, c.models.length && `${c.models.length} AI model${c.models.length === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
  const others = companies.filter((x) => x !== c && !family.includes(x));
  const body = `
<section class="wrap tool-hero" style="--c:${c.color}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">Home</a><span>/</span><a href="${root}companies/">Companies</a><span>/</span><span>${esc(c.name)}</span></nav>
  <div class="tool-head">
    ${coTile(c, root, 'xl')}
    <div>
      <p class="eyebrow">${c.models.length ? 'AI lab' : 'Company'}${info.parent ? ` · part of ${parent ? `<a class="lab-link" href="${root}${coPath(parent)}">${esc(info.parent)}</a>` : esc(info.parent)}` : ''}${info.founded ? ` · founded ${info.founded}` : ''}</p>
      <h1>${scrawl(c.name)} <em>profile</em></h1>
      <p class="lede">Everything ${esc(c.name)} ships that we track: ${what}. Last shipped ${ago(c.last)}.</p>
      <div class="tool-links">
        ${c.models.length ? `<a class="btn" href="${root}${labPath(c.labId)}">All ${esc(c.name)} models →</a>` : ''}
        ${c.tools.length === 1 ? `<a class="btn${c.models.length ? ' ghost' : ''}" href="${root}tools/${c.tools[0].id}/">${esc(c.tools[0].name)} changelog →</a>` : ''}
        <a class="btn ghost" href="${root}companies/">All companies</a>
      </div>
    </div>
  </div>
  <dl class="stats tool-stats${info.founded ? ' stats-5' : ''}">
    ${info.founded ? `<div><dt>Founded</dt><dd>${esc(info.founded)}${info.parent ? `<small> ${esc(info.parent)}</small>` : ''}</dd></div>` : ''}
    <div><dt>Tools tracked</dt><dd>${c.tools.length}</dd></div>
    ${c.models.length ? `<div><dt>Models tracked</dt><dd>${c.models.length}</dd></div>` : `<div><dt>Ships · 90 days</dt><dd>${rel90}</dd></div>`}
    <div><dt>Last shipped</dt><dd>${ago(c.last)}</dd></div>
    ${stars ? `<div><dt>GitHub stars</dt><dd>${compact(stars)}</dd></div>` : c.models.length ? `<div><dt>Ships · 90 days</dt><dd>${rel90}</dd></div>` : `<div><dt>Updates tracked</dt><dd>${c.tools.reduce((n, t) => n + t.items.length, 0)}</dd></div>`}
  </dl>
  ${info.founders || info.owner || info.holders ? `<dl class="ownership">
    ${info.founders ? `<div><dt>Founded by</dt><dd><ul>${info.founders.map((f) => ownerChip(f, root)).join('')}</ul></dd></div>` : ''}
    ${info.owner ? `<div><dt>Owner</dt><dd>${esc(info.owner)}</dd></div>` : ''}
    ${info.holders ? `<div><dt>Notable shareholders</dt><dd><ul>${info.holders.map((h) => ownerChip(h, root)).join('')}</ul></dd></div>` : ''}
  </dl>
  <p class="credits">Photos and logos via Wikimedia Commons, GitHub and company websites; hover one for its credit.</p>` : ''}
</section>

${c.tools.length ? `<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Products</p><h2>${esc(c.name)} tools</h2></div></div>
  <div class="vgrid">${c.tools.map((t) => versionCard(t, root)).join('')}</div>
</section>` : ''}

${c.models.length ? `<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Models</p><h2>Latest ${esc(c.name)} models</h2></div><p class="muted small section-note"><a href="${root}${labPath(c.labId)}">Full lineup, benchmarks and timeline →</a></p></div>
  ${modelList(c.models.slice(0, 8), root)}
</section>` : ''}

${banner()}

${items.length ? `<section class="wrap section">
  <div class="feed-layout">
    <div class="feed tool-feed">
      <div class="section-head"><div><p class="eyebrow">Release history</p><h2>Recent updates</h2></div></div>
      ${timeline(items, root, { full: c.tools.length === 1 })}
    </div>
    <aside class="side">
      ${ad('side')}
      ${family.length ? `<div class="side-card"><p class="eyebrow">Same group</p><h2>Related companies</h2>${coGrid(family, root)}</div>` : ''}
      <div class="side-card"><p class="eyebrow">Community</p><h2>On Hacker News</h2>${discussionList(c.tools.flatMap((t) => t.discussions).filter((d, i, a) => a.indexOf(d) === i).sort((a, b) => b.date.localeCompare(a.date)), root, 8)}</div>
    </aside>
  </div>
</section>` : family.length ? `<section class="wrap section"><div class="section-head"><div><p class="eyebrow">Same group</p><h2>Related companies</h2></div></div>${coGrid(family, root)}</section>` : ''}

${coNews.length ? `<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">In the news</p><h2>${esc(c.name)} stories</h2></div></div>
  ${newsGrid(coNews, root, 6)}
</section>` : ''}

<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Directory</p><h2>Other companies</h2></div></div>
  ${coGrid(others, root)}
  ${ad('inline')}
</section>`;
  return layout({
    root, path: coPath(c), active: 'companies',
    title: `${c.name} — AI Tools, Models & Latest Releases | ${SITE_NAME}`,
    description: `${c.name}${info.founded ? ` (founded ${info.founded})` : ''}: ${what} tracked — ${[...c.tools, ...c.models].slice(0, 5).map((x) => x.name).join(', ')}. Latest releases, versions and news, updated automatically.`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'Organization', name: c.name, url: `${SITE_URL}/${coPath(c)}`,
      ...(info.founded ? { foundingDate: info.founded } : {}), ...(info.parent ? { parentOrganization: { '@type': 'Organization', name: info.parent } } : {}),
      ...(info.founders ? { founder: info.founders.filter((n) => !n.startsWith('and ')).map((n) => ({ '@type': 'Person', name: n.replace(/ \(.*\)$/, '') })) } : {}),
      makesOffer: c.tools.map((t) => ({ '@type': 'Offer', itemOffered: { '@type': 'SoftwareApplication', name: t.name, url: `${SITE_URL}/tools/${t.id}/` } })),
    },
    body,
  });
}

function companiesIndexPage() {
  const root = '../';
  const labsN = companies.filter((c) => c.models.length).length;
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Directory</p>
  <h1>All <em>${companies.length}</em> companies</h1>
  <p class="lede">Every company behind a tool or model we track — ${labsN} AI labs and ${companies.length - labsN} tool makers, most active first. New ones appear automatically.</p>
</section>

${banner()}
<section class="wrap section">
  ${coGrid(companies, root)}
  ${ad('inline')}
</section>`;
  return layout({
    root, path: 'companies/', active: 'companies', title: `AI Companies — Labs & Coding Tool Makers | ${SITE_NAME}`,
    description: `${companies.length} companies behind AI coding tools and models: ${companies.slice(0, 12).map((c) => c.name).join(', ')}.`, body,
  });
}

// Required for the Play Store listing (play/) and AdSense. Keep in step with what the site loads.
function privacyPage() {
  const root = '../';
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Policy</p>
  <h1>Privacy</h1>
  <p class="lede">What ${SITE_NAME} and its Android app collect, and who else sees it. Last updated ${PRIVACY_UPDATED}.</p>
</section>
<section class="wrap section privacy" style="max-width:720px">
  <h2>The short version</h2>
  <p>${SITE_NAME} has no accounts, no sign-up and no forms. We don't collect your name, email or any other personal details. The Android app is the same website opened full-screen in Chrome, so everything here applies to both.</p>
  <h2>Stored on your device</h2>
  <p>Your colour theme and a few interface choices are kept in your browser's local storage. To work offline, the site saves pages you've opened in your browser's cache. None of this is sent to us, and clearing your browser data removes it.</p>
  <h2>Analytics</h2>
  <p>We use Cloudflare Web Analytics to count visits. It sets no cookies and doesn't track you across sites; it records things like the page viewed, referrer, country and browser type. See <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare's privacy policy</a>.</p>
  <h2>Advertising</h2>
  <p>Ads are served by Google AdSense. Google and its partners may use cookies and device identifiers to show ads, including ads based on your previous visits to this and other sites, and to measure them. You can turn off personalised ads in <a href="https://adssettings.google.com/" rel="noopener">Google's Ad Settings</a>, and read <a href="https://policies.google.com/technologies/ads" rel="noopener">how Google uses data from sites that use its services</a>.</p>
  <h2>Third-party content</h2>
  <p>Fonts load from Google Fonts, and links lead to GitHub, vendor sites, Hacker News and other sources with their own privacy policies.</p>
  <h2>Children</h2>
  <p>${SITE_NAME} is a developer news site and isn't directed at children under 13.</p>
  <h2>Contact</h2>
  <p>Questions or requests: open an issue at <a href="${REPO_URL}/issues" rel="noopener">${REPO_URL.replace('https://', '')}</a>, or reach <a href="${AUTHOR.url}" rel="author noopener">${AUTHOR.name}</a>.</p>
</section>`;
  return layout({ root, path: 'privacy/', title: `Privacy Policy | ${SITE_NAME}`, description: `How ${SITE_NAME} and its Android app handle data: no accounts, cookieless analytics, Google AdSense.`, body });
}

function versionCard(t, root) {
  const l = t.latest;
  const ver = t.latestRelease ? t.latestRelease.version : null;
  const fresh = l && NOW - Date.parse(l.date) < 2 * DAY;
  return `<a class="vcard" href="${root}tools/${t.id}/" data-cat="${t.category}" data-trend="${t.discovered ? 1 : 0}" data-tool="${t.id}" data-text="${esc(`${t.name} ${t.vendor}`.toLowerCase())}" style="--c:${t.color}">
  ${icon(t, root, 'sm')}
  <span class="vcard-name"><strong>${esc(t.name)}</strong>${fresh ? '<span class="fresh" title="Shipped in the last 48 hours">new</span>' : ''}${t.discovered ? `<span class="trend" title="Trending on GitHub${t.starsPerWeek > 0 ? ` · +${t.starsPerWeek} stars this week` : ''}">${trendBadge(t)}</span>` : ''}<small>${esc(t.vendor)} · ${CATEGORIES[t.category].short}${firstRelease(t) ? ` · since ${firstRelease(t).date.slice(0, 4)}` : ''}</small></span>
  <span class="vcard-ver">${ver ? `<code>${esc(ver)}</code>` : `<span class="vcard-upd">${esc(l?.title || '—')}</span>`}</span>
  <span class="vcard-meta">${l ? time(l.date) : 'no data'}${t.meta.stars ? `<small>★ ${compact(t.meta.stars)}</small>` : ''}</span>
  ${sparkline(t.activity, { since: t.meta.cadenceFrom })}
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
  const hottest = [...snap.discussions].sort((a, b) => b.points - a.points);

  const body = `
<section class="hero wrap">
  <div class="dateline"><span>${new Date(NOW).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span><span><span class="dot"></span>Updated ${time(snap.generatedAt, 'live-ago')}</span><span>${tools.length} tools on the wire</span></div>
  <div class="hero-grid">
    <div>
      <h1>What changed in your AI coding tools, <em>and why it matters.</em></h1>
      <p class="lede">New versions, model launches, pricing changes and security alerts for Cursor, Claude Code, Codex, Gemini CLI, Copilot, Kiro, Zed and ${tools.length - 7} more — straight from official sources, with the noise filtered out.</p>
      <nav class="jump" aria-label="Go straight to">
        <a href="#versions" data-focus="q"><b>Latest version</b><small>of a specific tool</small></a>
        ${news.length ? '<a href="#news"><b>Important news</b><small>launches, pricing, security</small></a>' : ''}
        <a href="#models"><b>New models</b><small>prices &amp; context windows</small></a>
        <a href="#feed"><b>Every update</b><small>the full release feed</small></a>
      </nav>
    </div>
    <dl class="stats hero-stats">
      <div><dt>Tools tracked</dt><dd>${tools.length}${trending.length ? `<small> ${trending.length} trending</small>` : ''}</dd></div>
      <div><dt>Updates, last 7 days</dt><dd>${weekUpdates}</dd></div>
      <div><dt>Tools shipped in 24h</dt><dd>${shippedToday}</dd></div>
      <div><dt>HN threads, 60 days</dt><dd>${snap.discussions.length}</dd></div>
    </dl>
  </div>
</section>


${news.length ? `<section id="news" class="wrap section">
  <div class="section-head">
    <div><p class="eyebrow">What matters</p><h2>Important news</h2></div>
    <p class="muted small section-note">Only the stories that change things: launches, new models, pricing &amp; limits, security incidents, deprecations and deals — from official blogs, official X accounts and the biggest Hacker News threads. Routine posts are filtered out.</p>
  </div>
  ${newsGrid(news, root, 6)}
  ${news.length > 6 ? `<p class="more-link"><a class="btn ghost" href="${root}news/">All ${news.length} important stories →</a></p>` : ''}
</section>` : ''}

${modelsSection(root)}

${banner()}

<section id="versions" class="wrap section">
  <div class="section-head">
    <div><p class="eyebrow">Version board</p><h2>Latest versions</h2></div>
    ${catTabs()}
  </div>
  <div class="hero-search vsearch">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="q" type="search" placeholder="Which tool? Cursor, Claude Code, Zed…" aria-label="Find a tool" autocomplete="off">
    <kbd>/</kbd>
  </div>
  <div class="vgrid" id="vgrid" data-fold="12">${tools.map((t) => versionCard(t, root)).join('')}</div>
  <p class="empty" hidden>No tools match your search.</p>
  <p class="more-link"><button id="vmore" class="btn ghost" type="button" hidden>Show all ${tools.length} tools</button></p>
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
    <div class="feed" id="feedlist" data-page="15">${timeline(recent, root)}</div>
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
  // The activity chart spans the tool's whole known history, so every tool fills the width.
  const firstSeen = Math.min(...t.activity.map(Date.parse), t.meta.cadenceFrom ? Date.parse(t.meta.cadenceFrom) : Infinity);
  const historyWeeks = Number.isFinite(firstSeen) ? Math.floor((NOW - firstSeen) / (7 * DAY)) + 1 : 26;
  const since = Number.isFinite(firstSeen) ? new Date(firstSeen).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
  const sparkSpan = { weeks: Math.max(4, historyWeeks) };
  const ver = t.latestRelease?.version;
  const similar = tools.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 6);
  const first = firstRelease(t);

  const body = `
<section class="wrap tool-hero" style="--c:${t.color}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">Home</a><span>/</span><a href="${root}tools/">Tools</a><span>/</span><span>${esc(t.name)}</span></nav>
  <div class="tool-head">
    ${icon(t, root, 'xl')}
    <div>
      <p class="eyebrow">${CATEGORIES[t.category].label} · ${vendorLink(t.vendor, root)}${est(t.vendor)}${t.discovered ? ` · <span class="trend">↗ Trending on GitHub</span>` : ''}</p>
      <h1>${scrawl(t.name)} <em>changelog</em></h1>
      <p class="lede">${esc(t.blurb)}</p>
      <div class="tool-links">
        <a class="btn" href="${esc(t.site)}" target="_blank" rel="noopener">Official site ↗</a>
        ${t.meta.repoUrl ? `<a class="btn ghost" href="${esc(t.meta.repoUrl)}" target="_blank" rel="noopener">GitHub ↗</a>` : ''}
        ${t.id === 'opencode' && oc ? `<a class="btn ghost" href="#usage">Model usage data ↓</a>` : ''}
        ${snap.x?.handles?.[t.id]?.handle ? `<a class="btn ghost" href="https://x.com/${esc(snap.x.handles[t.id].handle)}" target="_blank" rel="noopener">𝕏 @${esc(snap.x.handles[t.id].handle)} ↗</a>` : ''}
      </div>
    </div>
  </div>
  <dl class="stats tool-stats${first ? ' stats-5' : ''}">
    ${first ? `<div title="${esc(first.note)}"><dt>First released</dt><dd>${first.url ? `<a href="${esc(first.url)}" target="_blank" rel="noopener">${fmtLaunch(first.date)}</a>` : fmtLaunch(first.date)}<small> ${launchAgo(first.date)}</small></dd></div>` : ''}
    <div><dt>${ver ? 'Latest version' : 'Latest update'}</dt><dd>${ver ? `<code>${esc(ver)}</code>` : (t.latest ? fmtDate(t.latest.date) : '—')}</dd></div>
    <div><dt>Last shipped</dt><dd>${t.latest ? ago(t.latest.date) : '—'}</dd></div>
    ${t.discovered ? `<div><dt>GitHub stars</dt><dd>${compact(t.meta.stars || 0)}${t.starsPerWeek > 0 ? `<small> +${compact(t.starsPerWeek)}/wk</small>` : ''}</dd></div>` : `<div><dt>Updates · 90 days</dt><dd>${rel90.length}</dd></div>`}
    <div><dt>${avgGap != null ? 'Avg. release gap' : 'GitHub stars'}</dt><dd>${avgGap != null ? `${avgGap < 1 ? '<1' : avgGap.toFixed(1)}<small> days</small>` : (t.meta.stars ? compact(t.meta.stars) : '—')}</dd></div>
  </dl>
  <div class="tool-spark"><span class="muted small">Weekly activity · ${since ? `since ${since} · ` : ''}${sparkSpan.weeks} weeks</span>${sparkline(t.activity, { weeks: sparkSpan.weeks, w: sparkSpan.weeks * 12, h: 56, since: t.meta.cadenceFrom })}</div>
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
${t.id === 'opencode' && oc ? ocSections(root) : ''}
${banner()}`;

  return layout({
    root, path: `tools/${t.id}/`, active: 'tools',
    title: `${t.name} Changelog & Latest Version${ver ? ` (${ver})` : ''} — Release Notes | ${SITE_NAME}`,
    description: `${t.name} release notes, latest version${ver ? ` ${ver}` : ''}, patches and news from ${t.vendor}. ${t.blurb} Updated automatically from official sources.`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: t.name, applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Windows, macOS, Linux', url: t.site, publisher: { '@type': 'Organization', name: t.vendor },
      ...(ver ? { softwareVersion: ver } : {}), ...(t.latest ? { dateModified: t.latest.date } : {}),
      ...(first?.date.length === 10 ? { datePublished: first.date } : {}),
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
    root, path: 'tools/', active: 'tools', title: `All AI IDEs & Coding CLIs — Latest Versions | ${SITE_NAME}`,
    description: `Latest versions of ${tools.length} AI coding tools: ${tools.map((t) => t.name).join(', ')}.`, body,
  });
}

// Topic chips and a tool picker; src/app.js hides the cards that don't match.
const viewToggle = `<div class="nview" role="group" aria-label="Layout">
    <button type="button" data-view="feed" aria-pressed="true" title="Feed"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 4h14v7H5zM5 14h14v6H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Feed</button>
    <button type="button" data-view="grid" aria-pressed="false" title="Grid"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Grid</button>
  </div>`;
function newsFilters() {
  const shown = newsFit(news, Infinity, { feed: true });
  if (shown.length < 2) return '';
  const count = (key) => shown.reduce((m, n) => [].concat(key(n)).reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), m), new Map());
  const tags = [...count((n) => n.tag)].sort((a, b) => b[1] - a[1]);
  const tools = [...count((n) => n.toolIds)].filter(([id]) => byId[id]).sort((a, b) => b[1] - a[1] || byId[a[0]].name.localeCompare(byId[b[0]].name));
  return `<div class="nfilters">
  <div class="nchips" role="group" aria-label="Filter by topic">
    <button type="button" class="chip on" data-tag="all" aria-pressed="true">All <small>${shown.length}</small></button>
    ${tags.map(([t, c]) => `<button type="button" class="chip" data-tag="${esc(t.toLowerCase())}" aria-pressed="false">${esc(t)} <small>${c}</small></button>`).join('')}
  </div>
  <div class="nrow">
  <input id="nq" type="search" placeholder="Search stories…" aria-label="Search stories" autocomplete="off">
  <label class="ntool-pick"><select id="ntool" aria-label="Filter by tool">
    <option value="">All tools</option>
    ${tools.map(([id, c]) => `<option value="${esc(id)}">${esc(byId[id].name)} (${c})</option>`).join('')}
  </select></label>
  <label class="ntool-pick"><select id="nsrc" aria-label="Filter by source">
    <option value="">All sources</option>
    <option value="official">Official blogs</option>
    <option value="x">X posts</option>
    <option value="hn">Hacker News</option>
  </select></label>
  <label class="ntool-pick"><select id="nwhen" aria-label="Filter by date">
    <option value="">Last 30 days</option>
    <option value="1">Last 24 hours</option>
    <option value="3">Last 3 days</option>
    <option value="7">Last 7 days</option>
  </select></label>
  <label class="nmajor-pick"><input type="checkbox" id="nmaj"> Major only</label>
  ${viewToggle}
  </div>
</div>`;
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
<section class="wrap section">${newsFilters()}${newsGrid(news, root, Infinity, { feed: true })}<p class="muted nempty" hidden>No stories match these filters.</p>${ad('inline')}</section>`;
  return layout({
    root, path: 'news/', active: 'news', title: `AI Coding News — Launches, Models, Security & Pricing | ${SITE_NAME}`,
    description: `The important AI IDE and coding-agent news: ${news.slice(0, 4).map((n) => n.title).join(' · ')}`, body,
  });
}

// Personal feed: the reader picks tools from the catalog and adds any outside source (RSS, YouTube,
// Reddit, Bluesky, Mastodon, Instagram…); src/myfeed.js keeps the picks in localStorage and reads
// outside sources through the FEED_PROXY Worker (worker/).
const MYFEED_PRESETS = [
  ['Hacker News front page', 'https://hnrss.org/frontpage'],
  ['Simon Willison', 'https://simonwillison.net/atom/everything/'],
  ['r/LocalLLaMA', 'r/LocalLLaMA'],
  ['r/ChatGPTCoding', 'r/ChatGPTCoding'],
  ['The Verge · AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'],
  ['Anthropic on YouTube', 'yt:@anthropic-ai'],
  ['Simon on Bluesky', 'https://bsky.app/profile/simonwillison.net'],
];
function myFeedPage() {
  const root = '../';
  const data = {
    tools: [...tools].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, cat: CATEGORIES[t.category]?.short || '', color: t.color, icon: icon(t, root, 'sm') })),
    presets: FEED_PROXY ? MYFEED_PRESETS.map(([name, input]) => ({ name, input })) : [],
  };
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">My feed</p>
  <h1>Your <em>own</em> feed</h1>
  <p class="lede">Pick the tools you use and add any source you read: a blog's RSS, a website, a YouTube channel, a subreddit, a Bluesky or Mastodon account, an Instagram profile. Everything lands in one stream, newest first. Your picks stay in this browser; nothing is sent to us.</p>
</section>

<section class="wrap section mf" data-root="${root}" data-proxy="${esc(FEED_PROXY)}">
  <div class="mf-setup">
    <div class="side-card mf-panel">
      <p class="eyebrow">Sources</p><h2>What you follow</h2>
      <ul class="mf-mine" aria-live="polite"></ul>
      ${FEED_PROXY ? `<form class="mf-add" autocomplete="off">
        <label class="sr-only" for="mf-in">Link or handle</label>
        <input id="mf-in" type="text" inputmode="url" placeholder="Paste a link, r/subreddit, @user@mastodon.social, instagram.com/name…" required>
        <button class="btn" type="submit">Add</button>
      </form>
      <p class="mf-status muted small" role="status"></p>
      ${data.presets.length ? `<p class="muted small mf-try">Try: <span class="mf-presets"></span></p>` : ''}` : '<p class="muted small">Outside sources are not switched on for this site yet; pick from the tools below.</p>'}
      <div class="mf-built">
        <label><input type="checkbox" data-builtin="news"> Important news <small class="muted">launches, pricing, security</small></label>
        <label><input type="checkbox" data-builtin="hn"> Hacker News threads <small class="muted">about the tools you pick</small></label>
      </div>
      <p class="mf-actions"><button type="button" class="btn ghost mf-share">Copy share link</button><button type="button" class="btn ghost mf-reset">Reset</button></p>
    </div>
    <details class="side-card mf-panel mf-tools-box">
      <summary><span><p class="eyebrow">Tools</p><h2>Releases &amp; changelogs</h2></span><small class="muted mf-tcount"></small></summary>
      <input id="mf-tq" type="search" placeholder="Filter ${tools.length} tools…" aria-label="Filter tools" autocomplete="off">
      <div class="mf-tools" role="group" aria-label="Tools to follow"></div>
    </details>
  </div>
  <div class="mf-stream">
    <div class="nchips mf-filter" role="group" aria-label="Filter by source"></div>
    <div class="mf-list" id="mf-list" aria-busy="true"></div>
    <p class="empty mf-empty" hidden>Your feed is empty. Pick a few tools or add a source to get started.</p>
    <p class="more-link"><button type="button" class="btn ghost mf-more" hidden>Show more</button></p>
  </div>
  <script type="application/json" id="mf-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</section>
<script src="${root}assets/myfeed.js?v=${NOW}" defer></script>`;
  return layout({
    root, path: 'my-feed/', active: 'myfeed', title: `My feed — Follow Any Source in One Stream | ${SITE_NAME}`,
    description: 'Build your own news feed: follow AI coding tools plus any RSS feed, website, YouTube channel, subreddit, Bluesky, Mastodon or Instagram account, all in one stream.', body,
  });
}

// Plain-language guide to how AI works, with examples from the live model catalog (scripts/learn.mjs).
function learnPage() {
  const root = '../';
  return layout({
    root, path: 'learn/', active: 'learn', title: `How AI Works — Tokens, Context, Agents, MCP, RAG & Mixture of Experts | ${SITE_NAME}`,
    description: 'A plain-language, interactive guide to how AI models work: tokens, context windows, system prompts, cache hits, agents and tool calling, MCP, embeddings and RAG, hallucinations, training, mixture of experts, quantization and more — with real prices, hands-on demos and narrated audio.',
    body: learnBody({ models, root, esc, modelPath, generatedAt: snap.generatedAt, bench: snap.benchmarks?.scores ? { scores: snap.benchmarks.scores, list: BENCHMARKS, key: benchKey, source: BENCH_SOURCE } : null }),
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: 'How AI actually works', author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url }, dateModified: snap.generatedAt, url: `${SITE_URL}/learn/` },
  });
}

// ── skills & MCP (scripts/ecosystem.mjs) ──────────────────
// Agent Skills and MCP server repos from GitHub, ranked by star velocity; the MCP page adds the official registry.
const eco = snap.ecosystem || {};
const ECO = {
  skills: {
    path: 'skills/', list: eco.skills || [],
    kinds: { skill: 'Single skills', pack: 'Skill packs', directory: 'Directories' },
    tag: { skill: 'Skill', pack: 'Pack', directory: 'Directory' },
    eyebrow: 'Agent Skills', h1: 'Trending <em>Agent Skills</em>',
    lede: 'SKILL.md folders that teach Claude Code, Codex, Cursor, Copilot, OpenCode and other agents a new trick: single skills, big packs and the directories that index them. Real GitHub repos, ranked by how fast they are gaining stars.',
    title: `Trending Agent Skills for Claude Code, Codex & Cursor | ${SITE_NAME}`,
  },
  mcp: {
    path: 'mcp/', list: eco.mcp || [],
    kinds: { server: 'Servers', infra: 'SDKs & infra', directory: 'Directories & learning' },
    tag: { server: 'Server', infra: 'SDK / infra', directory: 'Directory' },
    eyebrow: 'Model Context Protocol', h1: 'Trending <em>MCP servers</em>',
    lede: 'The MCP servers that plug tools, data and apps into your AI coding agent, plus the SDKs, gateways and directories around them. Real GitHub repos ranked by star velocity, and every server just published to the official MCP Registry.',
    title: `Trending MCP Servers — Model Context Protocol Tools | ${SITE_NAME}`,
  },
};
const avatar = (url, size = 64) => (url ? `${url}${url.includes('?') ? '&' : '?'}s=${size}` : '');
// Field of work, guessed from the name, description and topics; a repo can sit in several. Order is the menu order.
const FIELDS = [
  ['frontend', 'Frontend & UI', /\b(front ?end|full ?stack|react|vue|svelte|angular|next\.?js|nuxt|tailwind|css|html|ui|ux|interfaces?|components?|shadcn|web ?apps?)\b/],
  ['backend', 'Backend & APIs', /\b(back ?end|full ?stack|apis?|rest|graphql|server side|node\.?js|django|fastapi|flask|rails|laravel|php|spring|express|microservices?|grpc|openapi)\b/],
  ['data', 'Data & databases', /\b(databases?|sql|postgres(ql)?|mysql|sqlite|mongo(db)?|redis|supabase|neon|snowflake|bigquery|clickhouse|duckdb|data|analytics|etl|spreadsheets?|excel|csv|vector|elasticsearch)\b/],
  ['devops', 'DevOps & cloud', /\b(devops|cloud|aws|azure|gcp|kubernetes|k8s|docker|terraform|ci ?\/?cd|deploy(ment)?s?|infra(structure)?|serverless|vercel|cloudflare|netlify|observability|monitoring|logs?|grafana|datadog|sentry|linux|shell|ssh|terminal|file ?system)\b/],
  ['testing', 'Testing & QA', /\b(tests?|testing|qa|e2e|tdd|debug(ging|ger)?|playwright|cypress|selenium|lint(er|ing)?|code ?review|reviews?)\b/],
  ['security', 'Security', /\b(security|secure|pentest(ing)?|vulnerabilit(y|ies)|cve|exploits?|auth(entication|orization)?|oauth|secrets?|malware|threat|red ?team|ctf|osint|privacy|sandbox(ed|ing)?|reverse engineering|ida|ghidra)\b/],
  ['browser', 'Browser & web', /\b(browser|chrome|scrap(e|er|ing)|crawl(er|ing)?|web ?search|search engines?|fetch|puppeteer|headless|web automation)\b/],
  ['git', 'Git & GitHub', /\b(git|github|gitlab|pull requests?|commits?|bitbucket)\b/],
  ['agents', 'Agents & orchestration', /\b(multi ?agents?|orchestrat(e|ion|or)|subagents?|workflows?|harness|swarm|autonomous|a2a|gateway|proxy|router|routing|agent os)\b/],
  ['memory', 'Memory & RAG', /\b(memory|memories|context (engineering|window|management)|knowledge ?graphs?|rag|embeddings?|retrieval|semantic search|codebase (index|search)|indexing)\b/],
  ['docs', 'Docs & writing', /\b(docs|documentation|writing|writer|humanizer|markdown|notion|obsidian|notes?|knowledge ?base|wiki|pdf|docx|word|blog|content)\b/],
  ['design', 'Design', /\b(design(er|s)?|figma|canva|stitch|typography|icons?|diagrams?|excalidraw|slides?|presentations?|pptx?)\b/],
  ['mobile', 'Mobile & desktop', /\b(mobile|ios|android|swift(ui)?|kotlin|flutter|react native|expo|xcode|desktop|electron|tauri|macos|windows|esp32)\b/],
  ['media', 'Media & games', /\b(images?|video|audio|music|speech|voice|tts|youtube|photos?|3d|blender|unity|unreal|games?|godot|animation|drama)\b/],
  ['productivity', 'Productivity & PM', /\b(slack|discord|telegram|whatsapp|email|gmail|calendar|jira|linear|asana|trello|todoist|productivity|office|google workspace|teams|crm|hubspot|salesforce|product manag(er|ement)|chatbot)\b/],
  ['marketing', 'Marketing & SEO', /\b(marketing|seo|ads|advertising|social media|twitter|linkedin|xiaohongshu|growth|copywriting|brand(ing)?)\b/],
  ['finance', 'Finance & business', /\b(finance|financial|trading|stocks?|crypto|blockchain|web3|ethereum|solana|payments?|stripe|accounting|invoic(e|ing)|business|legal|sales|enterprise)\b/],
  ['science', 'Research & science', /\b(research|papers?|arxiv|academic|scientific|science|bio(logy|informatics)?|chemistry|math(ematics)?|healthcare|medical)\b/],
];
const fieldsOf = (...parts) => {
  const t = parts.join(' ').toLowerCase().replace(/[-_]/g, ' ');
  const f = FIELDS.filter(([, , re]) => re.test(t)).map(([k]) => k);
  return f.length ? f : ['general'];
};
const FIELD_NAME = { ...Object.fromEntries(FIELDS.map(([k, l]) => [k, l])), general: 'General' };
const ecoFields = (r) => fieldsOf(r.name, r.description || '', r.topics.join(' '));
const ecoText = (r) => esc(`${r.name} ${r.repo} ${r.description} ${r.language || ''} ${r.topics.join(' ')} ${ecoFields(r).map((f) => FIELD_NAME[f]).join(' ')}`.toLowerCase());

function ecoCard(r, type, i) {
  const fields = ecoFields(r);
  return `<article class="ecard" data-kind="${r.kind}" data-fields="${fields.join(' ')}" data-lang="${esc(r.language || '')}" data-text="${ecoText(r)}" data-trend="${i}" data-stars="${r.count}" data-new="${Date.parse(r.createdAt)}" data-upd="${Date.parse(r.pushedAt)}">
  <div class="ecard-head">
    <img class="ecard-av skel" src="${esc(avatar(r.avatar))}" alt="" width="32" height="32" loading="lazy" decoding="async">
    <div class="ecard-who"><h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></h3><small>${esc(r.owner)}</small></div>
    <span class="ecard-kind ek-${r.kind}">${ECO[type].tag[r.kind]}</span>
  </div>
  ${r.description ? `<p class="ecard-sum">${esc(r.description)}</p>` : ''}
  <div class="ecard-fields">${fields.slice(0, 3).map((f) => `<button type="button" data-efield="${f}">${esc(FIELD_NAME[f])}</button>`).join('')}</div>
  <div class="ecard-foot">
    <span title="${r.count.toLocaleString('en-US')} stars">★ ${compact(r.count)}</span>
    ${r.starsPerWeek > 0 ? `<span class="trend" title="Stars gained in the last week">↗ +${compact(r.starsPerWeek)}/wk</span>` : ''}
    ${r.language ? `<span>${esc(r.language)}</span>` : ''}
    ${r.license ? `<span>${esc(r.license)}</span>` : ''}
    <span>updated ${time(r.pushedAt)}</span>
  </div>
</article>`;
}

function registryList(reg) {
  return `<aside class="side"><div class="side-card">
    <p class="eyebrow">Official MCP Registry</p>
    <h2>Just published</h2>
    <p class="muted small">${reg.total.toLocaleString('en-US')}${reg.capped ? '+' : ''} servers published or updated on <a href="https://registry.modelcontextprotocol.io" target="_blank" rel="noopener">the official registry</a> in the last ${reg.days === 1 ? '24 hours' : `${reg.days} days`}. Newest first.</p>
    <ol class="reg">${reg.servers.slice(0, 30).map((s) => `<li data-fields="${fieldsOf(s.title, s.description || '').join(' ')}" data-text="${esc(`${s.title} ${s.name} ${s.description || ''}`.toLowerCase())}">
      <div class="reg-top">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.title)}</a>` : `<strong>${esc(s.title)}</strong>`}<code>${esc(s.version)}</code></div>
      ${s.description ? `<p>${esc(s.description.length > 120 ? `${s.description.slice(0, 117)}…` : s.description)}</p>` : ''}
      <div class="reg-meta"><span>${esc(s.name)}</span>${s.remote ? '<span>remote</span>' : ''}${s.packages.map((p) => `<span>${esc(p)}</span>`).join('')}${time(s.publishedAt)}</div>
    </li>`).join('')}</ol>
    <p class="muted small reg-empty" hidden>No registry servers in this field.</p>
  </div></aside>`;
}

// Most-installed skills (claude-plugins.dev) and most-used servers (Smithery), shown above the trending repos.
const POP_SHOWN = 24, POP_OPEN = 6; // the rest folds away so the trending filters stay near the top
function popCard(r, type) {
  const img = type === 'mcp' ? r.icon : r.owner && `https://github.com/${encodeURIComponent(r.owner)}.png?size=64`;
  const count = type === 'mcp' ? r.uses : r.installs;
  return `<article class="ecard">
  <div class="ecard-head">
    <img class="ecard-av skel" src="${esc(img || '')}" alt="" width="32" height="32" loading="lazy" decoding="async">
    <div class="ecard-who"><h3><a href="${esc(r.url)}" target="_blank" rel="noopener nofollow">${esc(r.name)}</a></h3><small>${esc(r.repo || r.owner)}</small></div>
    <span class="ecard-kind ek-${type === 'mcp' ? 'server' : 'skill'}">${type === 'mcp' ? (r.remote ? 'Hosted' : 'Server') : 'Skill'}</span>
  </div>
  ${r.description ? `<p class="ecard-sum">${esc(r.description.length > 220 ? `${r.description.slice(0, 217)}…` : r.description)}</p>` : ''}
  <div class="ecard-foot">
    <span title="${count.toLocaleString('en-US')} ${type === 'mcp' ? 'uses' : 'installs'}">⬇ ${compact(count)} ${type === 'mcp' ? 'uses' : 'installs'}</span>
    ${r.verified ? '<span>verified</span>' : ''}
    ${r.stars ? `<span title="Stars on the repo it lives in">★ ${compact(r.stars)}</span>` : ''}
  </div>
</article>`;
}
function popSection(type) {
  const list = (type === 'mcp' ? eco.mcpTop : eco.skillsTop) || [];
  if (!list.length) return '';
  const src = type === 'mcp'
    ? '<a href="https://smithery.ai" target="_blank" rel="noopener">Smithery</a>, ranked by how many times each server has been used'
    : '<a href="https://claude-plugins.dev/skills" target="_blank" rel="noopener">claude-plugins.dev</a>, which indexes every SKILL.md on GitHub, ranked by installs';
  return `<section class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Most ${type === 'mcp' ? 'used' : 'installed'}</p><h2>${type === 'mcp' ? 'The MCP servers people actually run' : 'The skills people actually install'}</h2></div></div>
  <div class="egrid">${list.slice(0, POP_OPEN).map((r) => popCard(r, type)).join('')}</div>
  ${list.length > POP_OPEN ? `<details class="notes pop-more"><summary>Show ${Math.min(list.length, POP_SHOWN) - POP_OPEN} more</summary><div class="egrid">${list.slice(POP_OPEN, POP_SHOWN).map((r) => popCard(r, type)).join('')}</div></details>` : ''}
  <p class="muted small section-note">From ${src}. Many of these live inside larger repos${type === 'mcp' ? ' or run as hosted services' : ''}, so they don't show up in the trending list below.</p>
</section>`;
}

function ecoPage(type) {
  const root = '../';
  const cfg = ECO[type], list = cfg.list;
  const counts = Object.fromEntries(Object.keys(cfg.kinds).map((k) => [k, list.filter((r) => r.kind === k).length]));
  const weekStars = list.reduce((s, r) => s + Math.max(0, r.starsPerWeek || 0), 0);
  const reg = type === 'mcp' && eco.registry?.servers?.length ? eco.registry : null;
  const fieldCount = {}, langCount = {};
  list.forEach((r) => { ecoFields(r).forEach((f) => { fieldCount[f] = (fieldCount[f] || 0) + 1; }); if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1; });
  const langs = Object.entries(langCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const grid = `<div class="egrid">${list.map((r, i) => ecoCard(r, type, i)).join('')}</div><p class="empty eempty" hidden>Nothing matches these filters.</p>`;
  const body = `
<section class="wrap hero hero-sm">
  <p class="eyebrow">${cfg.eyebrow}</p>
  <h1>${cfg.h1}</h1>
  <p class="lede">${cfg.lede}</p>
  <dl class="stats eco-stats">
    <div><dt>Repos tracked</dt><dd>${list.length}</dd></div>
    <div><dt>Combined stars</dt><dd>${compact(list.reduce((s, r) => s + r.count, 0))}</dd></div>
    <div><dt>${weekStars ? 'Stars gained, 7 days' : 'New in 30 days'}</dt><dd>${weekStars ? `+${compact(weekStars)}` : list.filter((r) => NOW - Date.parse(r.createdAt) < 30 * DAY).length}</dd></div>
    <div><dt>${reg ? `Registry, last ${reg.days === 1 ? '24h' : `${reg.days} days`}` : 'Single skills'}</dt><dd>${reg ? compact(reg.total) : counts.skill || 0}</dd></div>
  </dl>
</section>

${banner()}
${popSection(type)}
<section class="wrap section eco">
  <div class="section-head">
    <div class="echips" role="group" aria-label="Filter by type">
      <button type="button" class="chip on" data-ekind="all" aria-pressed="true">All <small>${list.length}</small></button>
      ${Object.entries(cfg.kinds).filter(([k]) => counts[k]).map(([k, l]) => `<button type="button" class="chip" data-ekind="${k}" aria-pressed="false">${esc(l)} <small>${counts[k]}</small></button>`).join('')}
    </div>
    <div class="eco-tools">
      <label class="eco-search"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="eq" type="search" placeholder="Search ${type === 'mcp' ? 'servers' : 'skills'}…" aria-label="Search" autocomplete="off"></label>
      <label class="ntool-pick"><select id="efield" aria-label="Filter by field">
        <option value="">All fields</option>
        ${[...FIELDS.map(([k]) => k), 'general'].filter((k) => fieldCount[k]).map((k) => `<option value="${k}">${esc(FIELD_NAME[k])} (${fieldCount[k]})</option>`).join('')}
      </select></label>
      ${langs.length > 1 ? `<label class="ntool-pick"><select id="elang" aria-label="Filter by language">
        <option value="">All languages</option>
        ${langs.map(([l, c]) => `<option value="${esc(l)}">${esc(l)} (${c})</option>`).join('')}
      </select></label>` : ''}
      <label class="ntool-pick"><select id="esort" aria-label="Sort by">
        <option value="trend">Trending</option><option value="stars">Most stars</option><option value="new">Newest</option><option value="upd">Recently updated</option>
      </select></label>
    </div>
  </div>
  ${list.length ? (reg ? `<div class="feed-layout eco-layout"><div>${grid}</div>${registryList(reg)}</div>` : grid) : '<p class="muted">No data yet — it appears after the next full refresh.</p>'}
  ${ad('inline')}
  <p class="muted small section-note eco-note">Repos come from the GitHub Search API (${type === 'mcp' ? 'MCP topics and descriptions' : 'Agent Skills topics, descriptions and SKILL.md mentions'}), must have been pushed to in the last 90 days, and are ranked by stars gained over the past week. Refreshed every few hours${eco.fetchedAt ? `; last ${time(eco.fetchedAt)}` : ''}.</p>
</section>`;
  return layout({
    root, path: cfg.path, active: type, title: cfg.title,
    description: `${cfg.eyebrow}: ${list.slice(0, 6).map((r) => r.name).join(', ')} and ${Math.max(0, list.length - 6)} more trending open-source repos.`,
    jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.eyebrow, itemListElement: list.slice(0, 50).map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.name, url: r.url })) },
    body,
  });
}

// ── usage (OpenCode Data) ─────────────────────────────────
// Real-world usage across OpenCode (scripts/opencode.mjs): which models people actually run, and what it costs.
const oc = snap.opencode?.leaderboard?.pastWeek?.length ? snap.opencode : null;
const big = (n) => {
  if (n == null) return '—';
  const [d, s] = n >= 1e12 ? [1e12, 'T'] : n >= 1e9 ? [1e9, 'B'] : n >= 1e6 ? [1e6, 'M'] : n >= 1e3 ? [1e3, 'K'] : [1, ''];
  const v = n / d;
  return `${v < 10 && s ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)}${s}`;
};
const OC_LABS = { zhipu: 'Zhipu', reflection: 'Reflection', meituan: 'Meituan', stepfun: 'StepFun', xiaomi: 'Xiaomi' };
const ocLab = (id) => OC_LABS[id] || models.find((m) => m.labId === id)?.lab || (id ? id[0].toUpperCase() + id.slice(1) : '');
// OpenCode's model slug ("deepseek-v4.1-flash") → our model page, when we track that exact model.
const ocModel = Object.fromEntries(models.map((m) => [m.id.split('/').slice(1).join('/'), m]));
const ocName = (slug) => oc?.leaderboard.pastWeek.find((r) => r.model === slug)?.name || ocModel[slug]?.name || slug;
// Series colours for stacked charts (lab colours repeat when one lab has several models); "Other" stays neutral.
const OC_PALETTE = ['#ff6b35', '#7fa8d6', '#7fbf7f', '#b89bd1', '#e2c35a', '#e2457a', '#4fc1b0', '#9b8cff', '#d98b5f', '#6fb3e0'];
const ocColor = (keys) => Object.fromEntries(keys.map((k, i) => [k, k === 'Other' ? 'var(--ink-3)' : OC_PALETTE[i % OC_PALETTE.length]]));
const country = (() => { try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return (c) => { try { return d.of(c); } catch { return c; } }; } catch { return (c) => c; } })();
const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function ocModelLink(r, root) {
  const m = ocModel[r.model];
  return m ? `<a href="${root}${modelPath(m)}">${esc(r.name || m.name)}</a>` : `<a href="${esc(r.page || OPENCODE_SOURCE.url)}" target="_blank" rel="noopener">${esc(r.name || r.model)}</a>`;
}

// Ranked token leaderboard with week-over-week change.
function ocRanking(rows, root, { change = true } = {}) {
  const max = Math.max(...rows.map((r) => r.tokens)) || 1;
  return `<ol class="oc-rank">${rows.map((r) => {
    const m = ocModel[r.model];
    const delta = !change ? '' : r.changePercent == null ? '<span class="oc-chg oc-new">New</span>'
      : `<span class="oc-chg ${r.changePercent >= 0 ? 'oc-up' : 'oc-down'}">${r.changePercent >= 0 ? '+' : ''}${r.changePercent}%</span>`;
    return `<li style="--c:${m?.color || 'var(--accent)'};--w:${Math.max(0.6, (r.tokens / max) * 100).toFixed(1)}%">
      <span class="oc-n">${String(r.rank).padStart(2, '0')}</span>
      <span class="oc-who">${ocModelLink(r, root)}<small>${esc(ocLab(r.lab))}</small></span>
      <span class="oc-bar"><i></i></span>
      <span class="oc-v">${big(r.tokens)}<small> tokens</small></span>${delta}
    </li>`;
  }).join('')}</ol>`;
}

// Stacked daily bars (SVG). `days`: [{ date, parts: { key: value } }]; `pct` charts shares that sum to 100.
function ocStacked(days, keys, { label, fmt = big, pct = false, names = (k) => k } = {}) {
  const W = 960, H = 260, L = 46, B = 24, T = 8;
  const colors = ocColor(keys);
  const totals = days.map((d) => keys.reduce((s, k) => s + (d.parts[k] || 0), 0));
  const top = Math.max(...totals) || 1;
  const step = 10 ** Math.floor(Math.log10(top / 4)), unit = [1, 2, 2.5, 5, 10].find((f) => f * step * 4 >= top) * step;
  const max = pct ? 100 : unit * 4; // four even gridlines, rounded
  const bw = (W - L) / days.length;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const bars = days.map((d, i) => {
    let acc = 0;
    const x = L + i * bw + bw * 0.12;
    return keys.map((k) => {
      const v = d.parts[k] || 0;
      if (!v) return '';
      const y1 = y(acc + v), h = y(acc) - y1;
      acc += v;
      return `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="${colors[k]}"><title>${esc(`${shortDay(d.date)} · ${names(k)}: ${pct ? `${v}%` : fmt(v)}`)}</title></rect>`;
    }).join('');
  }).join('');
  const every = Math.max(1, Math.round(days.length / 6));
  return `<figure class="oc-chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
      ${ticks.map((t) => `<line x1="${L}" x2="${W}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="oc-gl"/><text x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" class="oc-ax">${pct ? `${Math.round(t)}%` : fmt(t)}</text>`).join('')}
      ${bars}
      ${days.map((d, i) => (i % every ? '' : `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="oc-ax">${esc(shortDay(d.date).toUpperCase())}</text>`)).join('')}
    </svg>
    <figcaption class="oc-legend">${keys.map((k) => `<span><i style="background:${colors[k]}"></i>${esc(names(k))}</span>`).join('')}</figcaption>
  </figure>`;
}

// Simple horizontal bars for the small cards (session cost, cache ratio, countries…).
const ocBars = (rows, { fmt, max = Math.max(...rows.map((r) => r.v)) || 1 }) => `<ol class="oc-hbars">${rows.map((r) => `<li style="--w:${Math.max(1, (r.v / max) * 100).toFixed(1)}%"><span class="oc-hl">${r.label}</span><span class="oc-hb"><i></i></span><span class="oc-hv">${fmt(r.v)}</span></li>`).join('')}</ol>`;

function ocTabs(id, label, views) {
  return `<div class="lb-body oc-tabs">
    <div class="lb-nav" role="tablist" aria-label="${esc(label)}" aria-orientation="vertical">
      ${views.map((v, i) => `<button type="button" role="tab" id="${id}-tab-${v.id}" aria-controls="${id}-${v.id}" aria-selected="${!i}"${i ? ' tabindex="-1"' : ''}>${esc(v.name)}</button>`).join('')}
    </div>
    <div class="lb-panels">${views.map((v, i) => `<div class="lb-panel" role="tabpanel" id="${id}-${v.id}" aria-labelledby="${id}-tab-${v.id}"${i ? ' hidden' : ''}>
      <div class="lb-head"><h3><i class="lb-sq" style="--t:var(--${v.tone || 'accent'})"></i>${esc(v.title || v.name)}</h3><p class="muted small">${v.desc}</p></div>
      ${v.html}
    </div>`).join('')}</div>
  </div>`;
}

const usd4 = (n) => `$${n < 0.01 ? n.toFixed(4) : n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

// Model usage across OpenCode, shown on the OpenCode tool page.
function ocSections(root) {
  const lb = oc.leaderboard;
  const lead = lb.pastWeek[0];
  const series = (list) => {
    const keys = Object.keys(list.at(-1)?.models || {});
    return { keys: [...keys.filter((k) => k !== 'Other'), ...keys.filter((k) => k === 'Other')], days: list.map((d) => ({ date: d.date, parts: d.models })) };
  };
  const tok = series(oc.dailyTokens), users = series(oc.dailyUniqueUsers);
  const labsOrder = Object.keys(Object.fromEntries((oc.marketShare.at(-1)?.labs || []).map((l) => [l.lab, 1])));
  const labKeys = [...labsOrder.filter((k) => k !== 'Other'), ...labsOrder.filter((k) => k === 'Other')];
  const share = oc.marketShare.map((d) => ({ date: d.date, parts: Object.fromEntries(d.labs.map((l) => [l.lab, l.sharePercent])) }));
  const span = `${shortDay(oc.dailyTokens[0].date)} – ${shortDay(oc.dailyTokens.at(-1).date)}`;
  const weekTotal = lb.pastWeek.reduce((s, r) => s + r.tokens, 0);
  const peakUsers = Math.max(...oc.dailyUniqueUsers.map((d) => d.total));
  const today = oc.marketShare.at(-1);

  return `
<section id="usage" class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Usage data</p><h2>Which models OpenCode users <em>actually run</em></h2></div><p class="muted small section-note">${esc(oc.summary)} Source: <a href="${OPENCODE_SOURCE.url}" target="_blank" rel="noopener">${OPENCODE_SOURCE.name}</a> · updated ${time(oc.updatedAt)} · aggregated hourly, days in UTC.</p></div>
  <dl class="stats oc-stats">
    <div><dt>Most used · 7 days</dt><dd>${esc(lead.name)}<small> ${big(lead.tokens)}</small></dd></div>
    <div><dt>Tokens · top ${lb.pastWeek.length} models, 7 days</dt><dd>${big(weekTotal)}</dd></div>
    <div><dt>Peak daily users</dt><dd>${big(peakUsers)}</dd></div>
    <div><dt>Top lab today</dt><dd>${esc(today?.labs.slice().sort((a, b) => b.sharePercent - a.sharePercent)[0]?.lab || '—')}<small> ${today?.labs.slice().sort((a, b) => b.sharePercent - a.sharePercent)[0]?.sharePercent ?? ''}%</small></dd></div>
  </dl>
</section>

<section id="top-models" class="wrap section lb">
  <div class="section-head"><div><p class="eyebrow">Leaderboard</p><h2>Top models by tokens</h2></div><p class="muted small section-note">Input, output, reasoning and cached tokens per request, summed. Names link to the model's page here when we track it.</p></div>
  ${ocTabs('ocl', 'Leaderboard period', [
    { id: 'week', name: 'Past 7 days', title: 'Past 7 days', desc: 'Change compared with the 7 days before', html: ocRanking(lb.pastWeek, root) },
    ...(lb.pastDay.length ? [{ id: 'day', name: 'Past 24 hours', title: 'Past 24 hours', tone: 'k-changelog', desc: 'Tokens served so far in the current UTC day', html: ocRanking(lb.pastDay, root, { change: false }) }] : []),
  ])}
</section>

<section id="trends" class="wrap section lb">
  <div class="section-head"><div><p class="eyebrow">Trends · ${esc(span)}</p><h2>How the mix is shifting</h2></div><p class="muted small section-note">Daily totals for today's top models; everything else is grouped as Other. Hover a bar for the exact figure.</p></div>
  ${ocTabs('oct', 'Trend chart', [
    { id: 'tokens', name: 'Tokens', title: 'Daily tokens', desc: 'Tokens served per day, by model', html: ocStacked(tok.days, tok.keys, { label: 'Daily tokens by model', names: ocName }) },
    { id: 'users', name: 'Unique users', title: 'Daily unique users', tone: 'k-release', desc: 'Approximate distinct OpenCode users per day, by model', html: ocStacked(users.days, users.keys, { label: 'Daily unique users by model', names: ocName }) },
    { id: 'share', name: 'Market share', title: 'Market share by lab', tone: 'k-blog', desc: 'Share of each day’s tokens by the lab that made the model', html: ocStacked(share, labKeys, { label: 'Token share by lab', pct: true }) },
  ])}
</section>

<section id="economics" class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Economics</p><h2>Retention, cost &amp; caching</h2></div></div>
  <div class="oc-grid">
    ${oc.weeklyRetention.length ? `<div class="side-card oc-card"><p class="eyebrow">Weekly retention</p><h2>Who comes back</h2><p class="muted small">Share of a model's users one week who use it again the next week.</p>
      <table class="oc-table"><thead><tr><th>#</th><th>Model</th><th>Retained</th><th>Users</th></tr></thead><tbody>${oc.weeklyRetention.map((r) => `<tr><td class="muted">${String(r.rank).padStart(2, '0')}</td><td>${ocModelLink(r, root)}</td><td><b>${r.retentionPercent}%</b></td><td class="muted">${big(r.eligibleUserWeeks)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${oc.sessionCost.length ? `<div class="side-card oc-card"><p class="eyebrow">Session cost</p><h2>Cost per session</h2><p class="muted small">Average list-price cost of one OpenCode session, and its tokens.</p>
      ${ocBars(oc.sessionCost.map((r) => ({ label: `${esc(ocName(r.model))}<small>${big(r.tokensPerSession)} tokens</small>`, v: r.costPerSessionUsd })), { fmt: usd4 })}</div>` : ''}
    ${oc.tokenPrices.length ? `<div class="side-card oc-card"><p class="eyebrow">Token prices</p><h2>Price per 1M tokens</h2><p class="muted small">List prices in OpenCode's model catalog, USD.</p>
      <table class="oc-table"><thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Cached</th></tr></thead><tbody>${oc.tokenPrices.map((r) => `<tr><td>${esc(ocName(r.model))}</td><td>${usd4(r.input)}</td><td><b>${usd4(r.output)}</b></td><td class="muted">${usd4(r.cachedInput)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${oc.cacheRatio.length ? `<div class="side-card oc-card"><p class="eyebrow">Cache ratio</p><h2>Input served from cache</h2><p class="muted small">Share of input tokens that were cache hits.</p>
      ${ocBars(oc.cacheRatio.map((r) => ({ label: `${esc(ocName(r.model))}<small>${big(r.cachedInputTokens)} cached</small>`, v: r.cachedInputPercent })), { fmt: (v) => `${Math.round(v)}%`, max: 100 })}</div>` : ''}
  </div>
</section>

${oc.countries.length ? `<section id="geography" class="wrap section">
  <div class="section-head"><div><p class="eyebrow">Geography</p><h2>Where the tokens come from</h2></div><p class="muted small section-note">Tokens by the requesting user's country over the period shown.</p></div>
  <div class="oc-geo">${ocBars(oc.countries.slice(0, 20).map((r) => ({ label: `<span class="muted">${String(r.rank).padStart(2, '0')}</span> ${esc(country(r.country))}`, v: r.tokens })), { fmt: big })}</div>
</section>` : ''}

<section class="wrap section">
  <p class="muted small section-note">Data from <a href="${OPENCODE_SOURCE.url}" target="_blank" rel="noopener">${OPENCODE_SOURCE.name}</a> (opencode.ai/data), updated ${fmtDate(oc.updatedAt)} ${new Date(oc.updatedAt).toISOString().slice(11, 16)} UTC. Tokens count input, output, reasoning and cached tokens for each request; users and sessions are approximate distinct counts; costs use list prices. It reflects OpenCode's users only, not the wider market.</p>
</section>`;
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
    <ul class="plans">${pr.plans.map((p) => `<li><div><strong>${esc(p.name)}</strong>${p.note ? `<span>${esc(p.note)}</span>` : ''}${p.since ? `<span class="since">Since ${fmtLaunch(p.since)}</span>` : ''}</div><b class="${p.price === 0 ? 'free' : ''}">${planPrice(p)}</b></li>`).join('')}</ul>
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
  <td>${free.length ? free.map((p) => `<div class="pfree"><span class="pbadge free">Free</span><div><strong>${esc(p.name)}</strong>${p.note ? `<small>${esc(p.note)}</small>` : ''}${p.since ? `<small class="since">Since ${fmtLaunch(p.since)}</small>` : ''}</div></div>`).join('') : '<span class="pbadge none">No free plan</span>'}</td>
  <td><div class="pchips">${paid.length ? paid.map((p) => `<span class="pchip" data-price="${p.price ?? ''}"${p.note ? ` title="${esc(p.note)}"` : ''}><span>${esc(p.name)}</span><b>${planPrice(p)}</b><em class="ptotal" hidden></em>${p.note ? `<small>${esc(p.note)}</small>` : ''}${p.since ? `<small class="since">Since ${fmtLaunch(p.since)}</small>` : ''}</span>`).join('') : '<span class="muted small">Free only</span>'}</div>${pr.note ? `<p class="pnote">${esc(pr.note)}</p>` : ''}</td>
  <td class="pfrom">${from == null ? '<span class="pbadge free">$0</span>' : `<b class="pfrom-v">${usd(from)}</b><small>/mo</small>`}${pr.url ? `<a href="${esc(pr.url)}" target="_blank" rel="noopener" aria-label="${esc(t.name)} official pricing">Pricing ↗</a>` : ''}</td>
</tr>`;
  };
  // Client-side data for the budget, team-size, sort and side-by-side controls.
  const cmpData = Object.fromEntries(rows.map(({ t, pr }) => [t.id, {
    name: t.name, vendor: t.vendor, color: t.color, href: `${root}tools/${t.id}/`, url: pr.url || '', note: pr.note || '',
    icon: icon(t, root, 'md'), plans: pr.plans.map((p) => ({ name: p.name, price: p.price, seat: !!p.seat, from: !!p.from, note: p.note || '', since: p.since ? fmtLaunch(p.since) : '' })),
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

async function portraits() {
  await mkdir(new URL('portraits/', DIST), { recursive: true });
  const cacheDir = new URL('data/portraits/', ROOT);
  const wanted = Object.entries(COMPANIES).flatMap(([co, i]) => [
    ...(i.founders || []).flatMap((f) => subjects(f).map((name) => ({ name, kind: 'person', ctx: co }))),
    ...(i.holders || []).flatMap((h) => subjects(h).filter((n) => !coByName(n)).map((name) => ({ name, kind: 'any', ctx: co }))),
  ]);
  PORTRAITS = await resolvePortraits(wanted, cacheDir);
  await Promise.all(Object.values(PORTRAITS).filter((m) => m.file).map((m) => cp(new URL(m.file, cacheDir), new URL(`portraits/${m.file}`, DIST))));
}

const out = async (path, content) => {
  const url = new URL(path, DIST);
  await mkdir(new URL('./', url), { recursive: true });
  await writeFile(url, content);
};

// Raster favicons for browsers and apps that skip SVG icons (Safari, previews, search results).
const favicons = async () => {
  const svg = await readFile(new URL('static/favicon.svg', ROOT));
  const png = (w) => new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng();
  const ico32 = png(32);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(32, 6); head.writeUInt8(32, 7);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(ico32.length, 14); head.writeUInt32LE(22, 18);
  await writeFile(new URL('favicon.ico', DIST), Buffer.concat([head, ico32]));
  await writeFile(new URL('apple-touch-icon.png', DIST), png(180));
  // Installable-app icons. The maskable one goes full-bleed with the mark inside the 80% safe zone.
  const mark = svg.toString().match(/<g[\s\S]*<\/g>/)[0];
  const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#121211"/><g transform="translate(6.4 6.4) scale(.6)">${mark}</g></svg>`);
  const maskPng = (w) => new Resvg(maskable, { fitTo: { mode: 'width', value: w } }).render().asPng();
  await writeFile(new URL('icons/pwa-192.png', DIST), png(192));
  await writeFile(new URL('icons/pwa-512.png', DIST), png(512));
  await writeFile(new URL('icons/pwa-maskable-512.png', DIST), maskPng(512));
};

// Progressive web app: manifest, offline fallback page and a service worker stamped per build.
const pwa = async () => {
  await out('manifest.webmanifest', JSON.stringify({
    id: '/', name: `${SITE_NAME}: AI News & Models`, short_name: SITE_NAME,
    description: 'Live AI news, model launches, benchmarks and coding-tool updates.',
    start_url: '/', scope: '/', display: 'standalone', background_color: '#121211', theme_color: '#121211',
    categories: ['news', 'developer', 'productivity'],
    icons: [
      { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'News', url: '/news/' },
      { name: 'My feed', url: '/my-feed/' },
      { name: 'Models', url: '/models/' },
      { name: 'Compare plans', url: '/compare/' },
    ],
  }));
  await out('offline.html', layout({
    root: '/', path: 'offline.html', title: `Offline · ${SITE_NAME}`, description: 'You are offline.',
    body: `<section class="wrap" style="padding:15vh 0;text-align:center"><h1>You're offline</h1><p>This page isn't saved on this device yet. Pages you've already opened still work, and everything refreshes once you're back online.</p><p><a href="/">← Back to the latest updates</a></p></section>`,
  }).replace('<head>', '<head>\n<meta name="robots" content="noindex">'));
  if (ANDROID_APP.sha256.length) await out('.well-known/assetlinks.json', JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: ANDROID_APP.id, sha256_cert_fingerprints: ANDROID_APP.sha256 },
  }], null, 2));
  const sw = await readFile(new URL('scripts/sw.js', ROOT), 'utf8');
  await out('sw.js', sw.replace('__VERSION__', String(NOW)));
};

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(new URL('src/', ROOT), new URL('assets/', DIST), { recursive: true });
await cp(new URL('static/', ROOT), DIST, { recursive: true });
await icons();
await portraits();
await favicons();
await pwa();

await out('index.html', indexPage());
await out('tools/index.html', toolsIndexPage());
await out('news/index.html', newsPage());
await out('my-feed/index.html', myFeedPage());
await out('compare/index.html', comparePage());
if (models.length) await out('models/index.html', modelsPage());
for (const type of Object.keys(ECO)) if (ECO[type].list.length) await out(`${ECO[type].path}index.html`, ecoPage(type));
if (models.length) await out('learn/index.html', learnPage());
for (const l of labs) await out(`${labPath(l[0].labId)}index.html`, labPage(l));
for (const m of models) await out(`${modelPath(m)}index.html`, modelPage(m));
for (const t of tools) await out(`tools/${t.id}/index.html`, toolPage(t));
await out('companies/index.html', companiesIndexPage());
await out('privacy/index.html', privacyPage());
for (const c of companies) await out(`${coPath(c)}index.html`, companyPage(c));

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
  skills: ECO.skills.list.map(({ stars, avatar, ...r }) => r),
  mcp: ECO.mcp.list.map(({ stars, avatar, ...r }) => r),
  ...(oc ? { opencodeUsage: { source: OPENCODE_SOURCE, updatedAt: oc.updatedAt, pastWeek: oc.leaderboard.pastWeek } } : {}),
}));
// Tiny file the open page polls to announce new updates without a full reload of data.json.
await out('version.json', JSON.stringify({
  generatedAt: snap.generatedAt,
  latest: allItems.filter((i) => i.kind !== 'blog').slice(0, 30).map((i) => ({ id: i.id, title: i.title, tool: byId[i.toolId].name, url: `${SITE_URL}/tools/${i.toolId}/`, date: i.date })),
  // Pre-rendered home-feed cards, so the open page can insert new updates in place.
  cards: allItems.filter((i) => NOW - Date.parse(i.date) < 2 * DAY).slice(0, 20).map((i) => ({ id: i.id, date: i.date, html: feedCard(i, '') })),
}));
// Site-wide search index for the floating search dock (src/app.js). Short keys keep it small:
// t type · n name · s subtitle · u url (site-relative, or absolute when x) · k extra keywords · d date · c colour · i icon.
const srIcon = (id) => { const m = ICONS[id]; return m?.file ? `${m.mono ? '~' : ''}icons/${m.file}` : undefined; };
const srTool = (t) => ({ c: t.color, i: srIcon(t.id) });
await out('search.json', JSON.stringify({ generatedAt: snap.generatedAt, items: [
  { t: 'page', n: 'Home — latest updates', s: 'Every release, changelog and blog post, live', u: '', k: 'feed home latest releases' },
  { t: 'page', n: 'All tools', s: `${tools.length} AI IDEs, CLIs and editor agents`, u: 'tools/', k: 'directory ides clis agents' },
  { t: 'page', n: 'Compare plans & pricing', s: 'Free tiers, seats and budgets side by side', u: 'compare/', k: 'pricing plans cost free budget seats' },
  ...(news.length ? [{ t: 'page', n: 'News', s: 'Only the important stories', u: 'news/', k: 'headlines stories' }] : []),
  { t: 'page', n: 'My feed', s: 'Follow any source: RSS, YouTube, Reddit, Instagram…', u: 'my-feed/', k: 'custom personal follow subscribe rss instagram youtube reddit bluesky mastodon' },
  ...(models.length ? [
    { t: 'page', n: 'Models', s: `${models.length} models, benchmarks, leaderboard, showdown`, u: 'models/', k: 'llm benchmarks leaderboard showdown pricing context' },
    { t: 'page', n: 'Learn', s: 'How AI models actually work, narrated', u: 'learn/', k: 'guide course explain tutorial' },
  ] : []),
  ...Object.values(ECO).filter((c) => c.list.length).map((c) => ({ t: 'page', n: c.eyebrow, s: c.lede.slice(0, 90) + '…', u: c.path, k: c.path === 'mcp/' ? 'mcp servers' : 'skills claude' })),
  { t: 'page', n: 'RSS feed', s: 'Subscribe to every update', u: 'feed.xml', k: 'rss atom subscribe' },
  ...tools.map((t) => ({ t: 'tool', n: t.name, s: `${t.vendor} · ${CATEGORIES[t.category]?.short || t.category}${t.latestRelease?.version ? ` · ${t.latestRelease.version}` : ''}`, u: `tools/${t.id}/`, k: `${t.blurb || t.description || ''} ${t.discovered ? 'trending' : ''}`.toLowerCase(), d: t.latest?.date, ...srTool(t) })),
  ...(models.length ? LEARN_SECTIONS.map(([id, title], i) => ({ t: 'learn', n: title, s: `Chapter ${String(i + 1).padStart(2, '0')}`, u: `learn/#${id}`, k: id })) : []),
  { t: 'page', n: 'Companies', s: `${companies.length} AI labs and tool makers`, u: 'companies/', k: 'companies vendors labs makers directory' },
  ...companies.map((c) => ({ t: 'company', n: c.name, s: coCounts(c), u: coPath(c), k: `${c.tools.map((t) => t.name).join(' ')} ${c.info.parent || ''}`.toLowerCase(), d: c.last, c: c.color, i: srIcon(c.iconId) })),
  ...labs.map((l) => ({ t: 'lab', n: l[0].lab, s: `${l.length} model${l.length === 1 ? '' : 's'}`, u: labPath(l[0].labId), c: l[0].color, i: srIcon(`lab-${l[0].labId}`) })),
  ...models.map((m) => ({ t: 'model', n: m.name, s: `${m.lab} · ${tokens(m.context)} ctx · ${priceLine(m)}`, u: modelPath(m), k: `${m.id} ${m.reasoning ? 'reasoning' : ''} ${m.openWeights ? 'open weights' : ''} ${m.free ? 'free' : ''} ${m.modalities.join(' ')}`.toLowerCase(), d: m.date, c: m.color, i: srIcon(`lab-${m.labId}`) })),
  ...news.map((n) => { const t = byId[n.toolIds[0]]; return { t: 'news', n: n.title, s: `${n.tag}${t ? ` · ${t.name}` : ''}`, u: n.url, x: 1, k: (n.summary || '').slice(0, 160).toLowerCase(), d: n.date, ...(t ? srTool(t) : {}) }; }),
  ...Object.entries(ECO).flatMap(([type, c]) => c.list.map((r) => ({ t: type, n: r.name, s: `${r.repo} · ${c.tag[r.kind] || r.kind}`, u: r.url, x: 1, k: `${r.description || ''} ${r.topics.join(' ')}`.slice(0, 200).toLowerCase() }))),
  ...allItems.map((i) => { const t = byId[i.toolId]; return { t: 'update', n: i.title, s: `${t.name} · ${KIND[i.kind]}${i.version ? ` · ${i.version}` : ''}`, u: i.url, x: 1, k: `${t.name} ${i.version || ''}`.toLowerCase(), d: i.date, ...srTool(t) }; }),
  ...snap.discussions.map((d) => { const t = byId[d.toolId]; return { t: 'discussion', n: d.title, s: `Hacker News${t ? ` · ${t.name}` : ''}`, u: d.hnUrl || d.url, x: 1, k: t ? t.name.toLowerCase() : '', d: d.date, ...(t ? srTool(t) : {}) }; }),
] }));
await out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>
<url><loc>${SITE_URL}/news/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>hourly</changefreq><priority>0.9</priority></url>
<url><loc>${SITE_URL}/my-feed/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
${models.length ? `<url><loc>${SITE_URL}/models/</loc><lastmod>${models[0].date}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n` : ''}${labs.map((l) => `<url><loc>${SITE_URL}/${labPath(l[0].labId)}</loc><lastmod>${l[0].date}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`).join('')}${models.map((m) => `<url><loc>${SITE_URL}/${modelPath(m)}</loc><lastmod>${snap.benchmarks?.fetchedAt || m.date}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`).join('')}${models.length ? `<url><loc>${SITE_URL}/learn/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
` : ''}${Object.values(ECO).filter((c) => c.list.length).map((c) => `<url><loc>${SITE_URL}/${c.path}</loc><lastmod>${eco.fetchedAt || snap.generatedAt}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`).join('')}<url><loc>${SITE_URL}/compare/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
<url><loc>${SITE_URL}/tools/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
<url><loc>${SITE_URL}/companies/</loc><lastmod>${snap.generatedAt}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>
${companies.map((c) => `<url><loc>${SITE_URL}/${coPath(c)}</loc><lastmod>${c.last}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`).join('\n')}
${tools.map((t) => `<url><loc>${SITE_URL}/tools/${t.id}/</loc><lastmod>${t.lastActive}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`).join('\n')}
</urlset>`);
await out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (ADS.client) await out('ads.txt', `google.com, ${ADS.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0
`);
await out('.nojekyll', '');
console.log(`Built ${tools.length + 5 + companies.length + Object.values(ECO).filter((c) => c.list.length).length + (models.length ? 2 + labs.length + models.length : 0)} pages → dist/`);
