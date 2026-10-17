// Finds the official X account of every tracked tool — curated and auto-discovered alike — so the
// news fetcher follows them without a hand-kept list. Per tool, in order of trust:
//   1. `x` in sources.mjs (manual override; `x: null` turns X off for a tool)
//   2. links to x.com / twitter.com on the tool's official site (not GitHub pages, whose footer links GitHub's own account)
//   3. the `twitter_username` on the tool's GitHub org/user profile
//   4. an X link in the repo README
// Results are cached in the snapshot and re-checked weekly.

const RECHECK_DAYS = 7;
const DAY = 86400e3;
// Paths on x.com that aren't accounts.
const RESERVED = /^(intent|share|home|i|search|hashtag|explore|settings|privacy|tos|login|signup|messages|notifications|compose|status|widgets|about|download|en|jobs)$/i;
const X_LINK = /https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})(?=[/?"'#\s<)\]]|$)/g;

const isGithubPage = (url) => /^https?:\/\/(www\.)?github\.com\//i.test(url || '');

// Site and README links also include testimonials and authors, so a handle found there must look
// like the tool's own: it shares a name with the tool, vendor, domain or GitHub owner/repo.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(official|dev|hq|app|inc|labs?|ai|io|cli|code)$/g, '');
function namesOf(tool) {
  const [owner, repo] = (tool.github || '').split('/');
  return [tool.name, tool.vendor, tool.domain?.split('.')[0], owner, repo, ...tool.name.split(/\s+/)].map(norm).filter((n) => n.length >= 3);
}
const resembles = (handle, names) => { const h = norm(handle); return h.length >= 3 && names.some((n) => h.includes(n) || n.includes(h)); };

// The most-linked matching handle on a page wins (sites link their own account in header/footer).
function handleFrom(html, names) {
  const counts = new Map();
  for (const [, h] of html.matchAll(X_LINK)) {
    if (RESERVED.test(h) || !resembles(h, names)) continue;
    const k = h.toLowerCase();
    counts.set(k, { h, n: (counts.get(k)?.n || 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.h || null;
}

async function resolveOne(tool, { get, ghHeaders, owners }) {
  if ('x' in tool) return { handle: tool.x, src: 'manual' };
  const names = namesOf(tool);
  if (tool.site && !isGithubPage(tool.site)) {
    const html = await get(tool.site).catch(() => '');
    const h = handleFrom(html, names);
    if (h) return { handle: h, src: 'site' };
  }
  if (tool.github) {
    const owner = tool.github.split('/')[0];
    if (!owners.has(owner)) owners.set(owner, get(`https://api.github.com/users/${owner}`, { json: true, headers: ghHeaders() }).then((u) => u.twitter_username || null).catch(() => undefined));
    const h = await owners.get(owner);
    if (h) return { handle: h, src: 'github' };
    const readme = await get(`https://raw.githubusercontent.com/${tool.github}/HEAD/README.md`).catch(() => '');
    const r = handleFrom(readme, names);
    if (r) return { handle: r, src: 'readme' };
    if (h === undefined) return null; // GitHub lookup failed: try again next run
  }
  return { handle: null, src: 'none' };
}

/** Returns { [toolId]: { handle, src, checked } } for every tool, refreshing stale entries. */
export async function resolveHandles(tools, prev = {}, { get, ghHeaders, now = Date.now(), refresh = true }) {
  const out = {};
  const owners = new Map();
  const stale = [];
  for (const t of tools) {
    const old = prev[t.id];
    const manualChanged = 'x' in t && old?.handle !== t.x;
    if (old && 'own' in old && !manualChanged && (!refresh || now - Date.parse(old.checked) < RECHECK_DAYS * DAY)) out[t.id] = old;
    else stale.push(t);
  }
  // A few at a time: these are ordinary page loads on the tools' own sites.
  for (let i = 0; i < stale.length; i += 6) {
    await Promise.all(stale.slice(i, i + 6).map(async (t) => {
      const r = await resolveOne(t, { get, ghHeaders, owners }).catch(() => null);
      // `own`: the account is named after the product itself, not the company behind it (company
      // accounts also post about other things, so their posts must prove they're about coding).
      const [, repo] = (t.github || '').split('/');
      if (r) out[t.id] = { ...r, own: !!r.handle && resembles(r.handle, [t.name, repo, ...t.name.split(/s+/)].map(norm).filter((n) => n.length >= 3)), checked: new Date(now).toISOString() };
      else if (prev[t.id]) out[t.id] = prev[t.id];
    }));
  }
  return out;
}

/** handle (lowercased) → tool ids that use it. */
export function toolsByHandle(handles) {
  const map = new Map();
  for (const [id, { handle }] of Object.entries(handles)) {
    if (!handle) continue;
    const k = handle.toLowerCase();
    map.set(k, [...(map.get(k) || []), id]);
  }
  return map;
}
