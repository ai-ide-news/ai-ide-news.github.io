// Fetches real release + news data for every tool and writes data/snapshot.json.
// Each source fails independently; a failed source falls back to the previous snapshot.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { TOOLS, HN_MATCH, HN_QUERIES } from './sources.mjs';

const SNAPSHOT = new URL('../data/snapshot.json', import.meta.url);
const UA = 'Mozilla/5.0 (compatible; AI-IDE-News/1.0; +https://ai-ide-news.github.io)';
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DAY = 86400e3;
const NOW = Date.now();
const MAX_PER_TOOL = 40;
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
async function fetchGithub(tool) {
  const [releases, repo] = await Promise.all([
    get(`https://api.github.com/repos/${tool.github}/releases?per_page=60`, { json: true, headers: ghHeaders() }),
    get(`https://api.github.com/repos/${tool.github}`, { json: true, headers: ghHeaders() }),
  ]);
  const meta = { stars: repo.stargazers_count, repo: tool.github, repoUrl: repo.html_url, license: repo.license?.spdx_id || null };
  if (tool.npm) return fetchNpm(tool, meta);
  const stable = releases.filter((r) => !r.draft && !r.prerelease && !UNSTABLE.test(r.tag_name) && !UNSTABLE.test(r.name || '') && (!tool.tagFilter || tool.tagFilter.test(r.tag_name)));
  const cadence = releases.filter((r) => !r.draft).map((r) => r.published_at);
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
  return { items, meta: { ...meta, cadence } };
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
async function fetchHN() {
  const since = Math.floor((NOW - 60 * DAY) / 1000);
  const seen = new Map();
  await Promise.all(HN_QUERIES.map(async (q) => {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=40&numericFilters=created_at_i>${since},points>15`;
    const { hits } = await get(url, { json: true });
    for (const h of hits) if (h.title && !seen.has(h.objectID)) seen.set(h.objectID, h);
  }));
  const items = [];
  for (const h of seen.values()) {
    const toolIds = TOOLS.filter((t) => HN_MATCH[t.id]?.test(h.title)).map((t) => t.id);
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

// ── Orchestrate ────────────────────────────────────────────
async function main() {
  let prev = { tools: {}, discussions: [] };
  try { prev = JSON.parse(await readFile(SNAPSHOT, 'utf8')); } catch {}

  const report = [];
  const tools = {};
  await Promise.all(TOOLS.map(async (tool) => {
    const entry = { items: [], meta: {}, errors: [] };
    if (tool.github) {
      try {
        const { items, meta } = await fetchGithub(tool);
        entry.items.push(...items); entry.meta = meta;
      } catch (e) {
        entry.errors.push(`github: ${e.message}`);
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
  try { discussions = await fetchHN(); report.push(`✓ Hacker News            ${discussions.length} stories`); } catch (e) {
    discussions = prev.discussions || []; report.push(`⚠ Hacker News: ${e.message}`);
  }

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(SNAPSHOT, JSON.stringify({ generatedAt: new Date(NOW).toISOString(), tools, discussions }, null, 1));
  console.log(report.sort().join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
