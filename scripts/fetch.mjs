// Fetches real release + news data for every tool and writes data/snapshot.json.
// Each source fails independently; a failed source falls back to the previous snapshot.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { TOOLS, HN_MATCH, HN_QUERIES, DISCOVERY } from './sources.mjs';
import { searchCandidates, toTool } from './discover.mjs';
import { NEWS_FEEDS, LAB_ACCOUNTS, fetchX, pickNews, newsImages } from './news.mjs';
import { resolveHandles, toolsByHandle } from './xaccounts.mjs';
import { fetchModels, fetchProviders } from './models.mjs';
import { fetchBenchmarks } from './benchmarks.mjs';
import { fetchAA } from './aa.mjs';
import { fetchOpenCode } from './opencode.mjs';
import { fetchEcosystem } from './ecosystem.mjs';

const SNAPSHOT = new URL('../data/snapshot.json', import.meta.url);
const UA = 'Mozilla/5.0 (compatible; AI-IDE-News/1.0; +https://ai-ide-news.github.io)';
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DAY = 86400e3;
const NOW = Date.now();
const MAX_PER_TOOL = 40;
const RELEASES_PAGE = 100;
const RELEASES_PAGE_SMALL = 30;
const MAX_RELEASE_DATES = 1000; // how far back a full run pages for the activity chart
const CADENCE_WINDOW = Infinity; // the tool page's activity chart spans each tool's whole history
// QUICK=1: the frequent "is there anything new?" run — skips trending discovery and repo metadata,
// and uses conditional requests so unchanged GitHub repos cost nothing against the rate limit.
const QUICK = process.env.QUICK === '1';
const UNSTABLE = /nightly|alpha|beta|preview|canary|[-.]rc\.?\d*|-pre\b|\bdev\b|insiders/i;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: false, processEntities: true, htmlEntities: true });

const sanitize = (html) => sanitizeHtml(html, {
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'p', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'strong', 'em', 'b', 'i', 'blockquote', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'kbd', 'del'],
  allowedAttributes: { a: ['href'], img: ['src', 'alt'] },
  allowedSchemes: ['https', 'http'],
  transformTags: {
    a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener nofollow', target: '_blank' } }),
    img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy', decoding: 'async' } }),
    h1: 'h4', h2: 'h4', h3: 'h5',
  },
});

const toText = (html) => sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} })
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const excerpt = (text, n = 260) => (text.length > n ? text.slice(0, text.lastIndexOf(' ', n) > 0 ? text.lastIndexOf(' ', n) : n) + '…' : text);

const clipHtml = (html, n = 9000) => {
  if (html.length <= n) return html;
  return sanitize(html.slice(0, html.lastIndexOf('</', n) > 0 ? html.lastIndexOf('</', n) : n)) + '<p class="clipped">…</p>';
};

const str = (v) => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? '') : String(v));

async function get(url, { json = false, headers = {} } = {}, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*', ...headers }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await (json ? res.json() : res.text());
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return get(url, { json, headers }, attempt + 1);
  }
}

// "Release v1.2.3" / "Aider v1.2.3" → "Tool 1.2.3"; keeps any real release title as a subtitle.
function releaseTitle(tool, version, name) {
  const extra = (name || '')
    .split(tool.name).join('')
    .replace(version, '').replace(version.replace(/^v/, ''), '')
    .replace(/\b(release|version|v)\b/ig, "").replace(/^[\s:|\u2013\u2014-]+|[\s:|\u2013\u2014-]+$/g, "").trim();
  return extra.length > 3 ? `${tool.name} ${version} — ${extra}` : `${tool.name} ${version}`;
}

const ghHeaders = () => ({ Accept: 'application/vnd.github+json', ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}) });

