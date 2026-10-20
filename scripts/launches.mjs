// When everything on the site first shipped: tools, the companies behind tools and models, and each lab's
// first model. Hand-checked against launch posts and coverage; dates are as precise as the sources allow
// ('YYYY-MM-DD', 'YYYY-MM' or 'YYYY'). Anything left out is unknown rather than guessed. Plan start dates
// live next to each plan in pricing.mjs (`since`).

export const LAUNCHES_CHECKED = '2026-10-20';

// Curated tools. Tools not listed here (and auto-discovered ones) fall back to their first GitHub, npm or
// Homebrew release when the fetched history is complete (see firstRelease in build.mjs).
export const TOOL_LAUNCH = {
  'claude-code': { date: '2025-02-24', note: 'Research preview alongside Claude 3.7 Sonnet', url: 'https://www.anthropic.com/news/claude-3-7-sonnet' },
  codex: { date: '2025-04-16', note: 'Open-sourced alongside o3 and o4-mini', url: 'https://openai.com/index/introducing-o3-and-o4-mini/' },
  'gemini-cli': { date: '2025-06-25', note: 'Open-source launch', url: 'https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/' },
  'copilot-cli': { date: '2025-09-25', note: 'Public preview' },
  opencode: { date: '2025-06', note: 'First release of the TypeScript agent from SST' },
  amp: { date: '2025-05-15', note: 'Research preview from Sourcegraph' },
  'qwen-code': { date: '2025-07-22', note: 'Launched with Qwen3-Coder', url: 'https://qwenlm.github.io/blog/qwen3-coder/' },
  'kimi-cli': { date: '2025-10', note: 'Technical preview' },
  goose: { date: '2025-01-28', note: 'Open-sourced by Block' },
  openhands: { date: '2024-03', note: 'Launched as OpenDevin' },
  cursor: { date: '2023-03', note: 'Public launch' },
  kiro: { date: '2025-07-14', note: 'Public preview', url: 'https://kiro.dev/blog/introducing-kiro/' },
  antigravity: { date: '2025-11-18', note: 'Launched with Gemini 3' },
  zed: { date: '2023-03', note: 'Public beta for macOS · open-sourced Jan 2024' },
  vscode: { date: '2015-04-29', note: 'Preview announced at Microsoft Build' },
  windsurf: { date: '2024-11-13', note: 'Windsurf Editor launched by Codeium' },
  trae: { date: '2025-01-20', note: 'International launch on macOS' },
  'jetbrains-ai': { date: '2023-12-06', note: 'AI Assistant generally available in 2023.3 · Junie followed in 2025' },
  'github-copilot': { date: '2021-06-29', note: 'Technical preview · generally available Jun 2022', url: 'https://github.blog/2021-06-29-introducing-github-copilot-ai-pair-programmer/' },
  cline: { date: '2024-07', note: 'Released as Claude Dev' },
  'roo-code': { date: '2024-11', note: 'Forked from Cline as Roo Cline' },
  'kilo-code': { date: '2025-03', note: 'VS Code extension launch' },
  continue: { date: '2023', note: 'Open-source launch' },
  augment: { date: '2024-04-24', note: 'Came out of stealth' },
  'claude-desktop': { date: '2024-10-31', note: 'Public beta for macOS and Windows' },
  'codex-app': { date: '2026-02-02', note: 'macOS launch' },
  conductor: { date: '2025-07', note: 'First public build' },
  warp: { date: '2022-04-05', note: 'Public beta for macOS' },
};

// Companies behind the tools and the model labs, keyed by the name the site shows.
// founded: year founded · parent: owning company when the name is a team or brand · firstModel: the lab's first LLM release.
// Optional extras for company pages (scripts/build.mjs builds one for every tool vendor and model lab on its own).
// `alias` folds a vendor spelling into another company when the names don't normalise to the same key.
export const COMPANIES = {
  Anthropic: { founded: '2021', firstModel: { name: 'Claude', date: '2023-03-14' } },
  OpenAI: { founded: '2015', firstModel: { name: 'GPT-1', date: '2018-06-11' } },
  Google: { founded: '1998', firstModel: { name: 'Gemini 1.0', date: '2023-12-06' } },
  xAI: { founded: '2023', firstModel: { name: 'Grok-1', date: '2023-11-04' } },
  DeepSeek: { founded: '2023', firstModel: { name: 'DeepSeek Coder', date: '2023-11-02' } },
  Qwen: { founded: '1999', parent: 'Alibaba', firstModel: { name: 'Qwen-7B', date: '2023-08-03' } },
  'Alibaba Qwen': { founded: '1999', parent: 'Alibaba', alias: 'Qwen' },
  'Moonshot AI': { founded: '2023', firstModel: { name: 'Kimi Chat', date: '2023-10-09' } },
  'Z.ai': { founded: '2019', parent: 'Zhipu AI', firstModel: { name: 'GLM-130B', date: '2022-08-04' } },
  Mistral: { founded: '2023', firstModel: { name: 'Mistral 7B', date: '2023-09-27' } },
  Meta: { founded: '2004', firstModel: { name: 'LLaMA', date: '2023-02-24' } },
  MiniMax: { founded: '2021' },
  NVIDIA: { founded: '1993' },
  Amazon: { founded: '1994', firstModel: { name: 'Titan Text', date: '2023-11' } },
  Microsoft: { founded: '1975', firstModel: { name: 'Phi-1', date: '2023-06-20' } },
  Cohere: { founded: '2019' },
  Xiaomi: { founded: '2010', firstModel: { name: 'MiMo-7B', date: '2025-04-30' } },
  ByteDance: { founded: '2012', firstModel: { name: 'Doubao', date: '2024-05-15' } },
  Tencent: { founded: '1998', firstModel: { name: 'Hunyuan', date: '2023-09-07' } },
  StepFun: { founded: '2023' },
  // Tool vendors
  GitHub: { founded: '2008', parent: 'Microsoft' },
  Anysphere: { founded: '2022' },
  AWS: { founded: '2006', parent: 'Amazon' },
  'Zed Industries': { founded: '2021' },
  Cognition: { founded: '2023' },
  JetBrains: { founded: '2000' },
  Block: { founded: '2009' },
  'All Hands AI': { founded: '2024' },
  Augment: { founded: '2022' },
  Continue: { founded: '2023' },
  Kilo: { founded: '2025' },
  Warp: { founded: '2020' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → 'Feb 24, 2025' · 'YYYY-MM' → 'Feb 2025' · 'YYYY' → '2025'
export function fmtLaunch(d) {
  const [y, m, day] = d.split('-');
  if (!m) return y;
  return day ? `${MONTHS[m - 1]} ${+day}, ${y}` : `${MONTHS[m - 1]} ${y}`;
}
