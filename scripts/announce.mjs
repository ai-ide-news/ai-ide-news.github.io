// Announces new releases on Bluesky, Telegram and Discord, and pings IndexNow with the pages that changed.
//
//   node scripts/announce.mjs plan   — after fetch: picks what's new since the last run (tracked in
//                                      data/announced.json, committed with the snapshot) → .announce/plan.json
//   node scripts/announce.mjs send   — after deploy (so links are live): posts the plan + pings IndexNow
//
// Every channel is optional and skipped when its secret is missing:
//   BLUESKY_HANDLE + BLUESKY_APP_PASSWORD, TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, DISCORD_WEBHOOK_URL, INDEXNOW_KEY
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { TOOLS } from './sources.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://aiticker.site').replace(/\/$/, '');
const SNAPSHOT = new URL('../data/snapshot.json', import.meta.url);
const ANNOUNCED = new URL('../data/announced.json', import.meta.url);
const PLAN = new URL('../.announce/plan.json', import.meta.url);
const MAX_AGE = 48 * 3600e3;   // never announce anything older (e.g. a newly discovered tool's back catalog)
const MAX_POSTS = 5;           // per run; the rest go into one "also shipped" roundup
const KEEP_IDS = 3000;
// Prereleases, nightlies and monorepo sub-packages (`@scope/pkg@1.2.3`) are tracked on the site but not announced.
const NOISE = /(^|[-.+_\s])(alpha|beta|rc\d*|nightly|canary|preview|next|dev|snapshot|insiders?)([-.+_\d\s]|$)|^@?[\w.-]+\/[\w.-]+@|.@\d/i;

const BOILERPLATE = /^(published to npm as|no notable changes|see (the )?(full )?changelog|full changelog)/i;
const CURATED = new Set(TOOLS.map((t) => t.id));

const readJson =async (url, fallback) => { try { return JSON.parse(await readFile(url, 'utf8')); } catch { return fallback; } };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function plan() {
  const snap = await readJson(SNAPSHOT, null);
  if (!snap) throw new Error('no data/snapshot.json');
  const items = Object.values(snap.tools || {}).flatMap((e) => e.items);
  const prev = await readJson(ANNOUNCED, null);
  // A queued run may start from an older checkout: also honour what the latest main already announced.
  let remote = [];
  try { remote = JSON.parse(execFileSync('git', ['show', 'FETCH_HEAD:data/announced.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).ids; } catch {}
  const seen = new Set([...(prev?.ids || []), ...remote]);
  const now = Date.now();
  const fresh = prev ? items.filter((i) => !seen.has(i.id) && now - Date.parse(i.date) < MAX_AGE) : []; // first run: seed only

  const names = new Map([...TOOLS, ...(snap.discovered || [])].map((t) => [t.id, t.name]));
  const byTool = new Map();
  for (const i of fresh.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
    if (!byTool.has(i.toolId)) byTool.set(i.toolId, []);
    byTool.get(i.toolId).push(i);
  }
  const entries = [];
  for (const [toolId, list] of byTool) {
    const pick = list.find((i) => i.kind !== 'release' || !NOISE.test(i.version || i.title));
    if (!pick) continue;
    const name = names.get(toolId) || toolId;
    const ver = (pick.version || '').replace(/^v(?=\d)/, '');
    const headline = pick.kind === 'release'
      ? `${name} ${ver ? `${/^\d/.test(ver) ? 'v' : ''}${ver}` : ''} is out`.replace(/\s+/g, ' ')
      : `${name}: ${pick.title}`;
    const summary = (pick.summary || '').replace(/\s+/g, ' ').trim();
    entries.push({ toolId, name, headline, kind: pick.kind, summary: BOILERPLATE.test(summary) ? '' : summary,
      url: `${SITE_URL}/tools/${toolId}/`, source: pick.url, date: pick.date });
  }
  // Best first: curated tools over auto-discovered ones, then posts with real release notes.
  const rank = (e) => (CURATED.has(e.toolId) ? 2 : 0) + (e.summary ? 1 : 0);
  entries.sort((a, b) => rank(b) - rank(a) || Date.parse(b.date) - Date.parse(a.date));
  const urls = byTool.size ? [`${SITE_URL}/`, `${SITE_URL}/news/`, `${SITE_URL}/tools/`, ...[...byTool.keys()].map((id) => `${SITE_URL}/tools/${id}/`)] : [];

  const ids = [...new Set([...items.map((i) => i.id), ...seen])].slice(0, KEEP_IDS);
  await writeFile(ANNOUNCED, JSON.stringify({ updatedAt: new Date(now).toISOString(), ids }, null, 0) + '\n');
  await mkdir(new URL('../.announce/', import.meta.url), { recursive: true });
  await writeFile(PLAN, JSON.stringify({ posts: entries.slice(0, MAX_POSTS), roundup: entries.slice(MAX_POSTS), urls }, null, 1));
  console.log(prev ? `${fresh.length} new item(s) → ${entries.length} announcement(s), ${urls.length} URL(s) for IndexNow` : `Seeded ${ids.length} ids (first run, nothing announced)`);
  for (const e of entries) console.log(`  · ${e.headline}`);
}

// ── Channels ───────────────────────────────────────────────

async function http(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

const graphemes = (s) => [...new Intl.Segmenter().segment(s)].length;

function bskyText(e) {
  const tail = `\n\n${e.url}`;
  let summary = e.summary;
  let text = `${e.headline}${summary ? `\n\n${summary}` : ''}${tail}`;
  while (graphemes(text) > 300 && summary) {   // Bluesky's limit; trim the summary, never the link
    summary = clip(summary, Math.max(0, summary.length - Math.max(10, graphemes(text) - 300)));
    if (summary.length < 20) summary = '';
    text = `${e.headline}${summary ? `\n\n${summary}` : ''}${tail}`;
  }
  return text;
}

async function bluesky(posts, roundup) {
  const { BLUESKY_HANDLE: id, BLUESKY_APP_PASSWORD: pw } = process.env;
  if (!id || !pw) return 'skipped (no BLUESKY_HANDLE / BLUESKY_APP_PASSWORD)';
  const pds = 'https://bsky.social/xrpc';
  const s = await http(`${pds}/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) });
  const auth = { authorization: `Bearer ${s.accessJwt}` };
  const all = [...posts, ...(roundup.length ? [{ headline: 'Also shipped', summary: roundup.map((e) => e.headline.replace(/ is out$/, '')).join(' · '), url: `${SITE_URL}/`, name: 'aiticker' }] : [])];
  for (const e of all) {
    const text = bskyText(e);
    const enc = new TextEncoder();
    const at = text.lastIndexOf(e.url);
    const facets = [{ index: { byteStart: enc.encode(text.slice(0, at)).length, byteEnd: enc.encode(text.slice(0, at + e.url.length)).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: e.url }] }];
    const external = { uri: e.url, title: e.toolId ? `${e.name} — releases & changelog | aiticker` : 'aiticker — AI IDE & CLI news', description: clip(e.summary || e.headline, 200) };
    try {
      const img = await fetch(e.toolId ? `${SITE_URL}/og/tools-${e.toolId}.png` : `${SITE_URL}/og.png`,{ signal: AbortSignal.timeout(15000) });
      if (img.ok) {
        const blob = await http(`${pds}/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { ...auth, 'content-type': 'image/png' }, body: Buffer.from(await img.arrayBuffer()) });
        external.thumb = blob.blob;
      }
    } catch {}
    await http(`${pds}/com.atproto.repo.createRecord`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({
      repo: s.did, collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, facets, langs: ['en'], createdAt: new Date().toISOString(), embed: { $type: 'app.bsky.embed.external', external } },
    }) });
  }
  return `${all.length} post(s)`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function telegram(posts, roundup) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return 'skipped (no TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)';
  const send = (text, url) => http(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', link_preview_options: url ? { url, prefer_large_media: true } : { is_disabled: true } }) });
  for (const e of posts) await send(`🚀 <b>${esc(e.headline)}</b>${e.summary ? `\n\n${esc(clip(e.summary, 500))}` : ''}\n\n<a href="${e.url}">Changelog on aiticker</a> · <a href="${esc(e.source)}">Source</a>`, e.url);
  if (roundup.length) await send(`📦 <b>Also shipped</b>\n${roundup.map((e) => `• <a href="${e.url}">${esc(e.headline.replace(/ is out$/, ''))}</a>`).join('\n')}`);
  return `${posts.length + (roundup.length ? 1 : 0)} message(s)`;
}

