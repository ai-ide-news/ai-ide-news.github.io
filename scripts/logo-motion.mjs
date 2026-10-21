// Logo motion per icon id. Each entry names a motion defined in src/styles.css ("Logo motion")
// plus optional CSS vars; the hero (xl) tile loops it, smaller tiles play it on hover.
// Few brands publish a logo animation, so each note says what the motion is based on:
// "in-product" = recreates motion the brand itself uses; "shape" = derived from the mark; "mascot" = character act.
// Turns use the mark's rotational symmetry (--turn) so the loop lands on an identical pose.

export const LOGO_MOTION = {
  // ── AI labs ──
  'lab-openai': ['turn', { turn: '60deg' }], // shape: 6-fold knot, ratchets one sixth
  'lab-anthropic': ['ink'], // shape: A\ written on behind a clay pen edge, then a clay sweep
  'lab-google': ['twinkle'], // in-product: Gemini's sparkle turns and twinkles while it responds
  'lab-meta': ['draw'], // in-product: Meta's 2021 rebrand traces the infinity loop as one line
  'lab-microsoft': ['quad'], // in-product: the 2012 logo reveal brings the four squares in one by one
  'lab-xai': ['glitch'], // shape: hard-edged X slash, a quick signal glitch
  'lab-z-ai': ['glitch'], // shape: angular Z
  'lab-deepseek': ['swim'], // mascot: the whale swims
  'lab-qwen': ['turn', { turn: '120deg' }], // shape: 3-fold star
  'lab-mistral': ['build'], // shape: pixel M stacks up row by row
  'lab-moonshot-ai': ['pulse'], // shape: the moon dot glows
  'lab-minimax': ['eq'], // shape: audio waveform bounces
  'lab-bytedance': ['eq'], // shape: bar chart bounces
  'lab-amazon': ['twinkle'], // shape: Nova star twinkles
  'lab-cohere': ['breathe'], // shape: soft blobs breathe
  'lab-nvidia': ['shine'], // shape: glossy eye catches a light sweep
  'lab-tencent': ['spin'], // shape: Hunyuan swirl turns
  'lab-stepfun': ['climb'], // shape: stairs, steps up
  'lab-xiaomi': ['shine'], // shape: MiMo wordmark

  // ── Anthropic / OpenAI / Google products ──
  'claude-desktop': ['spin'], // in-product: Claude's spark spins while it thinks
  'claude-code': ['scuttle'], // mascot: Clawd the crab walks sideways
  codex: ['float'], // shape: cloud with a prompt, drifts
  'codex-app': ['float'],
  'gemini-cli': ['type'], // shape: terminal prompt types in
  'qwen-code': ['turn', { turn: '120deg' }], // shape: Qwen's 3-fold star
  'kimi-cli': ['pulse'], // shape: Kimi's moon dot glows
  jules: ['wiggle'], // mascot: the octopus wiggles
  antigravity: ['lift'], // shape: the arch lifts off, anti-gravity

  // ── Editors & IDEs ──
  cursor: ['turn', { turn: '120deg' }], // shape: cube silhouette is 3-fold
  windsurf: ['zip'], // shape: wave mark rides out and back in
  vscode: ['flip'], // shape: ribbon flips like a card
  zed: ['draw'], // shape: Z drawn on
  kiro: ['float'], // mascot: the ghost hovers
  trae: ['pulse'], // shape: screen face
  'jetbrains-ai': ['hop'], // shape: Junie blocks
  qoder: ['spin'], // shape: Q ring
  conductor: ['flip'], // shape: app tile
  warp: ['zip'], // shape: warp jump
  lovable: ['beat'], // shape: heart beats
  replit: ['build'], // shape: stacked blocks
  devin: ['spin'], // shape: hex cluster
  v0: ['draw'], // shape: wordmark drawn on

  // ── Coding agents & CLIs ──
  'github-copilot': ['peek'], // mascot: Copilot head tilts and nods
  'copilot-cli': ['peek'],
  cline: ['hop'], // mascot: robot hops
  goose: ['flap'], // mascot: the goose flaps
  'gh-vercel-labs-fx': ['turn', { turn: '120deg' }], // shape: Vercel triangle, 3-fold
  opencode: ['breathe'], // shape: frame
  amp: ['zip'], // shape: forward arrows fly through
  'kilo-code': ['type'], // shape: monospace grid
  'roo-code': ['hop'], // mascot: the kangaroo hops
  augment: ['peek'], // shape: bracket face
  'command-code': ['turn', { turn: '90deg' }], // shape: ⌘ is 4-fold
  'factory-droid': ['flip'], // shape: app tile (the flower sits on a square, so it flips rather than turns)
  codebuff: ['type'], // shape: terminal prompt
  openhands: ['wave'], // mascot: hands wave
  aider: ['build'], // shape: pixel a (full-bleed avatar, so it builds in place instead of moving)
  continue: ['shine'], // full-bleed avatar: rotating it would expose the tile corners
  crush: ['shine'], // shape: glossy avatar
  'gh-mistralai-mistral-vibe': ['build'], // shape: pixel M
  'gh-minimax-ai-minimax-code': ['eq'], // shape: waveform
  'gh-zai-org-zcode': ['glitch'], // shape: angular Z
  'gh-esengine-deepseek-reasonix': ['flip'], // shape: app tile
  'gh-omnirush-ai-omnirush-gui': ['spin'], // shape: swirl ring
  'gh-langchain-ai-open-swe': ['shine'],
  'gh-editor-code-assistant-eca': ['shine'],
  'gh-can1357-oh-my-pi': ['flip'],
  'gh-earendil-works-pi': ['build'], // shape: pixel blocks
  'gh-1jehuang-jcode': ['spin'], // shape: sphere
  'gh-vastsa-pi-desktop': ['flip'],
  'gh-hkuds-deepcode': ['shine'],
  'gh-superset-sh-superset': ['type'], // shape: code brackets
  'gh-stagewise-io-stagewise': ['flip'], // shape: app tile
  'gh-openinterpreter-openinterpreter': ['breathe'], // shape: circle
  'gh-nano-collective-nanocoder': ['glitch'], // shape: blocky NC
  'gh-anus-dev-anus': ['shine'], // full-bleed avatar
  'gh-twinnydotdev-twinny': ['shine'], // full-bleed avatar
};