// ── GitHub releases ────────────────────────────────────────
// `old` is the tool's previous snapshot entry: its ETag lets GitHub answer 304 (free) when nothing shipped.
async function releasesPage(tool, size, headers = {}) {
  const url = `https://api.github.com/repos/${tool.github}/releases?per_page=${size}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...ghHeaders(), ...headers }, signal: AbortSignal.timeout(30000) });
  if (!res.ok && res.status !== 304) throw Object.assign(new Error(`${res.status} ${url}`), { status: res.status });
  return { res, releases: res.status === 304 ? [] : await res.json() };
}

async function fetchGithub(tool, old) {
  // Snapshots from before cadenceAll kept only 26 weeks of dates, so refetch them once in full.
  const conditional = old?.meta?.etag && old.meta.cadenceAll ? { 'If-None-Match': old.meta.etag } : {};
  let size = RELEASES_PAGE, page;
  try { page = await releasesPage(tool, size, conditional); } catch (e) {
    // Repos with very long release notes (Codex) can make a full page time out; ask for smaller ones.
    if (e.status < 500) throw e;
    size = RELEASES_PAGE_SMALL;
    page = await releasesPage(tool, size, conditional);
  }
  const { res, releases } = page;
  const reuse = QUICK && old?.meta?.repo;
  if (res.status === 304 && !tool.npm) {
    return { items: old.items.filter((i) => i.kind === 'release'), meta: old.meta };
  }
  const etag = res.headers.get('etag');
  const repo = reuse ? null : await get(`https://api.github.com/repos/${tool.github}`, { json: true, headers: ghHeaders() });
  const meta = repo
    ? { stars: repo.stargazers_count, repo: tool.github, repoUrl: repo.html_url, license: repo.license?.spdx_id || null, etag }
    : { ...old.meta, etag };
  if (tool.npm) return fetchNpm(tool, meta);
  const stable = releases.filter((r) => !r.draft && !r.prerelease && !UNSTABLE.test(r.tag_name) && !UNSTABLE.test(r.name || '') && (!tool.tagFilter || tool.tagFilter.test(r.tag_name)));
  const { cadence, cadenceFrom } = await releaseDates(tool, releases, old, size);
  const items = stable.slice(0, MAX_PER_TOOL).map((r) => {
    const version = r.tag_name.replace(/^rust-/, '');
    const body = r.body || '';
    const html = body ? clipHtml(sanitize(marked.parse(body))) : '';
    const text = toText(html);
    const name = (r.name || '').trim();
    return {
      id: `gh:${tool.github}:${r.id}`, toolId: tool.id, kind: 'release', version,
      title: releaseTitle(tool, version, name),
      url: r.html_url, date: r.published_at, summary: excerpt(text), html, source: 'GitHub Releases',
    };
  });
  return { items, meta: { ...meta, cadence, cadenceFrom, cadenceAll: true } };
}

// Release dates behind the activity chart. Busy repos ship more than a page of releases in the
// chart's window, so full runs page further back and every run keeps earlier runs' dates.
// cadenceFrom is where known history starts when it doesn't reach the window (null = complete).
async function releaseDates(tool, releases, old, size) {
  const start = NOW - CADENCE_WINDOW;
  const dates = releases.filter((r) => !r.draft).map((r) => r.published_at);
  let complete = releases.length < size;
  // Pages aren't strictly ordered by publish date, so track the earliest date seen.
  const earliest = () => dates.reduce((a, b) => (a < b ? a : b), dates[0]);
  for (let page = 2; !complete && !QUICK && page * size <= MAX_RELEASE_DATES && Date.parse(earliest()) > start; page++) {
    const more = await get(`https://api.github.com/repos/${tool.github}/releases?per_page=${size}&page=${page}`, { json: true, headers: ghHeaders() }).catch(() => null);
    if (!more) break;
    dates.push(...more.filter((r) => !r.draft).map((r) => r.published_at));
    complete = more.length < size;
  }
  const oldest = earliest();
  const covered = complete || Date.parse(oldest) <= start;
  let from = covered ? null : oldest;
  const prev = old?.meta?.cadence || [];
  // Earlier dates only help if they overlap what we just fetched; a gap would read as quiet weeks.
  if (!covered && prev.length && prev.some((d) => d >= oldest)) {
    dates.push(...prev.filter((d) => d < oldest));
    // Snapshots from before cadenceFrom existed were capped at one page, so treat them as partial.
    const prevFrom = old.meta.cadenceFrom === undefined ? prev.reduce((a, b) => (a < b ? a : b)) : old.meta.cadenceFrom;
    from = prevFrom && (prevFrom < oldest ? prevFrom : oldest);
  }
  const cadence = [...new Set(dates)].filter((d) => Date.parse(d) >= start).sort().reverse();
  return { cadence, cadenceFrom: from && Date.parse(from) > start ? from : null };
}

