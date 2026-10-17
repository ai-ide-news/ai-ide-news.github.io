// Every tool tracked by the site, and where its real release data comes from.
// github: GitHub Releases API · feeds: official RSS/Atom feeds (kind: changelog | blog)

export const CATEGORIES = {
  ide: { label: 'AI IDEs', short: 'IDE' },
  cli: { label: 'AI CLIs & agents', short: 'CLI' },
  extension: { label: 'Editor extensions', short: 'Extension' },
};

export const TOOLS = [
  // ── CLIs ────────────────────────────────────────────────
  {
    id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', category: 'cli',
    logo: 'lobe:claudecode',
    site: 'https://claude.com/product/claude-code', domain: 'claude.com', color: '#D97757',
    blurb: "Anthropic's agentic coding tool for the terminal, IDE and desktop.",
    github: 'anthropics/claude-code',
  },
  {
    id: 'codex', name: 'Codex CLI', vendor: 'OpenAI', category: 'cli',
    logo: 'lobe:codex',
    site: 'https://developers.openai.com/codex', domain: 'openai.com', color: '#10A37F',
    blurb: "OpenAI's lightweight coding agent that runs in your terminal.",
    github: 'openai/codex', tagFilter: /^rust-v\d+\.\d+\.\d+$/,
    feeds: [{ url: 'https://openai.com/news/rss.xml', kind: 'blog', filter: /\bcodex\b/i }],
  },
  {
    id: 'gemini-cli', name: 'Gemini CLI', vendor: 'Google', category: 'cli',
    logo: 'lobe:geminicli',
    site: 'https://github.com/google-gemini/gemini-cli', domain: 'gemini.google.com', color: '#4285F4',
    blurb: 'Open-source AI agent that brings Gemini directly into your terminal.',
    github: 'google-gemini/gemini-cli', tagFilter: /^v\d+\.\d+\.\d+$/,
    feeds: [{ url: 'https://blog.google/technology/developers/rss/', kind: 'blog', filter: /gemini cli|code assist|jules/i }],
  },
  {
    id: 'copilot-cli', name: 'GitHub Copilot CLI', vendor: 'GitHub', category: 'cli', x: 'github',
    logo: 'lobe:githubcopilot',
    site: 'https://github.com/features/copilot/cli', domain: 'github.com', color: '#8957E5',
    blurb: 'GitHub Copilot as an agent in your terminal.',
    github: 'github/copilot-cli',
  },
  {
    id: 'opencode', name: 'OpenCode', vendor: 'Anomaly', category: 'cli',
    logo: 'lobe:opencode',
    site: 'https://opencode.ai', domain: 'opencode.ai', color: '#E8E8E8',
    blurb: 'The open-source AI coding agent built for the terminal.',
    // OpenCode 2.x ships as @opencode/cli on npm; its v2 tags have no GitHub Release pages.
    github: 'anomalyco/opencode', npm: '@opencode/cli',
    // Anomaly's notes blog (no RSS) is where major releases like OpenCode 2.0 are announced.
    feeds: [{
      url: 'https://anoma.ly/notes/', kind: 'blog',
      scrape: /<a href="(?<url>\/notes\/[^"]+)"[^>]*>\s*<span class="article-index-heading">(?<title>[\s\S]*?)<\/span>\s*<time[^>]*datetime="(?<date>[^"]+)"/g,
    }],
  },
  {
    id: 'amp', name: 'Amp', vendor: 'Amp', category: 'cli',
    logo: 'lobe:amp',
    site: 'https://ampcode.com', domain: 'ampcode.com', color: '#F34E3F',
    blurb: 'Frontier coding agent for the terminal and editor.',
    feeds: [{ url: 'https://ampcode.com/news.rss', kind: 'changelog' }],
  },
  {
    id: 'qwen-code', name: 'Qwen Code', vendor: 'Alibaba Qwen', category: 'cli',
    logo: 'lobe:qwen',
    site: 'https://github.com/QwenLM/qwen-code', domain: 'qwen.ai', color: '#615CED',
    blurb: 'Command-line AI workflow tool optimized for Qwen coder models.',
    github: 'QwenLM/qwen-code', tagFilter: /^v\d+\.\d+\.\d+$/,
  },
  {
    id: 'kimi-cli', name: 'Kimi CLI', vendor: 'Moonshot AI', category: 'cli', x: 'Kimi_Moonshot',
    logo: 'lobe:kimi',
    site: 'https://github.com/MoonshotAI/kimi-cli', domain: 'moonshot.ai', color: '#1783FF',
    blurb: "Moonshot AI's terminal coding agent powered by Kimi models.",
    github: 'MoonshotAI/kimi-cli',
  },
  {
    id: 'goose', name: 'Goose', vendor: 'Block', category: 'cli',
    logo: 'lobe:goose',
    site: 'https://block.github.io/goose/', domain: 'block.xyz', color: '#F5C342',
    blurb: 'Open-source, extensible AI agent that goes beyond code suggestions.',
    github: 'block/goose',
  },
  {
    id: 'crush', name: 'Crush', vendor: 'Charm', category: 'cli',
    site: 'https://charm.land', domain: 'charm.sh', color: '#FF5FD2',
    blurb: 'Glamorous AI coding agent for your favourite terminal.',
    github: 'charmbracelet/crush',
  },
  {
    id: 'openhands', name: 'OpenHands', vendor: 'All Hands AI', category: 'cli',
    logo: 'lobe:openhands',
    site: 'https://www.all-hands.dev', domain: 'all-hands.dev', color: '#FFE165',
    blurb: 'Open platform for AI software-development agents.',
    github: 'All-Hands-AI/OpenHands',
  },
  {
    id: 'aider', name: 'Aider', vendor: 'Aider', category: 'cli',
    logo: 'site',
    site: 'https://aider.chat', domain: 'aider.chat', color: '#14B014',
    blurb: 'AI pair programming in your terminal.',
    github: 'Aider-AI/aider',
  },

  // ── IDEs ────────────────────────────────────────────────
  {
    id: 'cursor', name: 'Cursor', vendor: 'Anysphere', category: 'ide',
    logo: 'lobe:cursor',
    site: 'https://cursor.com', domain: 'cursor.com', color: '#F0F0F0',
    blurb: 'The AI code editor built to make you extraordinarily productive.',
    feeds: [{ url: 'https://cursor.com/changelog/rss.xml', kind: 'changelog' }],
  },
  {
    id: 'kiro', name: 'Kiro', vendor: 'AWS', category: 'ide',
    logo: 'lobe:kiro',
    site: 'https://kiro.dev', domain: 'kiro.dev', color: '#9046FF',
    blurb: 'Agentic IDE from AWS with spec-driven development, plus Kiro CLI.',
    feeds: [{ url: 'https://kiro.dev/changelog/feed.rss', kind: 'changelog' }],
  },
  {
    id: 'antigravity', name: 'Google Antigravity', vendor: 'Google', category: 'ide',
    logo: 'lobe:antigravity',
    site: 'https://antigravity.google', domain: 'antigravity.google', color: '#34A853',
    blurb: "Google's agent-first development platform built around Gemini.",
    feeds: [{ url: 'https://blog.google/technology/developers/rss/', kind: 'blog', filter: /antigravity/i }],
  },
  {
    id: 'zed', name: 'Zed', vendor: 'Zed Industries', category: 'ide', x: 'zeddotdev',
    logo: 'simple:zedindustries',
    site: 'https://zed.dev', domain: 'zed.dev', color: '#0751CF',
    blurb: 'High-performance, multiplayer code editor with built-in AI agents.',
    github: 'zed-industries/zed',
    feeds: [{ url: 'https://zed.dev/blog.rss', kind: 'blog' }],
  },
  {
    id: 'vscode', name: 'VS Code', vendor: 'Microsoft', category: 'ide', x: 'code',
    logo: 'simple:visualstudiocode',
    site: 'https://code.visualstudio.com', domain: 'code.visualstudio.com', color: '#0098FF',
    blurb: "Microsoft's editor with Copilot agent mode built in.",
    github: 'microsoft/vscode',
    feeds: [{ url: 'https://code.visualstudio.com/feed.xml', kind: 'blog', exclude: /insiders/i }],
  },
  {
    id: 'windsurf', name: 'Windsurf', vendor: 'Cognition', category: 'ide',
    logo: 'lobe:windsurf',
    site: 'https://windsurf.com', domain: 'windsurf.com', color: '#34E8BB',
    blurb: 'Agentic IDE from Cognition (formerly Codeium).',
    feeds: [{ url: 'https://windsurf.com/feed.xml', kind: 'blog' }],
  },
  {
    id: 'trae', name: 'Trae', vendor: 'ByteDance', category: 'ide',
    logo: 'lobe:trae',
    site: 'https://www.trae.ai', domain: 'trae.ai', color: '#FF4D4F',
    blurb: 'Adaptive AI IDE from ByteDance.',
    feeds: [{ url: 'https://www.trae.ai/blog/rss.xml', kind: 'blog' }],
  },
  {
    id: 'jetbrains-ai', name: 'JetBrains AI & Junie', vendor: 'JetBrains', category: 'ide',
    logo: 'lobe:junie',
    site: 'https://www.jetbrains.com/ai/', domain: 'jetbrains.com', color: '#FF318C',
    blurb: 'AI Assistant and the Junie coding agent across JetBrains IDEs.',
    feeds: [{ url: 'https://blog.jetbrains.com/ai/feed/', kind: 'blog' }],
  },

  // ── Extensions ──────────────────────────────────────────
  {
    id: 'github-copilot', name: 'GitHub Copilot', vendor: 'GitHub', category: 'extension', x: 'github',
    logo: 'lobe:githubcopilot',
    site: 'https://github.com/features/copilot', domain: 'github.com', color: '#6E40C9',
    blurb: 'AI pair programmer across VS Code, JetBrains, Xcode and GitHub.com.',
    feeds: [
      { url: 'https://github.blog/changelog/feed/', kind: 'changelog', filter: /copilot/i },
      { url: 'https://github.blog/feed/', kind: 'blog', filter: /copilot/i },
    ],
  },
  {
    id: 'cline', name: 'Cline', vendor: 'Cline', category: 'extension',
    logo: 'lobe:cline',
    site: 'https://cline.bot', domain: 'cline.bot', color: '#E6E6E6',
    blurb: 'Autonomous coding agent for VS Code and JetBrains.',
    github: 'cline/cline', tagFilter: /^v\d+\.\d+\.\d+$/,
  },
  {
    id: 'roo-code', name: 'Roo Code', vendor: 'Roo Code', category: 'extension',
    logo: 'lobe:roocode',
    site: 'https://roocode.com', domain: 'roocode.com', color: '#B48CFF',
    blurb: 'A whole dev team of AI agents in your editor.',
    github: 'RooCodeInc/Roo-Code',
  },
  {
    id: 'kilo-code', name: 'Kilo Code', vendor: 'Kilo', category: 'extension',
    logo: 'lobe:kilocode',
    site: 'https://kilocode.ai', domain: 'kilocode.ai', color: '#F8F675',
    blurb: 'Open-source AI coding agent for VS Code, JetBrains and CLI.',
    github: 'Kilo-Org/kilocode', tagFilter: /^v\d+\.\d+\.\d+$/,
  },
  {
    id: 'continue', name: 'Continue', vendor: 'Continue', category: 'extension',
    logo: 'site',
    site: 'https://www.continue.dev', domain: 'continue.dev', color: '#BE1B55',
    blurb: 'Open-source AI code agents for IDEs and CI.',
    github: 'continuedev/continue',
  },
  {
    id: 'augment', name: 'Augment Code', vendor: 'Augment', category: 'extension',
    logo: 'site',
    site: 'https://www.augmentcode.com', domain: 'augmentcode.com', color: '#5EE5A0',
    blurb: 'AI coding agent with deep codebase context.',
    feeds: [{ url: 'https://www.augmentcode.com/blog/rss.xml', kind: 'blog' }],
  },
];

