// Feed proxy for the "My feed" page (src/myfeed.js). The site is static, so browsers can't read
// most feeds directly (no CORS headers). This Worker takes whatever the user typed — a feed URL,
// a website, a YouTube channel, a subreddit, a Bluesky or Mastodon profile, an Instagram or X
// handle — resolves it to a feed, and returns a small normalized JSON:
//   GET /feed?url=<input>  →  { source: { title, url, home, kind }, items: [{ id, title, url, date, summary, image }] }
// Responses are cached at the edge for CACHE_TTL seconds.
import { XMLParser } from 'fast-xml-parser';

const CACHE_TTL = 900;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_ITEMS = 40;
const UA = 'Mozilla/5.0 (compatible; aiticker-feeds/1.0; +https://ai-ide-news.github.io/my-feed/)';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', processEntities: true, htmlEntities: true });

class UserError extends Error {}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://ai-ide-news.github.io').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes('*') || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = { 'access-control-allow-origin': okOrigin ? origin || '*' : allowed[0], 'access-control-allow-methods': 'GET, OPTIONS', vary: 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-max-age': '86400' } });
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.pathname !== '/feed') return json({ error: 'Not found' }, 404, cors);
    if (origin && !okOrigin) return json({ error: 'Origin not allowed' }, 403, cors);

    const input = (url.searchParams.get('url') || '').trim();
    if (!input || input.length > 500) return json({ error: 'Pass ?url= with a feed, site or profile.' }, 400, cors);

    const cache = caches.default;
    const key = new Request(`https://feed-cache.internal/v1?u=${encodeURIComponent(input)}`);
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...cors } });

    try {
      const out = await load(input, env);
      const res = json(out, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
      ctx.waitUntil(cache.put(key, res.clone()));
      return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...cors } });
    } catch (e) {
      return json({ error: e instanceof UserError ? e.message : `Couldn't read that source (${e.message}).` }, e instanceof UserError ? 422 : 502, cors);
    }
  },
};

const json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

// ── resolve what the user typed into a feed URL ──────────
async function resolve(input, env) {
  let s = input.replace(/^@(?=[^@]+$)/, '');
  // Mastodon: @user@host
  const masto = s.match(/^@?([\w.]+)@([\w-]+(\.[\w-]+)+)$/);
  if (masto) return { feed: `https://${masto[2]}/@${masto[1]}.rss`, kind: 'mastodon' };
  // Short forms: r/sub, ig:user, x:user, yt:@handle
  let m;
  if ((m = s.match(/^\/?r\/([\w]+)$/i))) return { feed: `https://www.reddit.com/r/${m[1]}/.rss`, kind: 'reddit' };
  if ((m = s.match(/^(ig|instagram):@?([\w.]+)$/i))) return bridge(env.INSTAGRAM_BRIDGE, m[2], 'instagram', 'Instagram');
  if ((m = s.match(/^(x|twitter):@?(\w+)$/i))) return bridge(env.X_BRIDGE, m[2], 'x', 'X');
  if ((m = s.match(/^yt:(.+)$/i))) s = `https://www.youtube.com/${m[1].startsWith('@') ? m[1] : `@${m[1]}`}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  let u;
  try { u = new URL(s); } catch { throw new UserError('That doesn\'t look like a link or a handle.'); }
  if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) throw new UserError('Only public http(s) links are supported.');
  const host = u.hostname.replace(/^(www|m|mobile)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'instagram.com' && parts[0] && !['p', 'reel', 'explore'].includes(parts[0])) return bridge(env.INSTAGRAM_BRIDGE, parts[0], 'instagram', 'Instagram');
  if ((host === 'x.com' || host === 'twitter.com') && parts[0]) return bridge(env.X_BRIDGE, parts[0], 'x', 'X');
  if (host === 'reddit.com' && parts[0] === 'r' && parts[1]) return { feed: `https://www.reddit.com/r/${parts[1]}/.rss`, kind: 'reddit' };
  if (host === 'reddit.com' && (parts[0] === 'u' || parts[0] === 'user') && parts[1]) return { feed: `https://www.reddit.com/user/${parts[1]}/.rss`, kind: 'reddit' };
  if (host === 'bsky.app' && parts[0] === 'profile' && parts[1]) return { feed: `https://bsky.app/profile/${parts[1]}/rss`, kind: 'bluesky' };
  if (host === 'youtube.com' || host === 'youtu.be') {
    if (u.pathname === '/feeds/videos.xml') return { feed: u.href, kind: 'youtube' };
    if (u.searchParams.get('list')) return { feed: `https://www.youtube.com/feeds/videos.xml?playlist_id=${u.searchParams.get('list')}`, kind: 'youtube' };
    if (parts[0] === 'channel' && parts[1]) return { feed: `https://www.youtube.com/feeds/videos.xml?channel_id=${parts[1]}`, kind: 'youtube' };
    const page = await get(u.href);
    const id = page.text.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/)?.[1] || page.text.match(/channel\/(UC[\w-]{22})/)?.[1];
    if (!id) throw new UserError('Couldn\'t find that YouTube channel.');
    return { feed: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, kind: 'youtube' };
  }
  // Mastodon-style profile URL: https://host/@user
  if (parts.length === 1 && /^@\w+$/.test(parts[0]) && !u.search) return { feed: `${u.origin}/${parts[0]}.rss`, kind: 'mastodon', soft: true, page: u.href };
  return { feed: u.href, kind: 'web' };
}

