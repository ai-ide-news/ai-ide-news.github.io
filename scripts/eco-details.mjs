// Detail pages for every skill and MCP server on the site: the README or SKILL.md, the skills a pack ships,
// releases, contributors, the tools a hosted server exposes, and the install command for each agent.
// One JSON file per item under data/details/, so a refresh only rewrites what changed.
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const DIR = new URL('../data/details/', import.meta.url);
const DAY = 86400e3;
const HTML_MAX = 40000, SKILLS_MAX = 48, TOOLS_MAX = 80;

/** File key for an item: 'gh' (trending repo), 'sk' (single skill from claude-plugins.dev), 'sm' (Smithery server). */
export const detailKey = (kind, id) => `${kind}~${id.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9._-]+/g, '~')}`;

export async function readDetails() {
  const out = {};
  let files = [];
  try { files = await readdir(DIR); } catch { return out; }
  await Promise.all(files.filter((f) => f.endsWith('.json')).map(async (f) => {
    try { out[f.slice(0, -5)] = JSON.parse(await readFile(new URL(f, DIR), 'utf8')); } catch { /* a broken file is refetched */ }
  }));
  return out;
}

// GitHub-style heading anchors, so the README's own "#section" links keep working.
const anchor = (text, used) => {
  let id = text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
  const base = id || 'section';
  for (let n = 1; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
};

/** Markdown → sanitized HTML with links and images made absolute against the repo, plus a table of contents. */
export function renderMarkdown(md, { repo, branch, dir = '' }) {
  const base = (p) => {
    const path = new URL(p, `https://x/${dir ? `${dir.replace(/\/?$/, '/')}` : ''}`).pathname.slice(1);
    return { blob: `https://github.com/${repo}/blob/${branch}/${path}`, raw: `https://raw.githubusercontent.com/${repo}/${branch}/${path}` };
  };
  const rel = (u) => u && !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(u);
  const opts = {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'strong', 'em', 'b', 'i', 'blockquote', 'br', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'kbd', 'del', 'details', 'summary', 'sup', 'sub', 'input'],
    allowedAttributes: { a: ['href'], img: ['src', 'alt', 'width', 'height'], th: ['align'], td: ['align'], input: ['type', 'checked', 'disabled'], details: ['open'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      a: (tag, a) => {
        const href = rel(a.href) ? base(a.href).blob : a.href?.replace(/^\/(?!\/)/, `https://github.com/${repo}/blob/${branch}/`);
        return { tagName: 'a', attribs: { ...a, href, ...(href?.startsWith('#') ? {} : { rel: 'noopener nofollow', target: '_blank' }) } };
      },
      img: (tag, a) => {
        let src = rel(a.src) ? base(a.src).raw : a.src || '';
        src = src.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\//, 'https://raw.githubusercontent.com/$1/');
        return { tagName: 'img', attribs: { ...a, src, loading: 'lazy', decoding: 'async' } };
      },
      h1: 'h2', h5: 'h4', h6: 'h4',
    },
  };
  let html = sanitizeHtml(marked.parse(md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), { gfm: true }), opts);
  // Long READMEs are cut at a tag boundary; sanitizing again closes whatever the cut left open.
  if (html.length > HTML_MAX) html = `${sanitizeHtml(html.slice(0, html.lastIndexOf('</', HTML_MAX)), opts)}<p class="clipped">…</p>`;
  const used = new Set(), toc = [];
  html = html.replace(/<h([234])>([\s\S]*?)<\/h\1>/g, (m, lv, inner) => {
    const id = anchor(inner, used);
    const text = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    if (lv !== '4' && text) toc.push({ id, text: text.slice(0, 80), level: +lv });
    return `<h${lv} id="${id}">${inner}</h${lv}>`;
  });
  return { html, toc: toc.slice(0, 40) };
}