async function discord(posts, roundup) {
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (!hook) return 'skipped (no DISCORD_WEBHOOK_URL)';
  const color = (id) => parseInt((TOOLS.find((t) => t.id === id)?.color || '#7c5cff').slice(1), 16);
  const embeds = posts.map((e) => ({ title: clip(e.headline, 256), url: e.url, description: clip(e.summary || '', 400) + `\n\n[Source](${e.source})`, color: color(e.toolId), timestamp: e.date,
    thumbnail: { url: `${SITE_URL}/og/tools-${e.toolId}.png` } }));
  if (roundup.length) embeds.push({ title: 'Also shipped', url: `${SITE_URL}/`, description: clip(roundup.map((e) => `• [${e.headline.replace(/ is out$/, '')}](${e.url})`).join('\n'), 4000), color: 0x7c5cff });
  await http(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'aiticker', embeds: embeds.slice(0, 10) }) });
  return `${embeds.length} embed(s)`;
}

async function indexnow(urls) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return 'skipped (no INDEXNOW_KEY)';
  if (!urls.length) return 'nothing changed';
  await http('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: urls }) });
  return `${urls.length} URL(s) submitted`;
}

async function send() {
  const p = await readJson(PLAN, null);
  if (!p) return console.log('No plan — nothing to announce');
  const dry = process.env.DRY_RUN === '1';
  if (dry) { for (const e of p.posts) console.log(`--- Bluesky\n${bskyText(e)}\n`); console.log('IndexNow:', p.urls); return; }
  const channels = { Bluesky: () => bluesky(p.posts, p.roundup), Telegram: () => telegram(p.posts, p.roundup), Discord: () => discord(p.posts, p.roundup), IndexNow: () => indexnow(p.urls) };
  const empty = !p.posts.length && !p.roundup.length;
  for (const [name, run] of Object.entries(channels)) {
    if (empty && name !== 'IndexNow') continue;
    try { console.log(`✓ ${name.padEnd(9)} ${await run()}`); } catch (e) { console.log(`⚠ ${name.padEnd(9)} ${e.message}`); } // one channel failing never blocks the others
  }
}

const mode = process.argv[2];
(mode === 'plan' ? plan() : mode === 'send' ? send() : Promise.reject(new Error('usage: announce.mjs plan|send')))
  .catch((e) => { console.error(e); process.exit(1); });
