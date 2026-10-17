// Auto-discovers trending open-source AI coding tools (agents, CLIs, IDEs, editor extensions)
// via the GitHub Search API, so the site grows beyond the hand-curated list in sources.mjs.
// A repo qualifies only if it looks like an actual coding tool (not a skill pack, guide, MCP
// server or proxy), is actively maintained and ships real GitHub Releases we can show.
import { TOOLS, DISCOVERY } from './sources.mjs';

const DAY = 86400e3;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// What counts as "our niche": the description has to say it's a coding agent / AI editor.
const POSITIVE = /\b(ai|llm|agentic|autonomous)\b.*\b(cod(e|ing)|programm\w*|software engineer\w*|developer)\b.*\b(agent|assistant|editor|ide|cli|copilot|pair[- ]program\w*)\b|\bcoding (agent|assistant|cli)\b|\bagentic (ide|coding|engineering|editor)\b|\bai (code|coding) (editor|ide|agent|assistant)\b|\b(agent|assistant)\b.*\b(in|for) (your|the) terminal\b|\bterminal\b.*\b(coding|ai) agent\b|\bpair program\w*\b.*\b(ai|llm)\b|\bcode assistant\b/i;
// Things that live in the ecosystem but aren't tools with a changelog worth tracking here.
const NEGATIVE = /\bawesome\b|\bskills?\b|\bguides?\b|tutorial|\btips\b|best[- ]practice|\bprompts?\b|system prompt|\bmcp( server|[- ]toolkit)?\b|\bproxy\b|\bgateway\b|\brouter\b|\btoken (usage|cost|consumption)|\bcourses?\b|\bbook\b|\blist of\b|\bcollection\b|\bcurated\b|\bhandbook\b|\bcheat ?sheet|\bwrapper\b|\bmonitor\b|\bdashboard\b|\bhistory viewer|\bguard\b|\bhook\b|\bmemory\b|\bcontext (engine|gateway)\b|\bbenchmark|\bdataset|\bpaper\b|\bresearch\b|教程|合集|中转|\bobservability\b|\bevals?\b|\bworkshop\b|\btemplates?\b|\brules\b|claude\.md|\bweb ui\b|menu bar|\bnotch\b|\bharness for\b|(terminal|window) manager|\bdeploy|\bintercept|\bvideo\b|\bavatar\b|\bslides?\b|\bkanban\b|\bannotate|\bturbocharge|\bport of\b|\bbridge\b/i;
// "…for your coding agent" / "works with Claude Code, Codex…" → a companion utility, not a tool itself.
const COMPANION = /\b(for|to|with|from|your|any|every|other|of) (ai |local ai |the |all )?(ai )?(coding agents?|ai coding assistants?)\b|\bcoding agents'|\breview (ai )?coding|claude code\b.*\b(codex|cursor|gemini)/i;
const STRONG = /\bagentic ide\b|\bai (code )?editor\b/i;

const CATEGORY = (r) => {
  const s = `${r.description} ${(r.topics || []).join(' ')}`.toLowerCase();
  if (/vs ?code|vscode-extension|xcode|jetbrains|neovim|nvim|emacs|\bextension\b|\bplugin\b/.test(s)) return 'extension';
  if (/\bide\b|\beditor\b|\bdesktop\b|\bworkspace\b/.test(s)) return 'ide';
  return 'cli';
};

const ACRONYMS = new Set(['ai', 'cli', 'ide', 'gui', 'swe', 'llm', 'ui', 'tui']);
const pretty = (r) => DISCOVERY.names[r.full_name.toLowerCase()]
  || (/[A-Z]/.test(r.name) ? r.name : r.name.split(/[-_]/).filter(Boolean).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' '));

// Stable, readable accent derived from the repo name.
const colorFor = (s) => {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 62%)`;
};

/** Returns candidate repos (search results) that pass the niche filter, best first. */
export async function searchCandidates(get, ghHeaders) {
  const pushed = iso(Date.now() - DISCOVERY.maxIdleDays * DAY);
  const created = iso(Date.now() - 180 * DAY);
  const known = new Set(TOOLS.filter((t) => t.github).map((t) => t.github.toLowerCase()));
  const deny = new Set(DISCOVERY.deny.map((s) => s.toLowerCase()));
  const base = `stars:>${DISCOVERY.minStars} pushed:>${pushed} archived:false fork:false`;
  const queries = [
    ...DISCOVERY.topics.map((t) => `topic:${t} ${base}`),
    `"coding agent" in:description ${base}`,
    `"AI code editor" in:description ${base}`,
    `"agentic IDE" in:description ${base}`,
    `"coding assistant" in:description ${base}`,
    // Rising: young repos gaining stars fast.
    `"coding agent" in:description created:>${created} stars:>${Math.round(DISCOVERY.minStars / 2)} archived:false fork:false`,
  ];
  const seen = new Map();
  for (const q of queries) { // sequential: the Search API allows ~30 req/min
    const res = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100`, { json: true, headers: ghHeaders() });
    for (const r of res.items || []) seen.set(r.full_name.toLowerCase(), r);
  }
  return [...seen.values()].filter((r) => {
    const key = r.full_name.toLowerCase();
    if (known.has(key) || deny.has(key)) return false;
    if (DISCOVERY.allow.some((a) => a.toLowerCase() === key)) return true;
    const desc = r.description || '';
    if (r.stargazers_count < DISCOVERY.minStars) return false;
    if (STRONG.test(desc)) return !NEGATIVE.test(desc);
    return POSITIVE.test(desc) && !NEGATIVE.test(`${desc} ${r.name}`) && !COMPANION.test(desc);
  });
}

/** Turns a qualifying repo into a tool entry shaped like those in sources.mjs. */
export function toTool(r) {
  let domain = null;
  try { if (r.homepage) domain = new URL(r.homepage).hostname.replace(/^www\./, ''); } catch {}
  return {
    id: `gh-${r.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: pretty(r), vendor: r.owner.login, category: CATEGORY(r),
    site: r.homepage && /^https?:/.test(r.homepage) ? r.homepage : r.html_url,
    domain, avatar: r.owner.avatar_url, color: colorFor(r.full_name),
    blurb: (r.description || '').replace(/\s+/g, ' ').trim(),
    github: r.full_name, discovered: true,
    createdAt: r.created_at,
  };
}