// ── npm registry (for tools that publish versions without GitHub Release pages) ──
async function fetchNpm(tool, meta) {
  const doc = await get(`https://registry.npmjs.org/${tool.npm.replace('/', '%2f')}`, { json: true });
  const stable = Object.entries(doc.time)
    .filter(([v]) => /^\d+\.\d+\.\d+$/.test(v) && doc.versions[v])
    .sort((a, b) => b[1].localeCompare(a[1]));
  const items = stable.slice(0, MAX_PER_TOOL).map(([v, date]) => ({
    id: `npm:${tool.npm}@${v}`, toolId: tool.id, kind: 'release', version: `v${v}`,
    title: `${tool.name} v${v}`, url: `https://www.npmjs.com/package/${tool.npm}/v/${v}`,
    date, summary: `Published to npm as ${tool.npm}@${v}.`, html: '', source: 'npm',
  }));
  return { items, meta: { ...meta, cadence: stable.map(([, d]) => d), npm: tool.npm } };
}

// ── Homebrew casks (desktop apps without public release repos) ──
// Each "<cask> <version>" commit in homebrew-cask marks a shipped version; quick runs only check
// the cask's current version and add it (dated now) if it's new.
const caskVersion = (v) => v.split(',')[0].replace(/\.stable_\d+$/, '');
async function fetchCask(tool, old) {
  const cask = await get(`https://formulae.brew.sh/api/cask/${tool.cask}.json`, { json: true });
  const item = (v, date) => ({
    id: `cask:${tool.cask}@${v}`, toolId: tool.id, kind: 'release', version: `v${v}`,
    title: `${tool.name} v${v}`, url: tool.site, date,
    summary: `${tool.name} ${v} for macOS, published to Homebrew as the ${tool.cask} cask.`, html: '', source: 'Homebrew',
  });
  let items = (old?.items || []).filter((i) => i.kind === 'release' && i.id.startsWith('cask:'));
  // Quick runs reuse the stored history; full runs page back far enough to cover the activity chart.
  let cadence = old?.meta?.cadence || [], cadenceFrom = old?.meta?.cadenceFrom;
  if (!QUICK || !items.length || !old?.meta?.cadenceAll) {
    const path = `Casks/${tool.cask[0]}/${tool.cask}.rb`;
    const commits = [];
    let covered = false;
    for (let page = 1; page <= 5 && !covered; page++) {
      const url = `https://api.github.com/repos/Homebrew/homebrew-cask/commits?path=${path}&per_page=100&page=${page}`;
      const batch = await get(url, { json: true, headers: ghHeaders() }).catch((e) => { if (page === 1) throw e; return null; });
      if (!batch) break;
      commits.push(...batch);
      covered = batch.length < 100 || Date.parse(batch.at(-1).commit.committer.date) <= NOW - CADENCE_WINDOW;
    }
    cadence = [];
    cadenceFrom = covered ? null : commits.at(-1)?.commit.committer.date;
    const prefix = `${tool.cask} `;
    const known = new Map(items.map((i) => [i.id, i]));
    items = commits
      .map((c) => [c.commit.message.split('\n')[0], c.commit.committer.date])
      .filter(([msg]) => msg.startsWith(prefix) && /^\S+$/.test(msg.slice(prefix.length)))
      .map(([msg, date]) => item(caskVersion(msg.slice(prefix.length)), date))
      .map((i) => known.get(i.id) || i);
  }
  const current = caskVersion(cask.version);
  if (!items.some((i) => i.version === `v${current}`)) items.unshift(item(current, new Date(NOW).toISOString()));
  const seen = new Set();
  items = items.filter((i) => !seen.has(i.id) && seen.add(i.id)).sort((a, b) => b.date.localeCompare(a.date));
  cadence = [...new Set([...cadence, ...items.map((i) => i.date)])].filter((d) => Date.parse(d) >= NOW - CADENCE_WINDOW).sort().reverse();
  return { items: items.slice(0, MAX_PER_TOOL), meta: { ...(old?.meta || {}), cask: tool.cask, cadence, cadenceFrom, cadenceAll: true } };
}

// ── RSS / Atom feeds ───────────────────────────────────────
const feedCache = new Map();
function fetchFeed(url) {
  if (!feedCache.has(url)) feedCache.set(url, get(url).then((xml) => parseFeed(xml)));
  return feedCache.get(url);
}

