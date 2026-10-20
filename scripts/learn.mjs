// "Learn" page: plain-language explainers, each with an interactive demo, and worked examples
// computed from the live model catalog so the numbers stay real.
// Narration is pre-recorded with Magnific text-to-speech (scripts/learn-narration.mjs →
// static/audio/learn/); src/learn.js plays it, and falls back to the browser's own voice when a
// recording is missing or out of date. While a recording plays, each chapter's demo acts out what
// the narrator is saying, cued from the word timings in static/audio/learn/captions.json.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { narration } from './learn-narration.mjs';

const fmt = (n) => n.toLocaleString('en-US');
const money = (n) => `$${n >= 100 ? n.toFixed(0) : n >= 0.1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4)}`;
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const per = (n) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
const params = (b) => (b >= 1000 ? `${+(b / 1000).toFixed(2)}T` : `${+b.toFixed(1)}B`);
const saidParams = (b) => (b >= 1000 ? `${+(b / 1000).toFixed(2)} trillion` : `${+b.toFixed(1)} billion`);
const play = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg>';

// Recordings whose text still matches the narration script (manifest maps id → { hash, seconds }).
const AUDIO_DIR = new URL('../static/audio/learn/', import.meta.url);
export const narrationHash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12);
function recordings() {
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(new URL('manifest.json', AUDIO_DIR), 'utf8')); } catch { /* none yet */ }
  const ok = {}, stale = [];
  for (const [id, text] of Object.entries(narration)) {
    const entry = manifest[id];
    if (!entry || !existsSync(new URL(`${id}.mp3`, AUDIO_DIR))) continue;
    if (entry.hash === narrationHash(text)) ok[id] = entry; else stale.push(id);
  }
  if (stale.length) console.warn(`learn: narration changed since recording for ${stale.join(', ')}; using browser speech there`);
  return ok;
}

// Mixture-of-experts sizes, from names like "Qwen3.6 35B A3B" or summaries like "27B active / 600B total".
function moeSize(m) {
  const n = m.name.match(/(\d+(?:\.\d+)?)([BT])[ -]A(\d+(?:\.\d+)?)B\b/);
  if (n) return { total: +n[1] * (n[2] === 'T' ? 1000 : 1), active: +n[3] };
  const s = (m.summary || '').match(/(\d+(?:\.\d+)?)\s*B\s+(?:active|activated)[^\d]{0,40}?(\d+(?:\.\d+)?)\s*([BT])\s+total/i)
    || (m.summary || '').match(/(\d+(?:\.\d+)?)\s*([BT])\s+total parameters and (\d+(?:\.\d+)?)\s*B\s+activated/i);
  if (!s) return null;
  return s[3] && /[BT]/.test(s[3])
    ? { active: +s[1], total: +s[2] * (s[3] === 'T' ? 1000 : 1) }
    : { total: +s[1] * (s[2] === 'T' ? 1000 : 1), active: +s[3] };
}

// The provider a model's headline price comes from, when it publishes a cache-read price.
function cachedProvider(m) {
  const ps = (m.providers || []).filter((p) => p.cacheRead != null && p.input > 0 && p.cacheRead < p.input);
  return ps.find((p) => p.name === m.lab || p.name.startsWith(m.lab.split(' ')[0])) || ps.find((p) => p.input === m.input) || ps[0];
}

export const LEARN_SECTIONS = [
  ['what', 'What is AI?'], ['how', 'How a model answers'], ['tokens', 'Tokens'], ['context', 'Context window'],
  ['prompts', 'System prompts'], ['cache', 'Cache hits'], ['reasoning', 'Reasoning tokens'], ['tools', 'Tools & agents'],
  ['mcp', 'MCP'], ['embeddings', 'Embeddings & RAG'], ['hallucinations', 'Hallucinations'], ['training', 'How models are trained'],
  ['moe', 'Mixture of experts'], ['quant', 'Quantization'], ['weights', 'Open vs. closed weights'], ['multimodal', 'Multimodal'],
  ['speed', 'Speed'], ['benchmarks', 'Benchmarks'],
];