const frontmatter = (md) => {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) { key = kv[1]; out[key] = kv[2].replace(/^["'>|]\s*|["']$/g, '').trim(); } else if (key && /^\s+\S/.test(line)) out[key] = `${out[key]} ${line.trim()}`.trim();
  }
  return out;
};

// Install hints read from the README: the JSON config block most MCP READMEs show, npx/uvx/docker lines,
// a hosted endpoint, and the ready-made agent commands (claude mcp add, skills add, /plugin ...).
export function installHints(md) {
  const text = md.replace(/\r/g, '');
  const out = {};
  const cfg = text.match(/"command"\s*:\s*"(npx|uvx|bunx|pnpm|docker|node|python3?|uv|deno)"\s*,\s*"args"\s*:\s*\[([^\]]*)\]/);
  if (cfg) {
    const args = [...cfg[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    if (args.length && args.length < 14 && !args.some((a) => /^\/|[A-Z]:\\|path\/to/i.test(a))) out.run = { command: cfg[1], args };
  }
  if (!out.run) {
    const npx = text.match(/\bnpx\s+(?:-y\s+|--yes\s+)?((?:@[\w.-]+\/)?[\w.-]*mcp[\w.-]*(?:@[\w.^~-]+)?)/i);
    const uvx = text.match(/\buvx\s+((?:--from\s+\S+\s+)?[\w.-]*mcp[\w.-]*(?:@[\w.-]+)?)/i);
    if (npx) out.run = { command: 'npx', args: ['-y', npx[1]] };
    else if (uvx) out.run = { command: 'uvx', args: uvx[1].split(/\s+/) };
  }
  const remote = text.match(/https:\/\/[\w.-]+(?::\d+)?(?:\/[\w.@%~-]+)*\/(?:mcp|sse)\b(?![\w./-])/);
  if (remote && !/localhost|127\.0\.0\.1|example\.com|your[-_]?/i.test(remote[0])) out.remote = remote[0];
  const line = (re) => text.match(re)?.[0].trim().replace(/\s+\\?$/, '');
  out.claude = line(/^\s*claude mcp add\b[^\n`]{0,240}/m);
  out.codex = line(/^\s*codex mcp add\b[^\n`]{0,240}/m);
  out.gemini = line(/^\s*gemini (?:extensions install|mcp add)\b[^\n`]{0,240}/m);
  out.skillsAdd = line(/^\s*npx (?:-y )?skills(?:@[\w.-]+)? add\b[^\n`]{0,200}/m);
  out.plugin = [...new Set([...text.matchAll(/^\s*(\/plugin (?:marketplace add|install)\s[^\n`]{1,160})/gm)].map((m) => m[1].trim()))].slice(0, 4);
  for (const k of Object.keys(out)) if (out[k] == null || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  return out;
}

async function pool(list, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const j = i++; out[j] = await fn(list[j], j); }
  }));
  return out;
}

const rawUrl = (repo, branch, path) => `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;

async function repoDetails(r, { get, ghHeaders }) {
  const api = `https://api.github.com/repos/${r.repo}`;
  const gh = { json: true, headers: ghHeaders() };
  const meta = await get(api, gh);
  const branch = meta.default_branch || 'main';
  const [tree, rels, people] = await Promise.all([
    get(`${api}/git/trees/${encodeURIComponent(branch)}?recursive=1`, gh).catch(() => ({ tree: [] })),
    get(`${api}/releases?per_page=6`, gh).catch(() => []),
    get(`${api}/contributors?per_page=14`, gh).catch(() => []),
  ]);
  const paths = (tree.tree || []).filter((t) => t.type === 'blob').map((t) => t.path);
  const raw = (p) => get(rawUrl(r.repo, branch, p)).catch(() => '');
  const readmePath = paths.find((p) => /^readme\.(md|markdown|mdx)$/i.test(p)) || paths.find((p) => /^readme$/i.test(p));
  const readme = readmePath ? await raw(readmePath) : '';
  const skillPaths = paths.filter((p) => /(^|\/)skill\.md$/i.test(p) && !/(^|\/)(node_modules|\.git|test|tests|examples?|fixtures?)\//i.test(p));
  const skills = (await pool(skillPaths.slice(0, SKILLS_MAX), 8, async (p) => {
    const fm = frontmatter(await raw(p));
    const dir = p.replace(/\/?skill\.md$/i, '');
    return { name: fm.name || dir.split('/').pop() || r.repo.split('/')[1], description: (fm.description || '').slice(0, 300), path: dir };
  })).filter(Boolean);
  let npm = null, pypi = null;
  if (paths.includes('package.json')) {
    try { const p = JSON.parse(await raw('package.json')); if (p.name && !p.private) npm = { name: p.name, bin: !!p.bin }; } catch { /* not JSON */ }
  }
  if (paths.includes('pyproject.toml')) pypi = (await raw('pyproject.toml')).match(/^\[project\][\s\S]*?^name\s*=\s*["']([^"']+)/m)?.[1] || null;
  const hints = installHints(readme);
  if (!hints.run && npm?.bin && /mcp/i.test(npm.name)) hints.run = { command: 'npx', args: ['-y', npm.name] };
  if (!hints.run && pypi && /mcp/i.test(pypi)) hints.run = { command: 'uvx', args: [pypi] };
  return {
    fetchedAt: new Date().toISOString(), pushedAt: r.pushedAt, branch,
    issues: meta.open_issues_count ?? null, watchers: meta.subscribers_count ?? null, size: meta.size ?? null,
    homepage: meta.homepage || null, archived: !!meta.archived, files: paths.length, truncated: !!tree.truncated,
    readme: readme ? { path: readmePath, ...renderMarkdown(readme, { repo: r.repo, branch }) } : null,
    skills, skillCount: skillPaths.length,
    marketplace: paths.includes('.claude-plugin/marketplace.json'), plugin: paths.includes('.claude-plugin/plugin.json'),
    docker: paths.includes('Dockerfile'), npm, pypi, install: hints,
    releases: (Array.isArray(rels) ? rels : []).filter((x) => !x.draft).slice(0, 6).map((x) => ({ tag: x.tag_name, name: x.name || '', date: x.published_at || x.created_at, url: x.html_url, pre: !!x.prerelease })),
    contributors: (Array.isArray(people) ? people : []).filter((p) => p.type === 'User').slice(0, 12).map((p) => ({ login: p.login, avatar: p.avatar_url, n: p.contributions })),
  };
}

// claude-plugins.dev links to the skill's folder; its SKILL.md comes straight from raw.githubusercontent.com.
async function skillDetails(s, { get }) {
  const m = s.url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/([^/]+)\/?(.*)$/);
  if (!m) return null;
  const [, repo, branch, dir] = m;
  const md = await get(rawUrl(repo, branch, `${dir ? `${dir}/` : ''}SKILL.md`));
  const fm = frontmatter(md);
  return {
    fetchedAt: new Date().toISOString(), repo, branch, dir,
    meta: Object.fromEntries(Object.entries(fm).filter(([k]) => !['name', 'description'].includes(k)).slice(0, 8)),
    body: renderMarkdown(md, { repo, branch, dir }),
  };
}

// Smithery's server record: the tools the server exposes, how to connect and what it needs configured.
async function smitheryDetails(s, { get }) {
  const d = await get(`https://registry.smithery.ai/servers/${s.id.split('/').map(encodeURIComponent).join('/')}`, { json: true });
  const props = (schema) => Object.entries(schema?.properties || {}).slice(0, 12).map(([name, p]) => ({
    name, type: Array.isArray(p.type) ? p.type.join(' | ') : p.type || (p.enum ? 'enum' : ''), required: (schema.required || []).includes(name),
    description: (p.description || '').replace(/\s+/g, ' ').slice(0, 200),
  }));
  return {
    fetchedAt: new Date().toISOString(),
    deploymentUrl: d.deploymentUrl || null, remote: !!d.remote,
    connections: (d.connections || []).map((c) => ({ type: c.type, url: c.deploymentUrl || null, config: props(c.configSchema) })),
    tools: (d.tools || []).slice(0, TOOLS_MAX).map((t) => ({ name: t.name, description: (t.description || '').replace(/\s+/g, ' ').slice(0, 500), params: props(t.inputSchema) })),
    toolCount: (d.tools || []).length,
    prompts: (d.prompts || []).slice(0, 20).map((p) => ({ name: p.name, description: (p.description || '').slice(0, 200) })),
    resources: (d.resources || []).slice(0, 20).map((p) => ({ name: p.name, uri: p.uri, description: (p.description || '').slice(0, 200) })),
  };
}

/**
 * Refreshes the detail files for everything on the Skills and MCP pages. Repos are refetched when they've been
 * pushed to since (at most daily, and up to `budget` per run — the rest catch up next run); single skills and
 * Smithery servers every few days. Files for items no longer listed are removed.
 */
export async function fetchDetails({ eco, get, ghHeaders, report, budget = 120 }) {
  await mkdir(DIR, { recursive: true });
  const prev = await readDetails();
  const now = Date.now();
  const jobs = [];
  const repos = [...(eco.skills || []), ...(eco.mcp || [])].sort((a, b) => b.score - a.score);
  const wanted = new Set();
  for (const r of repos) {
    const key = detailKey('gh', r.id); wanted.add(key);
    const old = prev[key];
    if (!old || (old.pushedAt !== r.pushedAt && now - Date.parse(old.fetchedAt) > DAY)) jobs.push({ key, stale: !!old, run: () => repoDetails(r, { get, ghHeaders }) });
  }
  const ghJobs = jobs.sort((a, b) => a.stale - b.stale).slice(0, budget); // never-fetched repos first
  const other = [];
  for (const s of eco.skillsTop || []) {
    const key = detailKey('sk', s.id); wanted.add(key);
    if (!prev[key] || now - Date.parse(prev[key].fetchedAt) > 3 * DAY) other.push({ key, run: () => skillDetails(s, { get }) });
  }
  for (const s of eco.mcpTop || []) {
    const key = detailKey('sm', s.id); wanted.add(key);
    if (!prev[key] || now - Date.parse(prev[key].fetchedAt) > 3 * DAY) other.push({ key, run: () => smitheryDetails(s, { get }) });
  }
  let ok = 0, failed = 0;
  await pool([...ghJobs, ...other], 6, async (j) => {
    try {
      const d = await j.run();
      if (d) { await writeFile(new URL(`${j.key}.json`, DIR), `${JSON.stringify(d)}\n`); ok++; }
    } catch { failed++; }
  });
  const gone = Object.keys(prev).filter((k) => !wanted.has(k));
  await Promise.all(gone.map((k) => rm(new URL(`${k}.json`, DIR), { force: true })));
  report.push(`✓ Skill & MCP details    ${ok} refreshed${failed ? `, ${failed} failed` : ''}, ${Math.max(0, jobs.length - ghJobs.length)} repos queued, ${gone.length} removed`);
}
