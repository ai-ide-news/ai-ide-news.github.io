// Free and paid plans for every curated tool, hand-checked against each vendor's pricing page.
// price: USD per month (0 = free, null = custom/contact sales). seat: priced per user. from: starting price.
// since: when the plan (or the tier it was renamed from) first launched, 'YYYY-MM' — left out where unknown.
// Tools without an entry (e.g. auto-discovered GitHub projects) are treated as free & open source.

export const PRICING_CHECKED = '2026-10-18';

const BYOK = { name: 'Open source', price: 0, note: 'Bring your own API key or run local models' };

export const PRICING = {
  'claude-code': {
    url: 'https://claude.com/pricing',
    plans: [
      { name: 'Free', price: 0, note: 'Claude chat only — no Claude Code', since: '2023-07' },
      { name: 'Pro', price: 20, note: 'Claude Code included · $17/mo billed yearly', since: '2023-09' },
      { name: 'Max', price: 100, from: true, note: '5× or 20× Pro usage', since: '2025-04' },
      { name: 'Team', price: 25, seat: true, note: 'Premium seat $125 · annual billing cheaper', since: '2024-05' },
      { name: 'Enterprise', price: 20, seat: true, note: 'Plus usage at API rates · 20-seat minimum', since: '2024-09' },
    ],
  },
  codex: {
    url: 'https://chatgpt.com/codex/pricing/',
    plans: [
      { name: 'Free', price: 0, note: 'Limited Codex usage with a ChatGPT account', since: '2022-11' },
      { name: 'Go', price: 8, note: 'Regional pricing', since: '2025-08' },
      { name: 'Plus', price: 20, note: 'Codex in CLI, IDE and cloud', since: '2023-02' },
      { name: 'Pro', price: 100, from: true, note: 'Higher limits · $100 / $200 / $500 tiers', since: '2024-12' },
      { name: 'Business', price: 25, seat: true, note: '$20/seat billed yearly', since: '2024-01' },
      { name: 'Enterprise', price: null, since: '2023-08' },
    ],
  },
  'gemini-cli': {
    url: 'https://geminicli.com/docs/quota-and-pricing/',
    plans: [
      { name: 'Open source', price: 0, note: 'Gemini API key, pay-as-you-go', since: '2025-06' },
      { name: 'Google AI Pro', price: 19.99, since: '2025-05' },
      { name: 'Google AI Ultra', price: 99.99, from: true, note: '$99.99 or $199.99 tiers', since: '2025-05' },
      { name: 'Code Assist Standard', price: 19, seat: true },
      { name: 'Code Assist Enterprise', price: 45, seat: true },
    ],
  },
  'copilot-cli': { same: 'github-copilot' },
  opencode: {
    url: 'https://opencode.ai/go',
    plans: [
      { ...BYOK, note: 'Any provider, plus limited-time free models' },
      { name: 'Go', price: 10, note: 'Curated open models with generous limits' },
      { name: 'Go Plus', price: 40, note: 'Higher limits' },
    ],
  },
  amp: {
    url: 'https://ampcode.com/pricing',
    plans: [
      { name: 'Hobby', price: 0, note: 'BYOK or your existing ChatGPT/Claude subscriptions' },
      { name: 'Individual', price: 20, note: '45,000 minutes of cloud runner time' },
      { name: 'Teams', price: 0, note: 'No extra charge · pooled credits, SSO' },
      { name: 'Enterprise', price: null },
    ],
  },
  'qwen-code': {
    url: 'https://github.com/QwenLM/qwen-code',
    plans: [
      { ...BYOK, note: 'Free Qwen OAuth tier closed Apr 2026 — use an API key or local models' },
      { name: 'Coding Plan Pro', price: 50, note: 'Alibaba Cloud Model Studio' },
    ],
  },
  'kimi-cli': {
    url: 'https://www.kimi.com/membership/pricing',
    plans: [
      { ...BYOK, note: 'CLI is MIT-licensed · Moonshot API pay-as-you-go' },
      { name: 'Moderato', price: 19, note: 'Entry Kimi Code membership' },
      { name: 'Allegretto', price: 39 },
      { name: 'Allegro', price: 99 },
      { name: 'Vivace', price: 199 },
    ],
  },
  goose: { url: 'https://block.github.io/goose/', plans: [BYOK] },
  crush: { url: 'https://charm.land', plans: [BYOK] },
  openhands: {
    url: 'https://www.openhands.dev/pricing',
    plans: [
      { name: 'Local', price: 0, note: 'Open source GUI, TUI and CLI' },
      { name: 'Individual (cloud)', price: 0, note: 'BYOK or models at cost · 10 conversations/day' },
      { name: 'Enterprise', price: null, note: 'SaaS or self-hosted' },
    ],
  },
  aider: { url: 'https://aider.chat', plans: [BYOK] },
  'factory-droid': {
    url: 'https://factory.ai/pricing',
    plans: [
      { name: 'Pro', price: 20, note: 'Desktop, CLI and SDK · cloud and local agents' },
      { name: 'Plus', price: 100, note: '~5× Pro usage · managed cloud computers' },
      { name: 'Max', price: 200, note: '~10× Pro usage' },
      { name: 'Teams', price: 40, seat: true, note: 'Plus $60/mo team fee · up to 10 seats' },
      { name: 'Enterprise', price: null },
    ],
  },
  'command-code': {
    url: 'https://commandcode.ai/pricing',
    plans: [
      { name: 'Go', price: 1, note: '$10 credits · open models' },
      { name: 'GOAT', price: 10, note: '$80 credits, mostly open models' },
      { name: 'Pro', price: 20, note: '$80 credits incl. premium models' },
      { name: 'Max', price: 100, from: true, note: '$150 or $300 credits · $100 / $200 tiers' },
      { name: 'Teams', price: 40, note: 'Pooled credits for one team' },
      { name: 'Enterprise', price: null },
    ],
  },
  codebuff: {
    url: 'https://www.codebuff.com/pricing',
    plans: [
      { name: 'Pay as you go', price: 0, note: '1¢ per credit, no subscription' },
      { name: 'Subscription', price: 100, from: true, note: '$100 / $200 / $500 tiers' },
    ],
  },
  qoder: {
    url: 'https://docs.qoder.com/account/pricing',
    plans: [
      { name: 'Free', price: 0, note: 'Basic models with limited messages' },
      { name: 'Pro', price: 20, note: '2,000 credits/mo' },
      { name: 'Pro+', price: 60, note: '6,000 credits/mo' },
      { name: 'Ultra', price: 200, note: '20,000 credits/mo' },
      { name: 'Teams', price: 40, seat: true, note: '3,000 credits per seat' },
    ],
  },
  cursor: {
    url: 'https://cursor.com/pricing',
    plans: [
      { name: 'Free', price: 0, note: 'Limited agent and chat requests', since: '2023-03' },
      { name: 'Plus', price: 8, note: 'Shared usage pool, Grok models', since: '2026-10' },
      { name: 'Premium', price: 30, note: '4× Plus usage', since: '2026-10' },
      { name: 'Super', price: 100, note: '15× Plus usage', since: '2026-10' },
      { name: 'Ultra', price: 200, note: '50× Plus usage', since: '2025-06' },
      { name: 'Teams', price: 30, seat: true, from: true, note: 'Pooled usage, admin tools' },
    ],
  },
  kiro: {
    url: 'https://kiro.dev/pricing/',
    plans: [
      { name: 'Free', price: 0, note: '50 credits/mo', since: '2025-08' },
      { name: 'Pro', price: 20, note: '1,000 credits/mo', since: '2025-08' },
      { name: 'Pro+', price: 40, note: '2,000 credits/mo', since: '2025-08' },
      { name: 'Pro Max', price: 100, note: '5,000 credits/mo', since: '2026-06' },
      { name: 'Power', price: 200, note: '10,000 credits/mo', since: '2025-08' },
    ],
  },
  antigravity: {
    url: 'https://antigravity.google/pricing',
    plans: [
      { name: 'Individuals', price: 0, note: 'Weekly rate limits · unlimited Tab completions', since: '2025-11' },
      { name: 'Google AI Pro', price: 19.99, note: 'Higher rate limits', since: '2025-05' },
      { name: 'Google AI Ultra', price: 99.99, from: true, note: 'Highest rate limits', since: '2025-05' },
      { name: 'Business', price: 30, seat: true, from: true, note: 'Via Google Cloud · pay-as-you-go option' },
    ],
  },
  zed: {
    url: 'https://zed.dev/pricing',
    plans: [
      { name: 'Personal', price: 0, note: 'Full editor with your own keys or external agents' },
      { name: 'Pro', price: 10, note: 'Unlimited edit predictions + $5 tokens' },
      { name: 'Business', price: 30, seat: true },
    ],
  },
  vscode: { same: 'github-copilot', note: 'VS Code is free; built-in AI uses your GitHub Copilot plan or your own key.' },
  windsurf: {
    url: 'https://windsurf.com/pricing',
    plans: [
      { name: 'Free', price: 0, note: 'Light agent quota · unlimited Tab', since: '2024-11' },
      { name: 'Pro', price: 20, note: 'Daily/weekly quotas', since: '2024-11' },
      { name: 'Max', price: 200, note: 'Much higher quotas' },
      { name: 'Teams', price: 40, seat: true, note: 'Plus $80/mo team fee' },
      { name: 'Enterprise', price: null },
    ],
  },
  trae: {
    url: 'https://www.trae.ai/pricing',
    plans: [
      { name: 'Free', price: 0, note: 'Auto mode · 5,000 autocompletes/mo', since: '2025-01' },
      { name: 'Pro', price: 20, note: '$20 usage/mo · all models' },
      { name: 'Pro+', price: 60, note: '$60 usage/mo' },
      { name: 'Ultra', price: 200, note: '$200 usage/mo' },
    ],
  },
  'jetbrains-ai': {
    url: 'https://www.jetbrains.com/ai-ides/buy/',
    plans: [
      { name: 'AI Free', price: 0, note: 'Unlimited local completion · small credit quota', since: '2025-04' },
      { name: 'AI Pro', price: 10, note: '10 AI credits/mo', since: '2023-12' },
      { name: 'AI Ultimate', price: 30, note: '35 AI credits/mo', since: '2025-04' },
      { name: 'AI Enterprise', price: 60, seat: true },
    ],
  },
  'github-copilot': {
    url: 'https://github.com/features/copilot/plans',
    plans: [
      { name: 'Free', price: 0, note: '2,000 completions + 50 chats/mo', since: '2024-12' },
      { name: 'Pro', price: 10, note: '$15 of AI credits incl. flex', since: '2022-06' },
      { name: 'Pro+', price: 39, note: '$70 of AI credits incl. flex', since: '2025-04' },
      { name: 'Max', price: 100, note: '$200 of AI credits incl. flex', since: '2026-06' },
    ],
  },
  cline: {
    url: 'https://cline.bot/pricing',
    plans: [
      { ...BYOK, note: 'VS Code + CLI · inference at cost or BYOK', since: '2024-07' },
      { name: 'Enterprise', price: null, note: 'JetBrains, SSO, team dashboard' },
    ],
  },
  'roo-code': {
    url: 'https://roomote.dev/',
    plans: [
      { ...BYOK, note: 'Extension is free · Roomote self-hosted free up to 10 users' },
      { name: 'Roomote Cloud', price: 49, note: 'Up to 10 users · flat price' },
      { name: 'Roomote Cloud 50', price: 249, note: '11–50 users' },
    ],
  },
  'kilo-code': {
    url: 'https://kilo.ai/pricing',
    plans: [
      { ...BYOK, note: 'Free models, BYOK, local, or pay-as-you-go gateway' },
      { name: 'Kilo Pass Starter', price: 19, note: 'Up to $26.60 credits/mo' },
      { name: 'Kilo Pass Pro', price: 49, note: 'Up to $68.60 credits/mo' },
      { name: 'Kilo Pass Expert', price: 199, note: 'Up to $278.60 credits/mo' },
      { name: 'Teams', price: 15, seat: true },
    ],
  },
  continue: {
    url: 'https://www.continue.dev/pricing',
    plans: [
      { ...BYOK, note: 'Extension is free with your own models' },
      { name: 'Team', price: 20, seat: true, note: '$10 credits per seat' },
      { name: 'Company', price: null },
    ],
  },
  augment: {
    url: 'https://www.augmentcode.com/pricing',
    plans: [
      { name: 'Standard', price: 20, note: '$20 usage/mo · up to 50 seats, flat', since: '2026-09' },
      { name: 'Business', price: 100, note: '$100 usage/mo · up to 50 seats, flat' },
      { name: 'Enterprise', price: null },
    ],
  },
  devin: {
    url: 'https://devin.ai/pricing',
    plans: [
      { name: 'Free', price: 0, note: 'Limited usage', since: '2026-04' },
      { name: 'Pro', price: 20, since: '2026-04' },
      { name: 'Max', price: 200, since: '2026-04' },
      { name: 'Teams', price: 40, seat: true, note: 'Plus $80/mo team fee', since: '2026-04' },
      { name: 'Enterprise', price: null },
    ],
  },
  jules: {
    url: 'https://jules.google',
    plans: [
      { name: 'Free', price: 0, note: '15 tasks/day · 3 at a time' },
      { name: 'Google AI Pro', price: 19.99, note: '100 tasks/day · 15 at a time' },
      { name: 'Google AI Ultra', price: null, note: '300 tasks/day · 60 at a time' },
    ],
  },
  lovable: {
    url: 'https://lovable.dev/pricing',
    plans: [
      { name: 'Free', price: 0, note: '5 daily credits · public projects' },
      { name: 'Pro', price: 25, from: true, note: '100+ credits/mo · $21/mo billed yearly' },
      { name: 'Business', price: 50, from: true, note: 'SSO, private projects · $42/mo billed yearly' },
      { name: 'Enterprise', price: null },
    ],
  },
  replit: {
    url: 'https://replit.com/pricing',
    plans: [
      { name: 'Core', price: 20, note: '$20 usage/mo · $18/mo billed yearly' },
      { name: 'Pro', price: 100, note: '$100 usage/mo · 10 parallel agents · $90/mo billed yearly' },
      { name: 'Enterprise', price: null },
    ],
  },
  v0: {
    url: 'https://v0.app/pricing',
    plans: [
      { name: 'Free', price: 0, note: '7 messages/day · deploy to Vercel' },
      { name: 'Plus', price: 30, seat: true, note: '$30 credits per user' },
      { name: 'Business', price: 100, seat: true, note: 'Training opt-out by default' },
      { name: 'Enterprise', price: null },
    ],
  },
};

// Resolve a tool's plans (following `same` links); unknown tools default to free & open source.
export function pricingFor(id, { discovered = false } = {}) {
  const p = PRICING[id];
  if (!p) return discovered ? { url: null, plans: [BYOK], openSource: true } : null;
  if (p.same) return { ...PRICING[p.same], note: p.note, via: p.same };
  return p;
}
