// Agent Skills and MCP servers: the add-ons people plug into their AI coding tools.
// Both lists come from the GitHub Search API (real repos, ranked by star velocity like trending tools);
// the MCP page also lists what was just published to the official MCP Registry.
import { TOOLS, ECOSYSTEM } from './sources.mjs';

const DAY = 86400e3;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

const AI = /\b(ai|llm|agents?|agentic|claude|codex|cursor|copilot|gemini|opencode|windsurf|kiro|cline|amp|goose)\b/i;
const DIRECTORY = /\bawesome\b|\bcurated\b|\blist of\b|\bcollection of\b|\bdirectory\b|\bmarketplace\b|\bregistry\b|\bcatalog\b/i;
const LEARN = /\bbeginners?\b|curriculum|tutorial|\bcourse\b|\bguide\b|\bworkshop\b/i;

const KINDS = {
  skills: {
    match: (s) => /\bskills?\b|skill\.md/i.test(s) && AI.test(s),
    kind: (s) => (DIRECTORY.test(s) ? 'directory' : /\bskills\b|\blibrary\b|\bpack\b|\bplugins\b|\bframework\b/i.test(s) ? 'pack' : 'skill'),
    queries: (base) => [
      ...ECOSYSTEM.skills.topics.map((t) => `topic:${t} ${base}`),
      `"agent skills" in:description ${base}`,
      `"agent skill" in:description ${base}`,
      `"claude skills" in:description ${base}`,
      `"SKILL.md" in:description,readme ${base}`,
      `"Claude Code skills" in:description ${base}`,
      `"Codex skills" in:description ${base}`,
    ],
  },
  mcp: {
    match: (s) => /\bmcp\b|model context protocol/i.test(s),
    kind: (s) => (DIRECTORY.test(s) || LEARN.test(s) ? 'directory'
      : /\bsdk\b|\bframework\b|\blibrary\b|\bbuild(ing)? (mcp|model context)|\bclients?\b|\bgateway\b|\bproxy\b|\binspector\b|\bdebug|\btesting\b|\brouter\b/i.test(s) ? 'infra' : 'server'),
    queries: (base) => [
      ...ECOSYSTEM.mcp.topics.map((t) => `topic:${t} ${base}`),
      `"MCP server" in:description ${base}`,
      `"model context protocol" in:description ${base}`,
      `"MCP tools" in:description ${base}`,
    ],
  },
};

const ACRONYMS = new Set(['ai', 'mcp', 'cli', 'ide', 'ui', 'llm', 'sdk', 'api', 'db', 'sql', 'aws', 'ui']);
const pretty = (r) => ECOSYSTEM.names[r.full_name.toLowerCase()]
  || (/[A-Z]/.test(r.name) ? r.name : r.name.split(/[-_.]/).filter(Boolean).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' '));

function starVelocity(history, now) {
  const recent = history.filter(([d]) => now - Date.parse(d) <= 8 * DAY);
  if (recent.length < 2) return null;
  const [d0, s0] = recent[0], [d1, s1] = recent[recent.length - 1];
  const days = (Date.parse(d1) - Date.parse(d0)) / DAY;
  return days >= 1 ? Math.round(((s1 - s0) / days) * 7) : null;
}

async function searchKind(type, get, ghHeaders, prev, now, skip = new Set()) {
  const cfg = ECOSYSTEM[type], spec = KINDS[type];
  const base = `stars:>${cfg.minStars} pushed:>${iso(now - cfg.maxIdleDays * DAY)} archived:false fork:false`;
  const known = new Set(TOOLS.filter((t) => t.github).map((t) => t.github.toLowerCase()));
  const deny = new Set(cfg.deny.map((s) => s.toLowerCase()));
  const seen = new Map();
  for (const q of spec.queries(base)) { // sequential and spaced: the Search API allows ~30 req/min
    if (seen.size) await new Promise((r) => setTimeout(r, 2100));
    const res = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100`, { json: true, headers: ghHeaders() });
    for (const r of res.items || []) seen.set(r.full_name.toLowerCase(), r);
  }
  const today = iso(now);
  const prevById = new Map((prev || []).map((d) => [d.id, d]));
  return [...seen.values()]
    .filter((r) => {
      const key = r.full_name.toLowerCase();
      if (known.has(key) || deny.has(key) || skip.has(key)) return false;
      return spec.match(`${r.description || ''} ${r.name}`);
    })
    .map((r) => {
      const id = r.full_name.toLowerCase();
      const old = prevById.get(id);
      const stars = [...(old?.stars || []).filter(([d]) => d !== today && now - Date.parse(d) < 31 * DAY), [today, r.stargazers_count]];
      const velocity = starVelocity(stars, now);
      const ageDays = Math.max(30, (now - Date.parse(r.created_at)) / DAY);
      const desc = (r.description || '').replace(/\s+/g, ' ').trim();
      return {
        id, name: pretty(r), owner: r.owner.login, avatar: r.owner.avatar_url, repo: r.full_name, url: r.html_url,
        homepage: r.homepage && /^https?:/.test(r.homepage) ? r.homepage : null,
        description: desc, kind: spec.kind(`${desc} ${r.name}`),
        language: r.language || null, license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
        topics: (r.topics || []).slice(0, 8), count: r.stargazers_count, forks: r.forks_count,
        createdAt: r.created_at, pushedAt: r.pushed_at, firstSeen: old?.firstSeen || new Date(now).toISOString(),
        stars, starsPerWeek: velocity, score: velocity ?? Math.round((r.stargazers_count / ageDays) * 7),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.max);
}

// The official MCP Registry lists servers alphabetically, so read the whole recent window and sort it.
async function fetchRegistry(get, now) {
  const since = new Date(now - ECOSYSTEM.mcp.registryDays * DAY).toISOString();
  const out = new Map();
  let cursor = '';
  let page = 0;
  for (; page < 30; page++) {
    const res = await get(`https://registry.modelcontextprotocol.io/v0/servers?limit=100&version=latest&updated_since=${encodeURIComponent(since)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { json: true });
    for (const { server: s, _meta } of res.servers || []) {
      const m = _meta?.['io.modelcontextprotocol.registry/official'] || {};
      if (m.status && m.status !== 'active') continue;
      out.set(s.name, {
        name: s.name, title: s.title || s.name.split('/').pop(), description: (s.description || '').replace(/\s+/g, ' ').trim(),
        version: s.version, publishedAt: m.publishedAt || m.updatedAt,
        url: s.websiteUrl || s.repository?.url || null, repo: s.repository?.url || null,
        remote: !!s.remotes?.length, packages: [...new Set((s.packages || []).map((p) => p.registryType || p.registry_type).filter(Boolean))],
      });
    }
    cursor = res.metadata?.nextCursor;
    if (!cursor) break;
  }
  const servers = [...out.values()].filter((s) => s.publishedAt).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { fetchedAt: new Date(now).toISOString(), days: ECOSYSTEM.mcp.registryDays, total: servers.length, capped: !!cursor, servers: servers.slice(0, 60) };
}