function parseFeed(xml) {
  const doc = parser.parse(xml);
  if (doc.rss) {
    const items = [].concat(doc.rss.channel?.item || []);
    return items.map((it) => ({
      title: toText(str(it.title)),
      url: str(it.link) || str(it.guid),
      date: it.pubDate || it['dc:date'],
      content: str(it['content:encoded']) || str(it.description),
      categories: [].concat(it.category || []).map(str),
    }));
  }
  if (doc.feed) {
    const entries = [].concat(doc.feed.entry || []);
    return entries.map((e) => {
      const links = [].concat(e.link || []);
      const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') || links[0];
      return {
        title: toText(str(e.title)),
        url: alt?.['@href'] || str(e.id),
        date: e.updated || e.published,
        content: str(e.content) || str(e.summary),
        categories: [].concat(e.category || []).map((c) => c['@term'] || str(c)),
      };
    });
  }
  throw new Error('Unknown feed format');
}

// For official blogs without RSS: `scrape` is a regex with named groups url, title, date
// run over the blog's index page; each post's meta description becomes its summary.
async function scrapeIndex(f) {
  const html = await get(f.url);
  const posts = [...html.matchAll(f.scrape)].slice(0, 15).map(({ groups: g }) => ({
    title: toText(g.title), url: new URL(g.url, f.url).href, date: g.date, categories: [],
  }));
  await Promise.all(posts.map(async (p) => {
    const page = await get(p.url).catch(() => '');
    const desc = page.match(/<meta (?:name|property)="(?:og:)?description" content="([^"]*)"/)?.[1] || '';
    p.content = desc.replace(/\.$/, '') === p.title ? '' : desc;
  }));
  return posts;
}