export function learnBody({ models, root, esc, modelPath, generatedAt, bench }) {
  const link = (m) => `<a href="${root}${modelPath(m)}">${esc(m.name)}</a>`;
  const prefer = (names, ok) => names.map((n) => models.find((m) => m.name === n)).find((m) => m && ok(m)) || models.find(ok);
  const audio = recordings();

  // Tokens & prices
  const tokM = prefer(['Claude Sonnet 5.5', 'GPT-6.1 Sol', 'Gemini 4 Argon'], (m) => m.input > 0 && m.output > 0);
  const cheap = models.filter((m) => m.input > 0 && m.context >= 128000).sort((a, b) => a.input - b.input)[0];
  // Context
  const ctxTop = [...models].sort((a, b) => b.context - a.context || b.date.localeCompare(a.date))[0];
  const million = models.filter((m) => m.context >= 1e6).length;
  // Caching
  const cacheM = prefer(['Claude Sonnet 5.5', 'GPT-6.1 Sol', 'Claude Opus 5.5'], (m) => !!cachedProvider(m));
  const cp = cacheM && cachedProvider(cacheM);
  const turns = 40, prefix = 60000, fresh = 2000, outTok = 1000;
  const noCache = cp && (turns * (prefix + fresh) * cp.input + turns * outTok * cp.output) / 1e6;
  const withCache = cp && ((prefix + fresh) * cp.input + (turns - 1) * (prefix * cp.cacheRead + fresh * cp.input) + turns * outTok * cp.output) / 1e6;
  const cacheOff = cp && Math.round((1 - cp.cacheRead / cp.input) * 100);
  // Mixture of experts
  const seen = new Set();
  const moes = models.map((m) => ({ m, s: moeSize(m) })).filter(({ m, s }) => s && s.active < s.total && !seen.has(m.labId + Math.round(s.total)) && seen.add(m.labId + Math.round(s.total)))
    .sort((a, b) => b.s.total - a.s.total).slice(0, 6);
  const moeCount = models.filter((m) => moeSize(m) || /mixture[- ]of[- ]experts/i.test(m.summary || '')).length;
  const moeTop = moes[0];
  // Reasoning
  const reasoners = models.filter((m) => m.reasoning).length;
  const pricey = prefer(['Claude Opus 5.5', 'GPT-6.1 Sol', 'Claude Sonnet 5.5'], (m) => m.output > 0);
  // Tools
  const toolCount = models.filter((m) => m.tools).length;
  // Quantization
  const quants = {};
  for (const m of models) for (const p of m.providers || []) if (p.quant) quants[p.quant] = (quants[p.quant] || 0) + 1;
  const qList = Object.entries(quants).sort((a, b) => b[1] - a[1]);
  const qModel = models.find((m) => new Set((m.providers || []).map((p) => p.quant).filter(Boolean)).size >= 2);
  const qProv = qModel && [...new Map((qModel.providers || []).filter((p) => p.quant).map((p) => [p.quant, p])).values()].slice(0, 4);
  // Open vs closed
  const open = models.filter((m) => m.openWeights), closed = models.filter((m) => !m.openWeights);
  const openLabs = Object.entries(open.reduce((a, m) => ((a[m.lab] = (a[m.lab] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const hostCount = (m) => new Set((m.providers || []).map((p) => p.name)).size;
  const mostHosted = [...open].sort((a, b) => hostCount(b) - hostCount(a))[0];
  // Multimodal
  const MODAL = { text: 'Text', image: 'Images', file: 'Files & PDFs', audio: 'Audio', video: 'Video' };
  const modal = Object.keys(MODAL).map((k) => [k, models.filter((m) => (m.modalities || ['text']).includes(k)).length]);
  // Benchmarks: top tracked models on a few well-known tests
  const benchSets = bench ? ['swe', 'gpqa', 'hle', 'arc2'].map((id) => {
    const b = bench.list.find((x) => x.id === id);
    const rows = models.map((m) => ({ m, v: bench.scores[bench.key(m.id)]?.[id] })).filter((r) => r.v != null)
      .sort((a, b) => b.v - a.v).filter((r, i, a) => a.findIndex((x) => bench.key(x.m.id) === bench.key(r.m.id)) === i).slice(0, 6);
    return b && rows.length >= 3 ? { b, rows } : null;
  }).filter(Boolean) : [];

  const sections = LEARN_SECTIONS.filter(([id]) => id !== 'cache' || cp);
  const num = (id) => sections.findIndex((s) => s[0] === id) + 1;
  const title = (id) => sections.find((s) => s[0] === id)[1];
  const head = (id, t, em) => `<div class="lhead"><p class="eyebrow">${String(num(id)).padStart(2, '0')} · ${esc(title(id))}</p><h2>${t} <em>${em}</em></h2><button type="button" class="btn ghost lplay" data-play="${id}" aria-label="Listen to “${esc(title(id))}”">${play}<span>Listen</span>${audio[id] ? `<small>${Math.max(1, Math.round(audio[id].seconds / 60))} min</small>` : ''}</button></div>`;
  const sec = (id, body) => `<section class="lsec" id="${id}" data-title="${esc(title(id))}"${audio[id] ? ` data-audio="${root}audio/learn/${id}.mp3"` : ''}>\n${body}\n</section>`;
  // Interactive demo card. Skipped by the read-aloud fallback (the recordings describe them instead).
  const demo = (id, label, inner, cap = '') => `<figure class="lw no-say" id="w-${id}"><div class="lw-top"><span class="lw-tag">Try it</span><span class="lw-label">${label}</span></div><div class="lw-body">${inner}</div>${cap ? `<figcaption class="lw-cap">${cap}</figcaption>` : ''}</figure>`;
  const minutes = Math.round(Object.values(audio).reduce((a, r) => a + r.seconds, 0) / 60) || Math.round(sections.length * 1.2);
  const recorded = Object.keys(audio).length;

  return `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Learn</p>
  <h1>How AI <em>actually</em> works</h1>
  <p class="lede">A plain-language guide to the words you see on every model page — tokens, context windows, cache hits, agents, MCP, mixture of experts — with a hands-on demo in every chapter and real examples from the ${fmt(models.length)} models we track.</p>
  <div class="lhero-actions">
    <button type="button" class="btn lplay" data-play="all">${play}<span>Listen to the whole guide</span></button>
    <span class="muted small">${sections.length} chapters · about ${minutes} minutes${recorded ? ' · narrated audio' : " · uses your device's built-in voices"}</span>
  </div>
</section>

<div class="wrap learn">
<nav class="ltoc no-say" aria-label="On this page">
  <p class="eyebrow">On this page</p>
  <ol>${sections.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol>
</nav>

<article class="lbody">

${sec('what', `  ${head('what', 'What is', 'AI?')}
  <p><strong>Artificial intelligence</strong> is software that learns patterns from examples instead of following rules a person wrote by hand. A spam filter that has seen millions of emails learns what spam looks like; nobody types in every rule.</p>
  <p>The AI in coding tools is a <strong>large language model</strong>, or LLM. It was trained by reading a huge amount of text and code — books, websites, documentation, open-source repositories — and adjusting billions of internal numbers, called <strong>parameters</strong>, until it got very good at one task: guessing what text comes next.</p>
  <p>That sounds small, but to guess the next line of a program well, a model has to pick up grammar, facts, the rules of programming languages and a working sense of how problems are solved. Everything it does — answering questions, writing code, fixing bugs — is built on that one skill.</p>
  <div class="lcallout"><p class="eyebrow">Real example</p><p>Every model on our <a href="${root}models/">Models page</a> is an LLM. ${link(tokM)} by ${esc(tokM.lab)}, for example, is listed as supporting ${tokM.modalities?.length > 1 ? `${esc(list(tokM.modalities))} input` : 'text input'}${tokM.reasoning ? ', step-by-step reasoning' : ''}${tokM.tools ? ' and tool calling — the ability to run commands, read files and search, which is what turns a chatbot into a coding agent' : ''}.</p></div>`)}

${sec('how', `  ${head('how', 'How a model', 'answers')}
  <p>Building a model happens in two stages. <strong>Training</strong> is the expensive part: thousands of chips run for weeks while the model reads its data and its parameters are tuned. After that, the model is frozen. <strong>Inference</strong> is what happens when you use it: your text goes in, and the model produces an answer one small piece at a time.</p>
  <p>At every step the model looks at everything so far and gives each possible next piece a probability. One is picked, added to the text, and the whole thing repeats until the answer is finished. That is why answers stream onto the screen word by word.</p>
  <p>A setting called <strong>temperature</strong> controls how adventurous that pick is. Low temperature almost always takes the top choice, which suits code. Higher temperature lets less likely words through, which suits brainstorming.</p>
  ${demo('temp', 'Next-token sampler', `
    <p class="lprompt"><span>The best language for a quick script is</span> <b class="lw-pick" id="tp-pick"></b><span class="lcaret"></span></p>
    <ul class="lprobs" id="tp-probs"></ul>
    <div class="lw-row">
      <label class="lw-slider"><span>Temperature <b id="tp-tv">0.7</b></span><input type="range" id="tp-t" min="0" max="2" step="0.05" value="0.7"></label>
      <button type="button" class="btn" id="tp-one">Pick next token</button>
      <button type="button" class="btn ghost" id="tp-many">Pick 50 times</button>
    </div>`, 'Illustrative odds. At temperature 0 the top choice always wins; turn it up and the long tail starts getting picked.')}`)}

${sec('tokens', `  ${head('tokens', 'What are', 'tokens?')}
  <p>Models don't read letters or whole words. They read <strong>tokens</strong>: chunks of text, often a word, part of a word, or a symbol. Common words like “the” are one token; a rare word like “tokenization” might be split into “token” and “ization”. In English, one token is about four characters, or roughly three quarters of a word. Code usually uses more tokens per line, because of symbols and indentation.</p>
  <p>Tokens matter because they are how models are <strong>measured and billed</strong>. Prices are quoted per million tokens, with separate prices for what you send in, called input, and what the model writes back, called output. Output is usually several times more expensive.</p>
  ${demo('tok', 'Token counter', `
    <label class="eyebrow" for="tokin">Type anything</label>
    <textarea id="tokin" rows="3" spellcheck="false">Patchwire tracks AI coding tools. function add(a, b) { return a + b; }</textarea>
    <div class="ltok-out" id="tokout" aria-live="polite"></div>
    <p class="ltok-stats" id="tokstats" data-in="${tokM.input}" data-out="${tokM.output}" data-name="${esc(tokM.name)}"></p>`, 'An approximation — every model family has its own tokenizer, so exact counts differ a little.')}
  <div class="lcallout"><p class="eyebrow">Real example</p><p>${link(tokM)} costs <strong>${per(tokM.input)}</strong> per million input tokens and <strong>${per(tokM.output)}</strong> per million output tokens. Asking it to review a 500-line file — about 6,000 tokens in — and getting a 1,000-token reply back costs about <strong>${money((6000 * tokM.input + 1000 * tokM.output) / 1e6)}</strong>. At the other end, ${link(cheap)} charges just ${per(cheap.input)} per million input tokens.</p></div>`)}

${sec('context', `  ${head('context', 'The context', 'window')}
  <p>The <strong>context window</strong> is how much text a model can look at in one go: your instructions, the conversation so far, the files a coding agent has opened, and the answer it is writing. It is the model's working memory. Anything outside it simply doesn't exist for the model.</p>
  <p>Context is measured in tokens. A model with a one-million-token window can hold roughly 750,000 words at once — about ten novels, or a mid-sized codebase. A model doesn't remember past chats by itself; tools give it memory by putting earlier text back into the window. When the window fills up, the oldest material is dropped or summarised.</p>
  ${demo('ctx', 'Fill the window', `
    <div class="lw-seg" role="radiogroup" aria-label="Window size" id="cx-size">${[[32000, '32K'], [200000, '200K'], [1000000, '1M']].map(([v, l], i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="lctx" id="cx-bar" aria-hidden="true"></div>
    <p class="lw-read" id="cx-read" aria-live="polite"></p>
    <div class="lw-row lw-wrap">
      <button type="button" class="btn ghost" data-add="file">+ Open a file <small>12K</small></button>
      <button type="button" class="btn ghost" data-add="chat">+ Chat turn <small>3K</small></button>
      <button type="button" class="btn ghost" data-add="log">+ Paste a log <small>45K</small></button>
      <button type="button" class="btn ghost" data-add="repo">+ Whole repo <small>400K</small></button>
      <button type="button" class="btn ghost lw-reset" id="cx-reset">Reset</button>
    </div>
    <ul class="lw-key"><li class="k-sys">System prompt</li><li class="k-file">Files</li><li class="k-chat">Chat</li><li class="k-log">Logs</li><li class="k-repo">Repo</li></ul>`, 'When something new does not fit, the oldest items fall out of the window (the system prompt always stays).')}
  <div class="lcallout"><p class="eyebrow">Real example</p><p>${fmt(million)} of the models we track now accept a million tokens or more. The largest window right now belongs to ${link(ctxTop)}, at <strong>${fmt(ctxTop.context)} tokens</strong>. A bigger window isn't free, though: every token you send is billed, which is exactly why caching exists.</p></div>`)}

${sec('prompts', `  ${head('prompts', 'Prompts &amp;', 'system prompts')}
  <p>Everything you type is a <strong>prompt</strong>. But before your message arrives, the app you're using has already sent the model its own hidden instructions: the <strong>system prompt</strong>. It sets who the model is, which tools it can use, what style to write in and what it must never do. Coding agents send long ones, describing how to edit files, when to run tests and when to ask permission.</p>
  <p>That's why the same model can feel completely different in two tools: same brain, different briefing. Good prompts are specific — say what you want, give context the model can't guess, show an example of the output, and say what “done” looks like.</p>
  ${demo('sys', 'Same question, different system prompt', `
    <div class="lw-seg lw-seg-wrap" role="radiogroup" aria-label="System prompt" id="sp-pick">${['None', 'Code reviewer', 'Teacher', 'Terse CLI', 'Pirate'].map((l, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-i="${i}">${l}</button>`).join('')}</div>
    <div class="lchat">
      <div class="lchat-m sys"><span class="eyebrow">System</span><p id="sp-sys"></p></div>
      <div class="lchat-m user"><span class="eyebrow">You</span><p>How do I reverse a list in Python?</p></div>
      <div class="lchat-m bot"><span class="eyebrow">Model</span><p id="sp-out" aria-live="polite"></p></div>
    </div>`)}`)}

${cp ? sec('cache', `  ${head('cache', 'What is a', 'cache hit?')}
  <p>A coding agent sends the model the same big block of text over and over: the system instructions, your project files, and the conversation so far. Only the last few lines change each turn. Processing all of that from scratch every time would be slow and expensive.</p>
  <p><strong>Prompt caching</strong> fixes this. The provider saves its work on the start of your request. Next time a request begins with exactly the same text, it reuses that work instead of redoing it. That reuse is a <strong>cache hit</strong>, and cached tokens are billed at a steep discount. If even one character near the start changes, the rest is a <strong>cache miss</strong> and is billed at the full price.</p>
  <p>Caches are short-lived — often minutes — so they help most in a busy session. Some providers also charge a little extra the first time text is written to the cache.</p>
  ${demo('cache', `Session cost · ${esc(cacheM.name)} on ${esc(cp.name)}`, `
    <div class="lw-grid2">
      <label class="lw-slider"><span>Turns in the session <b id="cc-tv">${turns}</b></span><input type="range" id="cc-t" min="2" max="150" step="1" value="${turns}"></label>
      <label class="lw-slider"><span>Repeated tokens per turn <b id="cc-pv">${fmt(prefix)}</b></span><input type="range" id="cc-p" min="5000" max="300000" step="5000" value="${prefix}"></label>
    </div>
    <div class="lbars" id="cc-bars" data-in="${cp.input}" data-out="${cp.output}" data-read="${cp.cacheRead}" data-fresh="${fresh}" data-outtok="${outTok}">
      <div><span>Without cache</span><i style="--w:100%"></i><b>${money(noCache)}</b></div>
      <div><span>With cache hits</span><i class="on" style="--w:${(withCache / noCache * 100).toFixed(1)}%"></i><b>${money(withCache)}</b></div>
    </div>
    <p class="lw-big" id="cc-save"><b>${Math.round((1 - withCache / noCache) * 100)}%</b> cheaper with caching</p>`, `Each turn repeats the prefix, adds ${fmt(fresh)} new tokens and gets ${fmt(outTok)} back. Fresh input ${per(cp.input)}, cache hit ${per(cp.cacheRead)} per million tokens (${cacheOff}% off).`)}
  <p>Same work, much cheaper — and faster, because cached tokens skip most of the processing. That's why tools try hard to keep the start of every request identical.</p>`) : ''}

${sec('reasoning', `  ${head('reasoning', 'Reasoning', 'tokens')}
  <p>Some models can <strong>think before they answer</strong>. Instead of replying straight away, they first write out a private chain of reasoning: breaking the problem down, trying an approach, checking it, and correcting mistakes. Only then do they write the final answer.</p>
  <p>This makes them much better at hard problems like tricky bugs, maths and planning a large change. The catch is that the thinking is made of tokens too. <strong>Reasoning tokens are billed as output</strong>, even when you never see them. Many tools let you choose a reasoning effort, from low to high.</p>
  ${demo('think', `Reasoning effort · priced on ${esc(pricey.name)}`, `
    <div class="lw-seg" role="radiogroup" aria-label="Reasoning effort" id="rz-pick" data-out="${pricey.output}">${['Off', 'Low', 'Medium', 'High'].map((l, i) => `<button type="button" role="radio" aria-checked="${i === 2}" data-i="${i}">${l}</button>`).join('')}</div>
    <div class="lthink" id="rz-trace" aria-live="polite"></div>
    <div class="lstack" id="rz-bar" aria-hidden="true"><i class="t"></i><i class="a"></i></div>
    <p class="lw-read" id="rz-read"></p>`, 'Question: “Why does this test fail only on Mondays?” Token counts are typical, not exact.')}
  <div class="lcallout"><p class="eyebrow">Real example</p><p>${fmt(reasoners)} of the ${fmt(models.length)} models we track support reasoning. On ${link(pricey)}, output costs ${per(pricey.output)} per million tokens, so 20,000 tokens of hidden thinking before a short answer adds about <strong>${money(20000 * pricey.output / 1e6)}</strong> to that one reply.</p></div>`)}

${sec('tools', `  ${head('tools', 'Tool calling &amp;', 'agents')}
  <p>On its own, a model can only write text. <strong>Tool calling</strong> changes that. The app tells the model which tools exist — read a file, run a command, search the web — and when the model needs one, it writes a short structured request instead of a normal reply. The app runs the tool for real and hands the result back. The model reads it and decides what to do next.</p>
  <p>Put that in a loop and you have an <strong>agent</strong>: read the failing test, open the file, make a change, run the tests again, repeat until they pass. Every coding agent on this site is, at heart, this loop.</p>
  ${demo('agent', 'Step through an agent loop', `
    <ol class="lloop" id="ag-loop" aria-hidden="true"><li data-k="think">Think</li><li data-k="call">Call a tool</li><li data-k="result">Read the result</li><li data-k="done">Answer</li></ol>
    <div class="lterm" id="ag-log" aria-live="polite"></div>
    <div class="lw-row">
      <button type="button" class="btn" id="ag-next">Next step</button>
      <button type="button" class="btn ghost" id="ag-auto">Play</button>
      <button type="button" class="btn ghost lw-reset" id="ag-reset">Reset</button>
      <span class="muted small" id="ag-n"></span>
    </div>`)}
  <div class="lcallout"><p class="eyebrow">Real example</p><p>${fmt(toolCount)} of the ${fmt(models.length)} models we track support tool calling. Without it, a model can describe a fix; with it, it can make the fix and prove it works.</p></div>`)}

${sec('mcp', `  ${head('mcp', 'MCP, the', 'Model Context Protocol')}
  <p>Every tool a model uses has to be wired in by someone. Before MCP, every app wired in every service its own way. The <strong>Model Context Protocol</strong> is a shared standard for that wiring — think of it as USB-C for AI tools.</p>
  <p>An <strong>MCP server</strong> wraps a service — GitHub, a database, a browser, your design files — and describes the tools it offers. Any app that speaks MCP can plug it in, and the model can use those tools straight away. Write the server once and it works everywhere, which is why so many appeared so quickly.</p>
  ${demo('mcp', 'Plug in a server', `
    <div class="lmcp" id="mc-hub">
      <div class="lmcp-client"><span class="eyebrow">MCP client</span><strong>Your coding agent</strong><small id="mc-count">0 tools available</small></div>
      <div class="lmcp-servers">${[['github', 'GitHub'], ['postgres', 'Postgres'], ['browser', 'Browser'], ['figma', 'Figma'], ['sentry', 'Sentry']].map(([k, l]) => `<button type="button" class="lmcp-s" data-k="${k}" aria-pressed="false"><i></i>${l}</button>`).join('')}</div>
    </div>
    <div class="lmcp-tools" id="mc-tools" aria-live="polite"></div>`, 'Click servers to plug them in. Each one adds its tools to what the model can do — no changes to the model or the app.')}
  <p>Browse hundreds of real servers, ranked by how fast they're growing, on our <a href="${root}mcp/">MCP page</a>.</p>`)}

${sec('embeddings', `  ${head('embeddings', 'Embeddings &amp;', 'RAG')}
  <p>Computers can't compare meanings directly, so models turn text into lists of numbers called <strong>embeddings</strong>. Each one is a point in a space with hundreds of dimensions, and texts with similar meanings land close together — “fix the login bug” ends up near “authentication error”, even though they share no words.</p>
  <p>That makes search by meaning possible: embed every document once, then embed each question and grab the nearest documents. <strong>Retrieval-augmented generation</strong>, or RAG, puts those documents into the context window before the model answers. It's how a model can answer questions about your codebase without ever being trained on it.</p>
  ${demo('emb', 'Search by meaning', `
    <div class="lw-seg lw-seg-wrap" role="radiogroup" aria-label="Question" id="em-q">${['Why can’t users sign in?', 'Make the page load faster', 'Button looks broken on phones', 'Ship it to production'].map((l, i) => `<button type="button" role="radio" aria-checked="false" data-i="${i}">${l}</button>`).join('')}</div>
    <svg class="lemb" id="em-map" viewBox="0 0 640 340" role="img" aria-label="Documents plotted by meaning"></svg>
    <ol class="lemb-hits" id="em-hits" aria-live="polite"></ol>`, 'A 2-D sketch of a space that really has hundreds of dimensions. The three closest documents are what RAG would hand to the model.')}`)}

${sec('hallucinations', `  ${head('hallucinations', 'Why models', 'hallucinate')}
  <p>A model's job is to produce <em>likely</em> text, not <em>true</em> text. Usually those are the same; when they aren't, it can state something false with total confidence. That's a <strong>hallucination</strong>.</p>
  <p>In code they look like a function that doesn't exist, a config option that was never added, or a package name that sounds just right. They're most common with niche libraries, recent changes and exact details. The defences: give the model the real source (docs, files, search), let it run the code and tests, and check anything that matters.</p>
  ${demo('quiz', 'Spot the made-up answer', `<div id="qz" class="lquiz"></div><p class="lw-read" id="qz-score" aria-live="polite"></p>`, 'Each question has two real answers and one a model might plausibly invent.')}`)}

${sec('training', `  ${head('training', 'How models', 'are trained')}
  <p>A model is built in stages. <strong>Pre-training</strong> comes first: it reads trillions of tokens and learns to predict the next one. That's where its knowledge comes from, and it's by far the most expensive step — but the result isn't yet a helpful assistant.</p>
  <p>Next, <strong>fine-tuning</strong> on examples of good conversations teaches it to follow instructions. Finally, <strong>reinforcement learning</strong>: it attempts tasks, its answers are scored — by people, other models, or automatic checks such as whether the code passes its tests — and good answers are rewarded. That last step is a big reason coding models have improved so fast.</p>
  ${demo('train', 'Same prompt, three stages', `
    <ol class="lstages" id="tr-pick" role="tablist">${[['Pre-training', 'Trillions of tokens of raw text'], ['Fine-tuning', 'Curated example conversations'], ['Reinforcement learning', 'Scored attempts at real tasks']].map(([l, s], i) => `<li><button type="button" role="tab" aria-selected="${i === 0}" data-i="${i}"><b>${String(i + 1).padStart(2, '0')}</b><span>${l}</span><small>${s}</small></button></li>`).join('')}</ol>
    <div class="lchat">
      <div class="lchat-m user"><span class="eyebrow">Prompt</span><p>Write a function that checks whether a word is a palindrome.</p></div>
      <div class="lchat-m bot"><span class="eyebrow" id="tr-who">Model after pre-training</span><pre id="tr-out" aria-live="polite"></pre></div>
    </div>
    <p class="lw-read" id="tr-note"></p>`)}`)}

${sec('moe', `  ${head('moe', 'Mixture of', 'experts')}
  <p>A normal, or <strong>dense</strong>, model uses every one of its parameters for every token. A <strong>mixture-of-experts</strong> model, or MoE, is split into many smaller sub-networks called experts. For each token, a small <strong>router</strong> picks just a few experts to do the work, and the rest stay idle.</p>
  <p>The result: the model can hold the knowledge of a huge network while each token only costs as much as a small one. That's why total parameters and <strong>active</strong> parameters are listed separately. Total size decides how much memory is needed to host the model; active size decides how fast and cheap each token is.</p>
  ${demo('moe', 'Route tokens through experts', `
    <p class="lmoe-seq" id="mo-seq" aria-live="polite"></p>
    <svg class="lmoe-svg" id="mo-svg" viewBox="0 0 440 170" role="img" aria-label="A token passes through a router to 2 of 8 experts">
      <rect x="6" y="68" width="78" height="34" rx="3" class="mt"/><text x="45" y="90" text-anchor="middle" id="mo-tok">token</text>
      <rect x="118" y="68" width="78" height="34" rx="3" class="mr"/><text x="157" y="90" text-anchor="middle">router</text>
      <path d="M84 85h34" class="ml on"/>
      ${Array.from({ length: 8 }, (_, i) => { const y = 8 + i * 20; return `<path d="M196 85C236 85 236 ${y + 8} 276 ${y + 8}" class="ml" data-e="${i}"/><rect x="276" y="${y}" width="104" height="16" rx="2" class="me" data-e="${i}"/><text x="328" y="${y + 12}" text-anchor="middle" class="ms">expert ${i + 1}</text><path d="M380 ${y + 8}C410 ${y + 8} 410 85 434 85" class="ml" data-e="${i}"/>`; }).join('')}
    </svg>
    <div class="lw-row">
      <button type="button" class="btn" id="mo-next">Send next token</button>
      <button type="button" class="btn ghost" id="mo-auto">Play</button>
      <span class="muted small" id="mo-use"></span>
    </div>`, 'Different tokens wake different experts. Over a sentence, most experts get used — but only 2 of 8 at a time.')}
  ${moes.length ? `<div class="lcallout"><p class="eyebrow">Real examples · active vs. total parameters</p>
    <p>${fmt(moeCount)} of the models we track are mixture-of-experts. ${link(moeTop.m)} has ${saidParams(moeTop.s.total)} parameters, but only ${saidParams(moeTop.s.active)} — ${(moeTop.s.active / moeTop.s.total * 100).toFixed(1)}% — work on any single token.</p>
    <ul class="lmoes no-say">${moes.map(({ m, s }) => `<li><a href="${root}${modelPath(m)}">${esc(m.name)}</a><span class="lmoe-bar"><i style="--w:${Math.max(1.5, s.active / s.total * 100).toFixed(1)}%"></i></span><b>${params(s.active)} <small>of ${params(s.total)}</small></b></li>`).join('')}</ul>
  </div>` : ''}`)}

${sec('quant', `  ${head('quant', 'Quantization', '(fp8, fp4)')}
  <p>Every parameter is a number, and numbers can be stored with more or less precision. <strong>Quantization</strong> stores them with fewer bits — for example 8 bits, called fp8, or 4 bits, called fp4, instead of 16. The model gets smaller and faster to serve, and usually cheaper, at the cost of a small and sometimes noticeable drop in quality.</p>
  <p>That's why the same open model can cost different amounts from different hosts: they may be running different precisions on different hardware.</p>
  ${demo('quant', 'Shrink a model', `
    <div class="lw-grid2">
      <label class="lw-slider"><span>Bits per parameter <b id="qt-bv">16</b></span><input type="range" id="qt-b" min="0" max="4" step="1" value="1"></label>
      <div class="lw-seg" role="radiogroup" aria-label="Model size" id="qt-size">${[[8, '8B'], [70, '70B'], [400, '400B'], [1000, '1T']].map(([v, l], i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-v="${v}">${l}</button>`).join('')}</div>
    </div>
    <svg class="lwave" id="qt-wave" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><path class="ref"/><path class="q"/></svg>
    <p class="lw-big" id="qt-mem"></p>
    <p class="lw-read" id="qt-fit"></p>`, 'The orange line is a smooth signal stored with the chosen precision: fewer bits, fewer levels, more rounding.')}
  ${qModel ? `<div class="lcallout"><p class="eyebrow">Real example</p><p>Across our provider listings, the most common precisions are ${qList.slice(0, 3).map(([q, c]) => `<strong>${esc(q)}</strong> (${fmt(c)} listings)`).join(', ')}. ${link(qModel)} is served at several: ${qProv.map((p) => `${esc(p.name)} runs ${esc(p.quant)} at ${per(p.input)} per million input tokens`).join('; ')}.</p></div>` : ''}`)}

${sec('weights', `  ${head('weights', 'Open vs. closed', 'weights')}
  <p>A model's <strong>weights</strong> are its learned parameters — the file that <em>is</em> the model. <strong>Closed</strong> models keep them private: you use them only through the lab's own app or API. <strong>Open-weight</strong> models publish them, so anyone can download, run, fine-tune or resell access to them.</p>
  <p>Closed models have often led on raw ability. Open ones give you choice: many hosts competing on price and speed, data that stays on your own machines, and a model that keeps working after its maker moves on.</p>
  ${demo('weights', 'The models we track', `
    <div class="lsplit" role="img" aria-label="${open.length} open-weight and ${closed.length} closed models"><i class="o" style="--w:${(open.length / models.length * 100).toFixed(1)}%"><b>${fmt(open.length)}</b> open</i><i class="c"><b>${fmt(closed.length)}</b> closed</i></div>
    <div class="lw-seg" role="tablist" id="wt-pick"><button type="button" role="tab" aria-selected="true" data-k="open">Newest open</button><button type="button" role="tab" aria-selected="false" data-k="closed">Newest closed</button></div>
    ${[['open', open], ['closed', closed]].map(([k, arr], i) => `<ul class="lmlist" data-k="${k}"${i ? ' hidden' : ''}>${arr.slice(0, 6).map((m) => `<li><span class="lsq" style="--c:${esc(m.color || '#888')}"></span><a href="${root}${modelPath(m)}">${esc(m.name)}</a><small>${esc(m.lab)}${k === 'open' ? ` · ${hostCount(m)} host${hostCount(m) === 1 ? '' : 's'}` : ''}</small><b>${m.input > 0 ? per(m.input) : 'free'}</b></li>`).join('')}</ul>`).join('')}`, 'Price is per million input tokens.')}
  <div class="lcallout"><p class="eyebrow">Real example</p><p>The labs publishing the most open models we track are ${openLabs.map(([l, c]) => `${esc(l)} (${c})`).join(', ')}. ${mostHosted ? `${link(mostHosted)} is offered by ${hostCount(mostHosted)} different hosts — the kind of competition a closed model can't have.` : ''}</p></div>`)}

${sec('multimodal', `  ${head('multimodal', 'Multimodal', 'models')}
  <p>Early language models only handled text. <strong>Multimodal</strong> models also take in images, PDFs, audio and even video. For coding that's surprisingly useful: paste a screenshot of a broken layout or a design mock-up and ask the model to build it, or let an agent screenshot the app it's working on to check its own work.</p>
  <p>Under the hood, an image becomes tokens too. It's cut into small patches and each patch becomes a token or so — so a big image can use as much context as a page of text.</p>
  ${demo('img', 'How many tokens is an image?', `
    <div class="limg-wrap"><div class="limg" id="im-grid" aria-hidden="true"></div>
    <div class="limg-side">
      <label class="lw-slider"><span>Image width <b id="im-sv">1024 × 768</b></span><input type="range" id="im-s" min="256" max="2048" step="64" value="1024"></label>
      <p class="lw-big" id="im-tok"></p>
      <p class="lw-read" id="im-eq"></p>
    </div></div>`, 'Uses one common rule of thumb — about one token per 750 pixels. Each provider resizes and counts a little differently.')}
  <div class="lcallout"><p class="eyebrow">Real example · what the ${fmt(models.length)} models we track accept</p>
    <ul class="lmodal">${modal.map(([k, c]) => `<li><span>${MODAL[k]}</span><i style="--w:${(c / models.length * 100).toFixed(1)}%"></i><b>${fmt(c)}</b></li>`).join('')}</ul></div>`)}

${sec('speed', `  ${head('speed', 'Speed: latency &amp;', 'throughput')}
  <p>Two numbers decide how fast a model feels. <strong>Latency</strong>, or time to first token, is how long you wait before anything appears. <strong>Throughput</strong>, in tokens per second, is how fast text flows once it starts. For a quick question latency matters most; for an agent writing a big file, throughput does.</p>
  <p>Speed depends on the model's size, how busy it is, and the hardware and software of whoever serves it. Reasoning models also spend time thinking before the visible answer starts.</p>
  ${demo('speed', 'Feel the difference', `
    <div class="lw-seg lw-seg-wrap" role="radiogroup" aria-label="Preset" id="sd-pre">${[['Big reasoning model', 8, 40], ['Typical', 0.8, 90], ['Small & fast', 0.3, 250], ['Specialised chip', 0.2, 1200]].map(([l, t, s], i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-t="${t}" data-s="${s}">${l}</button>`).join('')}</div>
    <div class="lw-grid2">
      <label class="lw-slider"><span>Time to first token <b id="sd-tv">0.8 s</b></span><input type="range" id="sd-t" min="0.1" max="15" step="0.1" value="0.8"></label>
      <label class="lw-slider"><span>Tokens per second <b id="sd-sv">90</b></span><input type="range" id="sd-s" min="10" max="1500" step="10" value="90"></label>
    </div>
    <pre class="lterm lstream" id="sd-out"></pre>
    <div class="lw-row"><button type="button" class="btn" id="sd-run">${play}<span>Run</span></button><span class="lw-clock" id="sd-clock">0.0 s</span><span class="muted small" id="sd-est"></span></div>`)}`)}

${sec('benchmarks', `  ${head('benchmarks', 'Reading', 'benchmarks')}
  <p>A <strong>benchmark</strong> is a standard test — the same tasks given to every model so scores can be compared. Some test knowledge and reasoning with hard exam-style questions; coding benchmarks hand the model real bugs from real projects and check whether its fix makes the tests pass.</p>
  <p>Read them with care. A model may have seen the questions during training, which inflates its score; labs choose which results to show; and a high score on one kind of task says little about another. The best benchmark is your own work — try a few models on what you actually do.</p>
  ${benchSets.length ? demo('bench', 'Top tracked models', `
    <div class="lw-seg lw-seg-wrap" role="tablist" id="bm-pick">${benchSets.map(({ b }, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-i="${i}" data-b="${b.id}">${esc(b.name)}</button>`).join('')}</div>
    ${benchSets.map(({ b, rows }, i) => `<div class="lbench" data-i="${i}"${i ? ' hidden' : ''}><p class="lw-read">${esc(b.desc)}.</p><ul class="lmodal">${rows.map(({ m, v }) => `<li><a href="${root}${modelPath(m)}">${esc(m.name)}</a><i style="--w:${(v * 100).toFixed(1)}%;--c:${esc(m.color || '#888')}"></i><b>${(v * 100).toFixed(1)}%</b></li>`).join('')}</ul></div>`).join('')}`, `Scores from <a href="${bench.source.url}">${esc(bench.source.name)}</a>. Compare many more on the <a href="${root}#leaderboard">leaderboard</a>.`) : ''}
  <p class="muted small lsrc no-say">Examples are computed from OpenRouter's public model and provider catalog, refreshed ${new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}. Prices are USD and change often.${recorded ? ' Narration voiced with Magnific.' : ''}</p>`)}

</article>
</div>

<div class="lplayer no-say" id="lplayer" data-captions="${root}audio/learn/captions.json" hidden>
  <div class="lp-cap" id="lp-cap" aria-hidden="true"></div>
  <div class="lp-prog" aria-hidden="true"><i id="lp-bar"></i></div>
  <div class="wrap lplayer-in">
    <button type="button" class="icon-btn" id="lp-prev" aria-label="Previous chapter"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>
    <button type="button" class="icon-btn lp-main" id="lp-toggle" aria-label="Pause"><svg class="i-pause" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg><svg class="i-play" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg><span class="lp-spin" aria-hidden="true"></span></button>
    <button type="button" class="icon-btn" id="lp-next" aria-label="Next chapter"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
    <button type="button" class="icon-btn" id="lp-stop" aria-label="Stop"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 6h12v12H6z"/></svg></button>
    <div class="lp-now"><span class="eyebrow">Now playing</span><strong id="lp-title">—</strong></div>
    <span class="lp-time" id="lp-time"></span>
    <button type="button" class="icon-btn lp-cc" id="lp-cc" aria-pressed="true" aria-label="Captions" title="Captions">CC</button>
    <label class="lp-opt"><span class="eyebrow">Speed</span><select id="lp-rate">${[0.8, 1, 1.15, 1.3, 1.5, 1.75].map((r) => `<option value="${r}"${r === 1 ? ' selected' : ''}>${r}×</option>`).join('')}</select></label>
    <label class="lp-opt lp-voice" hidden><span class="eyebrow">Voice</span><select id="lp-voice"><option>Loading voices…</option></select></label>
  </div>
</div>
<script src="${root}assets/learn.js?v=${Date.now()}" defer></script>`;
}