// Instagram and X have no public feeds; a bridge (RSSHub, RSS.app, rss-bridge…) turns a profile into one.
// The template is set on the Worker, e.g. INSTAGRAM_BRIDGE="https://rsshub.example.com/instagram/user/{user}".
function bridge(template, user, kind, label) {
  if (!template) throw new UserError(`${label} has no public feed. Paste an RSS link for this profile from a bridge like rss.app or RSSHub instead.`);
  return { feed: template.replace('{user}', encodeURIComponent(user)), kind, home: kind === 'instagram' ? `https://www.instagram.com/${user}/` : `https://x.com/${user}`, name: `@${user}` };
}

function isPrivateHost(h) {
  return /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i.test(h);
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml, text/html;q=0.8, */*;q=0.5' }, redirect: 'follow', cf: { cacheTtl: CACHE_TTL } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (+res.headers.get('content-length') > MAX_BYTES) throw new UserError('That feed is too large.');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new UserError('That feed is too large.');
  return { text, type: res.headers.get('content-type') || '', url: res.url || url };
}

// ── load + normalize ─────────────────────────────────────
async function load(input, env) {
  const r = await resolve(input, env);
  let page;
  try { page = await get(r.feed); } catch (e) {
    if (!r.soft) throw e;
    page = await get(r.page); r.kind = 'web';
  }
  let feed = parse(page);
  if (!feed) {
    // A web page: follow its <link rel="alternate"> feed.
    const link = discover(page.text, page.url);
    if (!link) throw new UserError('No feed found at that address. Try the site\'s RSS link.');
    page = await get(link);
    feed = parse(page);
    if (!feed) throw new UserError('That page links to a feed we can\'t read.');
  }
  const host = (() => { try { return new URL(feed.home || page.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return {
    source: { title: r.name && r.kind !== 'web' ? `${r.name}` : feed.title || host, feedTitle: feed.title || '', url: page.url, home: r.home || feed.home || page.url, kind: r.kind },
    items: feed.items.filter((i) => i.title || i.summary).slice(0, MAX_ITEMS),
  };
}

function discover(html, base) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom|feed)\+(xml|json)/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) try { return new URL(href.replace(/&amp;/g, '&'), base).href; } catch {}
  }
  return null;
}

const str = (v) => (v == null ? '' : typeof v === 'object' ? str(v['#text'] ?? v['@href'] ?? '') : String(v));
const text = (html, n = 280) => {
  const t = str(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const firstImg = (html) => str(html).match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&') || '';
const iso = (d) => { const t = Date.parse(str(d)); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const https = (u) => (/^https?:\/\//.test(u) ? u : '');

function parse({ text: body, type }) {
  const head = body.trimStart().slice(0, 1).toString();
  if (/json/.test(type) || head === '{') {
    try {
      const j = JSON.parse(body);
      if (!Array.isArray(j.items)) return null;
      return {
        title: j.title || '', home: j.home_page_url || '',
        items: j.items.map((it) => ({
          id: String(it.id ?? it.url ?? ''), title: text(it.title, 200), url: https(it.url || it.external_url || ''), date: iso(it.date_published || it.date_modified),
          summary: text(it.summary || it.content_text || it.content_html), image: https(it.image || it.banner_image || firstImg(it.content_html)),
        })),
      };
    } catch { return null; }
  }
  if (head !== '<' || /^<!doctype html|^<html/i.test(body.trimStart().slice(0, 20))) return null;
  let doc;
  try { doc = parser.parse(body); } catch { return null; }
  const ch = doc.rss?.channel || doc['rdf:RDF'];
  if (ch) {
    const items = [].concat(ch.item || doc['rdf:RDF']?.item || []);
    return {
      title: text(ch.title, 120), home: str([].concat(ch.link || [])[0]),
      items: items.map((it) => {
        const html = str(it['content:encoded']) || str(it.description);
        const media = [].concat(it['media:content'] || [], it['media:thumbnail'] || [], it['media:group']?.['media:content'] || []).find((x) => x?.['@url']);
        const enc = [].concat(it.enclosure || []).find((x) => /^image\//.test(x?.['@type'] || ''));
        return {
          id: str(it.guid) || str(it.link), title: text(it.title, 200), url: https(str(it.link) || str(it.guid)), date: iso(it.pubDate || it['dc:date']),
          summary: text(html), image: https(media?.['@url'] || enc?.['@url'] || firstImg(html)),
        };
      }),
    };
  }
  if (doc.feed) {
    const f = doc.feed;
    const alt = (links) => { const l = [].concat(links || []); return (l.find((x) => !x['@rel'] || x['@rel'] === 'alternate') || l[0])?.['@href'] || ''; };
    return {
      title: text(f.title, 120), home: alt(f.link),
      items: [].concat(f.entry || []).map((e) => {
        const html = str(e.content) || str(e.summary) || str(e['media:group']?.['media:description']);
        const thumb = e['media:group']?.['media:thumbnail']?.['@url'];
        return { id: str(e.id), title: text(e.title, 200), url: https(alt(e.link) || str(e.id)), date: iso(e.published || e.updated), summary: text(html), image: https(thumb || firstImg(html)) };
      }),
    };
  }
  return null;
}