async function fetchFeeds(tool) {
  const out = [];
  for (const f of tool.feeds || []) {
    const entries = f.scrape ? await scrapeIndex(f) : await fetchFeed(f.url);
    for (const e of entries) {
      if (f.filter && !f.filter.test(`${e.title} ${e.categories.join(' ')} ${e.url}`)) continue;
      if (f.exclude?.test(e.title)) continue;
      const d = new Date(e.date);
      if (Number.isNaN(+d) || +d > NOW + 6 * 3600e3) continue; // skip undated or future-dated (scheduled) posts
      const html = e.content ? clipHtml(sanitize(e.content)) : '';
      const kind = f.kind;
      out.push({
        id: `feed:${e.url}`, toolId: tool.id, kind, title: e.title, url: e.url,
        date: d.toISOString(), summary: excerpt(toText(e.content)), html: kind === 'changelog' ? html : '',
        source: new URL(f.url).hostname.replace(/^www\./, ''),
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_PER_TOOL);
}

// ── Hacker News discussion ────────────────────────────────
async function fetchHN(allTools) {
  const since = Math.floor((NOW - 60 * DAY) / 1000);
  const seen = new Map();
  await Promise.all(HN_QUERIES.map(async (q) => {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=40&numericFilters=created_at_i>${since},points>15`;
    const { hits } = await get(url, { json: true });
    for (const h of hits) if (h.title && !seen.has(h.objectID)) seen.set(h.objectID, h);
  }));
  const items = [];
  for (const h of seen.values()) {
    const toolIds = allTools.filter((t) => (HN_MATCH[t.id] || t.hnMatch)?.test(h.title)).map((t) => t.id);
    if (!toolIds.length) continue;
    items.push({
      id: `hn:${h.objectID}`, toolId: toolIds[0], toolIds, kind: 'discussion', title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
      date: new Date(h.created_at_i * 1000).toISOString(),
      summary: '', points: h.points, comments: h.num_comments || 0, source: 'Hacker News',
    });
  }
  return items.sort((a, b) => b.points - a.points).slice(0, 150);
}

// ── Trending discovery ─────────────────────────────────────
// Finds trending repos in the niche, keeps those that shipped a stable release recently, and
// tracks a daily star history per tool so "trending" means real star velocity, not just size.
const discoveredItems = new Map();
// HN titles must name the tool *and* sound like coding news, since discovered names can be common words.
function hnPattern(name) {
  if (name.length < 5 || /\s/.test(name)) return null;
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ctx = '(agent|cod(e|ing)|cli|ide|llm|ai)';
  return new RegExp(`\\b${n}\\b.*\\b${ctx}\\b|\\b${ctx}\\b.*\\b${n}\\b`, 'i');
}

function starVelocity(history) {
  const recent = history.filter(([d]) => NOW - Date.parse(d) <= 8 * DAY);
  if (recent.length < 2) return null;
  const [d0, s0] = recent[0], [d1, s1] = recent[recent.length - 1];
  const days = (Date.parse(d1) - Date.parse(d0)) / DAY;
  return days >= 1 ? Math.round(((s1 - s0) / days) * 7) : null;
}

async function discover(prev, report) {
  if (QUICK) return prev.discovered || [];
  const prevById = new Map((prev.discovered || []).map((d) => [d.id, d]));
  let candidates;
  try { candidates = await searchCandidates(get, ghHeaders); } catch (e) {
    report.push(`⚠ Discovery: ${e.message} (kept previous list)`);
    return prev.discovered || [];
  }
  const today = new Date(NOW).toISOString().slice(0, 10);
  const qualified = [];
  await Promise.all(candidates.map(async (r) => {
    const tool = toTool(r);
    try {
      const { items, meta } = await fetchGithub(tool, prev.tools?.[tool.id]);
      const latest = items[0];
      if (!latest || NOW - Date.parse(latest.date) > DISCOVERY.maxReleaseAgeDays * DAY) return;
      const old = prevById.get(tool.id);
      const stars = [...(old?.stars || []).filter(([d]) => d !== today && NOW - Date.parse(d) < 31 * DAY), [today, r.stargazers_count]];
      const ageDays = Math.max(30, (NOW - Date.parse(r.created_at)) / DAY);
      const velocity = starVelocity(stars);
      qualified.push({
        ...tool, firstSeen: old?.firstSeen || new Date(NOW).toISOString(), lastQualified: new Date(NOW).toISOString(),
        stars, starsPerWeek: velocity, score: velocity ?? Math.round((r.stargazers_count / ageDays) * 7),
      });
      discoveredItems.set(tool.id, { items, meta, errors: [] });
    } catch {}
  }));
  // Keep recently-qualified tools for a while so pages don't flicker in and out.
  const ids = new Set(qualified.map((q) => q.id));
  // Only tools that still pass the niche filter are kept (a deny-list entry removes one at once).
  const stillCandidates = new Set(candidates.map((r) => toTool(r).id));
  const kept = [...prevById.values()].filter((d) => !ids.has(d.id) && stillCandidates.has(d.id) && NOW - Date.parse(d.lastQualified) < DISCOVERY.keepDays * DAY);
  const out = [...qualified.sort((a, b) => b.score - a.score), ...kept];
  report.push(`✓ Discovery              ${qualified.length} trending tools qualified (${candidates.length} candidates, ${kept.length} kept)`);
  return out;
}

// ── Orchestrate ────────────────────────────────────────────
async function main() {
  let prev = { tools: {}, discussions: [] };
  try { prev = JSON.parse(await readFile(SNAPSHOT, 'utf8')); } catch {}

  const report = [];
  const tools = {};
  const discovered = await discover(prev, report);
  const allTools = [...TOOLS, ...discovered.map((d) => ({ ...d, hnMatch: hnPattern(d.name) }))];
  await Promise.all(allTools.map(async (tool) => {
    if (tool.discovered && discoveredItems.has(tool.id)) { // already fetched while qualifying it
      tools[tool.id] = discoveredItems.get(tool.id);
      report.push(`✓ ${('↗ ' + tool.name).padEnd(22)} ${String(tools[tool.id].items.length).padStart(3)} items`);
      return;
    }
    const entry = { items: [], meta: {}, errors: [] };
    if (tool.github) {
      try {
        const { items, meta } = await fetchGithub(tool, prev.tools?.[tool.id]);
        entry.items.push(...items); entry.meta = meta;
      } catch (e) {
        entry.errors.push(`github: ${e.message}`);
        const old = prev.tools?.[tool.id];
        if (old) { entry.items.push(...old.items.filter((i) => i.kind === 'release')); entry.meta = old.meta || {}; }
      }
    }
    if (tool.cask) {
      try {
        const { items, meta } = await fetchCask(tool, prev.tools?.[tool.id]);
        entry.items.push(...items); entry.meta = meta;
      } catch (e) {
        entry.errors.push(`cask: ${e.message}`);
        const old = prev.tools?.[tool.id];
        if (old) { entry.items.push(...old.items.filter((i) => i.kind === 'release')); entry.meta = old.meta || {}; }
      }
    }
    if (tool.feeds) {
      try { entry.items.push(...await fetchFeeds(tool)); } catch (e) {
        entry.errors.push(`feed: ${e.message}`);
        const old = prev.tools?.[tool.id];
        if (old) entry.items.push(...old.items.filter((i) => i.kind !== 'release'));
      }
    }
    const seen = new Set();
    entry.items = entry.items.filter((i) => !seen.has(i.id) && seen.add(i.id)).sort((a, b) => b.date.localeCompare(a.date));
    tools[tool.id] = entry;
    report.push(`${entry.errors.length ? '⚠' : '✓'} ${tool.name.padEnd(22)} ${String(entry.items.length).padStart(3)} items ${entry.errors.join('; ')}`);
  }));

  let discussions = [];
  try { discussions = await fetchHN(allTools); report.push(`✓ Hacker News            ${discussions.length} stories`); } catch (e) {
    discussions = prev.discussions || []; report.push(`⚠ Hacker News: ${e.message}`);
  }

  // New models from the major labs (one request, so quick runs check it too).
  let models = prev.models || [];
  try { models = await fetchModels(get, NOW); report.push(`✓ Models                 ${models.length} models from ${new Set(models.map((m) => m.lab)).size} labs`); } catch (e) {
    report.push(`⚠ Models: ${e.message} (kept ${models.length} previous)`);
  }

  // Who serves each model and at what price (one request per model): full runs, or when the last pass is over 6 hours old.
  const prevProviders = Object.fromEntries((prev.models || []).filter((m) => m.providers).map((m) => [m.id, m.providers]));
  const providersAt = prev.providersAt || null;
  let providersFresh = providersAt;
  if (!QUICK || !providersAt || NOW - Date.parse(providersAt) > DAY / 4) {
    const { providers, failed } = await fetchProviders(get, models, prevProviders);
    models = models.map((m) => (providers[m.id] ? { ...m, providers: providers[m.id] } : m));
    providersFresh = new Date(NOW).toISOString();
    const n = Object.values(providers).reduce((s, l) => s + l.length, 0);
    report.push(`${failed ? '⚠' : '✓'} Model providers        ${n} endpoints across ${Object.keys(providers).length} models${failed ? ` (${failed} failed)` : ''}`);
  } else {
    models = models.map((m) => (prevProviders[m.id] ? { ...m, providers: prevProviders[m.id] } : m));
  }

  // Benchmark scores (Epoch AI, ~2 MB zip): full runs only, or when the last copy is over a day old.
  let benchmarks = prev.benchmarks || null;
  if (!QUICK || !benchmarks || NOW - Date.parse(benchmarks.fetchedAt) > DAY) {
    try {
      const { scores, missing } = await fetchBenchmarks();
      benchmarks = { fetchedAt: new Date(NOW).toISOString(), scores };
      report.push(`${missing.length ? '⚠' : '✓'} Benchmarks             ${Object.keys(scores).length} models scored${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
    } catch (e) { report.push(`⚠ Benchmarks: ${e.message} (kept previous)`); }
  }

  // Artificial Analysis (speed + intelligence indexes): only with a key, at most once a day (free tier is rate-limited).
  let aa = prev.aa || null;
  const AA_KEY = (process.env.AA_API_KEY || '').trim();
  if (AA_KEY && (!aa || NOW - Date.parse(aa.fetchedAt) > DAY)) {
    try {
      const list = await fetchAA(AA_KEY);
      aa = { fetchedAt: new Date(NOW).toISOString(), models: list };
      report.push(`✓ Artificial Analysis    ${list.length} models`);
    } catch (e) { report.push(`⚠ Artificial Analysis: ${e.message} (kept previous)`); }
  }

  // OpenCode usage data (one small request; the source re-aggregates hourly).
  let opencode = prev.opencode || null;
  try {
    opencode = await fetchOpenCode(get);
    report.push(`✓ OpenCode Data          ${opencode.leaderboard.pastWeek.length} models, updated ${opencode.updatedAt}`);
  } catch (e) { report.push(`⚠ OpenCode Data: ${e.message} (kept previous)`); }

  // Agent Skills and MCP servers (GitHub search + the official MCP Registry): full runs only, or when over 6 hours old.
  let ecosystem = prev.ecosystem || null;
  if (!QUICK || !ecosystem || NOW - Date.parse(ecosystem.fetchedAt) > DAY / 4) {
    ecosystem = { ...await fetchEcosystem({ get, ghHeaders, prev: ecosystem || {}, now: NOW, report }), fetchedAt: new Date(NOW).toISOString() };
  }

  // X: every tool's own account (found automatically, like the tools themselves) plus the AI labs.
  // Read on full runs only (keeps requests to X low); quick runs reuse the last batch.
  let x = { posts: [], userIds: {}, ...prev.x };
  const handles = await resolveHandles(allTools, prev.x?.handles, { get, ghHeaders, now: NOW, refresh: !QUICK });
  x.handles = handles;
  const byHandle = toolsByHandle(handles);
  if (!QUICK) {
    const accounts = [...LAB_ACCOUNTS, ...Object.values(handles).map((h) => h.handle).filter(Boolean)];
    report.push(`✓ X accounts             ${new Set(accounts.map((a) => a.toLowerCase())).size} (${Object.values(handles).filter((h) => h.handle).length}/${allTools.length} tools have one)`);
    try { x = { ...await fetchX(accounts, prev.x, NOW), handles }; report.push(`✓ X                      ${x.added} new posts via ${x.via}, ${x.posts.length} kept`); } catch (e) {
      report.push(`⚠ X: ${e.message} (kept ${x.posts.length} previous posts)`);
    }
  }
  const extra = [];
  await Promise.all(NEWS_FEEDS.map(async (f) => {
    try {
      for (const e of await fetchFeed(f.url)) {
        const text = toText(e.content);
        if (!f.relevant.test(`${e.title} ${text.slice(0, 300)}`) || Number.isNaN(Date.parse(e.date))) continue;
        extra.push({ title: e.title, url: e.url, date: new Date(e.date).toISOString(), summary: excerpt(text), source: new URL(f.url).hostname.replace(/^www\./, '') });
      }
    } catch (e) { report.push(`⚠ News feed ${f.url}: ${e.message}`); }
  }));
  const matchTools = (text) => allTools.filter((t) => (HN_MATCH[t.id] || t.hnMatch)?.test(text)).map((t) => t.id);
  const news = pickNews({ items: Object.values(tools).flatMap((e) => e.items), extra, discussions, posts: x.posts, matchTools,
    handleTools: (h) => {
      const ids = byHandle.get(h.toLowerCase()) || [];
      return { toolIds: ids, broad: ids.some((id) => !handles[id].own) };
    },
  }, NOW);
  report.push(`✓ News                   ${news.length} important stories (${news.filter((n) => n.major).length} major)`);

  // Did anything actually ship? (Ignores HN vote counts, which move constantly.)
  const fingerprint = (t) => Object.values(t || {}).flatMap((e) => e.items.map((i) => `${i.id}|${i.version || ''}|${i.title}`)).sort().join('\n');
  const ids = (list) => (list || []).map((d) => d.id).sort().join();
  const changed = fingerprint(tools) !== fingerprint(prev.tools) || ids(discovered) !== ids(prev.discovered) || ids(news) !== ids(prev.news) || ids(models) !== ids(prev.models) || ids(ecosystem?.skills) !== ids(prev.ecosystem?.skills) || ids(ecosystem?.mcp) !== ids(prev.ecosystem?.mcp) || providersFresh !== providersAt;
  const newIds = new Set(Object.values(prev.tools || {}).flatMap((e) => e.items.map((i) => i.id)));
  const oldModels = new Set((prev.models || []).map((m) => m.id));
  const fresh = [...Object.values(tools).flatMap((e) => e.items).filter((i) => !newIds.has(i.id)), ...(prev.models ? models.filter((m) => !oldModels.has(m.id)).map((m) => ({ title: `New model: ${m.name}` })) : [])];
  report.push(`${changed ? '★' : '·'} ${changed ? `${fresh.length} new item(s): ${fresh.slice(0, 8).map((i) => i.title).join(' · ')}` : 'No new updates'}`);
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: 'a' });
  if (QUICK && !changed) { console.log(report.sort().join('\n')); return; } // nothing new: leave the snapshot untouched

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(SNAPSHOT, JSON.stringify({ generatedAt: new Date(NOW).toISOString(), providersAt: providersFresh, tools, discovered, discussions, news: await newsImages(news, prev.news), models, benchmarks, aa, opencode, ecosystem, x }, null, 1));
  console.log(report.sort().join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