// The most-installed individual skills and servers, from the catalogs agents install from — most of these live inside
// bigger repos or are hosted services, so the GitHub repo search above never sees them.
// Skills: claude-plugins.dev (every SKILL.md on GitHub, by installs). MCP: Smithery's registry (by use count).
const POPULAR = 100, POPULAR_PAGES = 2;
async function fetchPopularSkills(get) {
  const skills = [];
  for (let p = 0; p < POPULAR_PAGES; p++) {
    const res = await get(`https://claude-plugins.dev/api/skills?limit=${POPULAR}&offset=${p * POPULAR}`, { json: true });
    skills.push(...(res.skills || []));
    if ((res.skills || []).length < POPULAR) break;
  }
  return [...new Map(skills.map((s) => [s.namespace || s.id, s])).values()].filter((s) => s.installs > 0 && s.sourceUrl).map((s) => ({
    id: s.namespace || s.id, name: s.name, owner: s.author || s.metadata?.repoOwner || '',
    repo: s.metadata?.repoOwner && s.metadata?.repoName ? `${s.metadata.repoOwner}/${s.metadata.repoName}` : null,
    url: s.sourceUrl, description: (s.description || '').replace(/\s+/g, ' ').trim(),
    installs: s.installs, stars: s.stars ?? null, updatedAt: s.updatedAt || s.createdAt || null,
  }));
}
async function fetchPopularServers(get) {
  const servers = [];
  for (let p = 1; p <= POPULAR_PAGES; p++) {
    const res = await get(`https://registry.smithery.ai/servers?pageSize=${POPULAR}&page=${p}`, { json: true });
    servers.push(...(res.servers || []));
    if (p >= (res.pagination?.totalPages || 1)) break;
  }
  return [...new Map(servers.map((s) => [s.qualifiedName, s])).values()].filter((s) => !s.unlisted && !s.inactive && s.useCount > 0).map((s) => ({
    id: s.qualifiedName, name: s.displayName || s.qualifiedName, owner: s.namespace || '',
    url: `https://smithery.ai/servers/${s.qualifiedName}`, homepage: s.homepage || null, icon: s.iconUrl || null,
    description: (s.description || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim(),
    uses: s.useCount, verified: !!s.verified, remote: !!s.remote, createdAt: s.createdAt || null,
  })).sort((a, b) => b.uses - a.uses);
}

/** Returns { skills, mcp, registry, skillsTop, mcpTop }; each part falls back to the previous snapshot on failure. */
export async function fetchEcosystem({ get, ghHeaders, prev = {}, now, report }) {
  const out = { ...prev };
  for (const type of ['skills', 'mcp']) {
    try {
      // A skill repo that only mentions MCP in passing stays on the Skills page.
      const skip = new Set(type === 'mcp' ? (out.skills || []).filter((r) => !/\bmcp server|model context protocol/i.test(r.description)).map((r) => r.id) : []);
      out[type] = await searchKind(type, get, ghHeaders, prev[type], now, skip);
      report.push(`✓ ${type === 'mcp' ? 'MCP servers' : 'Agent Skills'}${' '.repeat(type === 'mcp' ? 12 : 11)}${out[type].length} repos`);
    } catch (e) { report.push(`⚠ ${type === 'mcp' ? 'MCP servers' : 'Agent Skills'}: ${e.message} (kept previous)`); }
  }
  try {
    out.registry = await fetchRegistry(get, now);
    report.push(`✓ MCP Registry           ${out.registry.total} servers updated in ${out.registry.days} days`);
  } catch (e) { report.push(`⚠ MCP Registry: ${e.message} (kept previous)`); }
  try {
    out.skillsTop = await fetchPopularSkills(get);
    report.push(`✓ Most-installed skills  ${out.skillsTop.length} from claude-plugins.dev`);
  } catch (e) { report.push(`⚠ Most-installed skills: ${e.message} (kept previous)`); }
  try {
    out.mcpTop = await fetchPopularServers(get);
    report.push(`✓ Most-used MCP servers  ${out.mcpTop.length} from Smithery`);
  } catch (e) { report.push(`⚠ Most-used MCP servers: ${e.message} (kept previous)`); }
  return out;
}