// Auto-discovery of trending open-source tools in the same niche (see discover.mjs).
// allow: repos to always include if they ship releases · deny: repos to never include.
export const DISCOVERY = {
  minStars: 1000,
  maxIdleDays: 30,       // must have been pushed to recently
  maxReleaseAgeDays: 60, // must have shipped a stable GitHub Release recently
  keepDays: 14,          // keep a tool this long after it stops qualifying (avoids churn)
  topics: ['coding-agent', 'ai-coding', 'ai-coding-assistant', 'coding-assistant', 'agentic-coding', 'ai-ide', 'code-assistant', 'ai-pair-programming', 'terminal-agent', 'ai-code-editor'],
  allow: [],
  deny: ['the-open-agent/openagent'],
  // Display names where the repo name doesn't read well.
  names: {
    'openinterpreter/openinterpreter': 'Open Interpreter', 'omnirush-ai/omnirush-gui': 'OmniRush',
    'langchain-ai/open-swe': 'Open SWE', 'editor-code-assistant/eca': 'ECA', 'momozi1996/momo-code': 'MOMO Code',
    'fuxicodex/fuxi': 'FuXi', 'minimax-ai/minimax-code': 'MiniMax Code', 'vastsa/pi-desktop': 'PI Desktop',
  },
};

// Title patterns that tie a Hacker News story to a tool (kept strict to avoid false matches).
export const HN_MATCH = {
  'claude-code': /claude code/i,
  codex: /\bcodex\b/i,
  'gemini-cli': /gemini cli|gemini code assist/i,
  'copilot-cli': /copilot cli/i,
  opencode: /\bopencode\b/i,
  amp: /ampcode|\bamp\b.*\b(agent|coding)\b/i,
  'qwen-code': /qwen ?code|qwen\d?-coder/i,
  'kimi-cli': /\bkimi\b/i,
  goose: /block'?s goose|\bgoose\b.*\b(agent|ai)\b/i,
  crush: /charm.*\bcrush\b|\bcrush\b.*\b(agent|terminal)\b/i,
  openhands: /openhands/i,
  aider: /\baider\b/i,
  cursor: /^cursor\b|\bcursor('s)? (agent|composer|tab|rules|bugbot|ide|editor|cli|\d)|cursor\.com|anysphere/i,
  kiro: /\bkiro\b/i,
  antigravity: /antigravity/i,
  zed: /\bzed\b/i,
  vscode: /\bvs ?code\b|visual studio code/i,
  windsurf: /windsurf|codeium/i,
  trae: /\btrae\b/i,
  'jetbrains-ai': /\bjunie\b|jetbrains ai/i,
  'github-copilot': /github copilot|copilot (agent|coding|workspace|chat)/i,
  cline: /\bcline\b/i,
  'roo-code': /roo ?code/i,
  'kilo-code': /kilo ?code/i,
  continue: /continue\.dev/i,
  augment: /augment ?code/i,
};

// Community discussion: Hacker News stories mentioning any tool (via the Algolia HN API).
export const HN_QUERIES = [
  'Claude Code', 'Codex CLI', 'OpenAI Codex', 'Gemini CLI', 'Cursor', 'Windsurf', 'Kiro', 'Zed',
  'Copilot', 'OpenCode', 'Cline', 'Aider', 'Amp', 'Goose', 'Qwen Code', 'Kimi', 'Junie', 'Antigravity',
  'Roo Code', 'Kilo Code', 'Trae', 'Crush', 'AI coding agent', 'AI IDE',
];
