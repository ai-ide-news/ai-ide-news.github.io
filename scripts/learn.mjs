// "Learn" page: plain-language explainers (AI, tokens, context, caching, MoE, reasoning, quantization),
// with worked examples computed from the live model catalog so the numbers stay real.
// Read-aloud is done in the browser (src/app.js, Web Speech API): every section can be listened to.

const fmt = (n) => n.toLocaleString('en-US');
const money = (n) => `$${n >= 100 ? n.toFixed(0) : n >= 0.1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4)}`;
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const per = (n) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
const params = (b) => (b >= 1000 ? `${+(b / 1000).toFixed(2)}T` : `${+b.toFixed(1)}B`);
const saidParams = (b) => (b >= 1000 ? `${+(b / 1000).toFixed(2)} trillion` : `${+b.toFixed(1)} billion`);

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

export function learnBody({ models, root, esc, modelPath, generatedAt }) {
  const link = (m) => `<a href="${root}${modelPath(m)}">${esc(m.name)}</a>`;
  const prefer = (names, ok) => names.map((n) => models.find((m) => m.name === n)).find((m) => m && ok(m)) || models.find(ok);

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
  // Quantization
  const quants = {};
  for (const m of models) for (const p of m.providers || []) if (p.quant) quants[p.quant] = (quants[p.quant] || 0) + 1;
  const qList = Object.entries(quants).sort((a, b) => b[1] - a[1]);
  const qModel = models.find((m) => new Set((m.providers || []).map((p) => p.quant).filter(Boolean)).size >= 2);
  const qProv = qModel && [...new Map((qModel.providers || []).filter((p) => p.quant).map((p) => [p.quant, p])).values()].slice(0, 4);

  const sections = [
    ['what', 'What is AI?'], ['how', 'How a model answers'], ['tokens', 'Tokens'], ['context', 'Context window'],
    ['cache', 'Cache hits'], ['moe', 'Mixture of experts'], ['reasoning', 'Reasoning tokens'], ['quant', 'Quantization'],
  ];
  const head = (id, n, title, em) => `<div class="lhead"><p class="eyebrow">${String(n).padStart(2, '0')} · ${esc(sections.find((s) => s[0] === id)[1])}</p><h2>${title} <em>${em}</em></h2><button type="button" class="btn ghost lplay" data-play="${id}" aria-label="Listen to “${esc(sections.find((s) => s[0] === id)[1])}”"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg><span>Listen</span></button></div>`;

  return `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Learn</p>
  <h1>How AI <em>actually</em> works</h1>
  <p class="lede">A plain-language guide to the words you see on every model page — tokens, context windows, cache hits, mixture of experts — with real examples from the ${fmt(models.length)} models we track. Press play and it reads itself to you.</p>
  <div class="lhero-actions">
    <button type="button" class="btn lplay" data-play="all"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg><span>Listen to the whole guide</span></button>
    <span class="muted small">About ${Math.round(sections.length * 1.6)} minutes · uses your device's built-in voices</span>
  </div>
</section>

<div class="wrap learn">
<nav class="ltoc no-say" aria-label="On this page">
  <p class="eyebrow">On this page</p>
  <ol>${sections.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol>
</nav>

<article class="lbody">

<section class="lsec" id="what" data-title="What is AI?">
  ${head('what', 1, 'What is', 'AI?')}
  <p><strong>Artificial intelligence</strong> is software that learns patterns from examples instead of following rules a person wrote by hand. A spam filter that has seen millions of emails learns what spam looks like; nobody types in every rule.</p>
  <p>The AI in coding tools is a <strong>large language model</strong>, or LLM. It was trained by reading a huge amount of text and code — books, websites, documentation, open-source repositories — and adjusting billions of internal numbers, called <strong>parameters</strong>, until it got very good at one task: guessing what text comes next.</p>
  <p>That sounds small, but to guess the next line of a program well, a model has to pick up grammar, facts, the rules of programming languages and a working sense of how problems are solved. Everything it does — answering questions, writing code, fixing bugs — is built on that one skill.</p>
  <div class="lcallout"><p class="eyebrow">Real example</p><p>Every model on our <a href="${root}models/">Models page</a> is an LLM. ${link(tokM)} by ${esc(tokM.lab)}, for example, is listed as supporting ${tokM.modalities?.length > 1 ? `${esc(list(tokM.modalities))} input` : 'text input'}${tokM.reasoning ? ', step-by-step reasoning' : ''}${tokM.tools ? ' and tool calling — the ability to run commands, read files and search, which is what turns a chatbot into a coding agent' : ''}.</p></div>
</section>

<section class="lsec" id="how" data-title="How a model answers">
  ${head('how', 2, 'How a model', 'answers')}
  <p>Building a model happens in two stages. <strong>Training</strong> is the expensive part: thousands of chips run for weeks while the model reads its data and its parameters are tuned. After that, the model is frozen. <strong>Inference</strong> is what happens when you use it: your text goes in, and the model produces an answer one small piece at a time.</p>
  <p>At every step the model looks at everything so far and gives each possible next piece a probability. One is picked, added to the text, and the whole thing repeats until the answer is finished. That is why answers stream onto the screen word by word.</p>
  <figure class="lfig no-say" data-say="For example, given the text: the capital of France is, the model might give Paris about 92 percent, a about 3 percent, and located about 2 percent. It picks Paris, adds it, and predicts again.">
    <p class="lprompt"><span>The capital of France is</span><span class="lcaret"></span></p>
    <ul class="lprobs">
      <li style="--p:92%"><b>Paris</b><span>92%</span></li>
      <li style="--p:3%"><b>a</b><span>3%</span></li>
      <li style="--p:2%"><b>located</b><span>2%</span></li>
      <li style="--p:1%"><b>the</b><span>1%</span></li>
    </ul>
    <figcaption class="muted small">Illustrative probabilities for the next token. The model picks one, appends it, and predicts again.</figcaption>
  </figure>
  <p>A setting called <strong>temperature</strong> controls how adventurous that pick is. Low temperature almost always takes the top choice, which suits code. Higher temperature lets less likely words through, which suits brainstorming.</p>
</section>

<section class="lsec" id="tokens" data-title="Tokens">
  ${head('tokens', 3, 'What are', 'tokens?')}
  <p>Models don't read letters or whole words. They read <strong>tokens</strong>: chunks of text, often a word, part of a word, or a symbol. Common words like “the” are one token; a rare word like “tokenization” might be split into “token” and “ization”. In English, one token is about four characters, or roughly three quarters of a word. Code usually uses more tokens per line, because of symbols and indentation.</p>
  <p>Tokens matter because they are how models are <strong>measured and billed</strong>. Prices are quoted per million tokens, with separate prices for what you send in, called input, and what the model writes back, called output. Output is usually several times more expensive.</p>
  <div class="ltok no-say" data-say="Try the token counter on this page: type any text and it shows roughly how it splits into tokens, and what it would cost.">
    <label class="eyebrow" for="tokin">Try it — type anything</label>
    <textarea id="tokin" rows="3" spellcheck="false">Patchwire tracks AI coding tools. function add(a, b) { return a + b; }</textarea>
    <div class="ltok-out" id="tokout" aria-live="polite"></div>
    <p class="ltok-stats" id="tokstats" data-in="${tokM.input}" data-out="${tokM.output}" data-name="${esc(tokM.name)}"></p>
    <p class="muted small">An approximation — every model family has its own tokenizer, so exact counts differ a little.</p>
  </div>
  <div class="lcallout"><p class="eyebrow">Real example</p><p>${link(tokM)} costs <strong>${per(tokM.input)}</strong> per million input tokens and <strong>${per(tokM.output)}</strong> per million output tokens. Asking it to review a 500-line file — about 6,000 tokens in — and getting a 1,000-token reply back costs about <strong>${money((6000 * tokM.input + 1000 * tokM.output) / 1e6)}</strong>. At the other end, ${link(cheap)} charges just ${per(cheap.input)} per million input tokens.</p></div>
</section>

<section class="lsec" id="context" data-title="Context window">
  ${head('context', 4, 'The context', 'window')}
  <p>The <strong>context window</strong> is how much text a model can look at in one go: your instructions, the conversation so far, the files a coding agent has opened, and the answer it is writing. It is the model's working memory. Anything outside it simply doesn't exist for the model.</p>
  <p>Context is measured in tokens. A model with a one-million-token window can hold roughly 750,000 words at once — about ten novels, or a mid-sized codebase. A model doesn't remember past chats by itself; tools give it memory by putting earlier text back into the window.</p>
  <div class="lcallout"><p class="eyebrow">Real example</p><p>${fmt(million)} of the models we track now accept a million tokens or more. The largest window right now belongs to ${link(ctxTop)}, at <strong>${fmt(ctxTop.context)} tokens</strong>. A bigger window isn't free, though: every token you send is billed, which is exactly why caching exists.</p></div>
</section>

${cp ? `<section class="lsec" id="cache" data-title="Cache hits">
  ${head('cache', 5, 'What is a', 'cache hit?')}
  <p>A coding agent sends the model the same big block of text over and over: the system instructions, your project files, and the conversation so far. Only the last few lines change each turn. Processing all of that from scratch every time would be slow and expensive.</p>
  <p><strong>Prompt caching</strong> fixes this. The provider saves its work on the start of your request. Next time a request begins with exactly the same text, it reuses that work instead of redoing it. That reuse is a <strong>cache hit</strong>, and cached tokens are billed at a steep discount. If even one character near the start changes, the rest is a <strong>cache miss</strong> and is billed at the full price.</p>
  <p>Caches are short-lived — often minutes — so they help most in a busy session. Some providers also charge a little extra the first time text is written to the cache.</p>
  <div class="lcallout"><p class="eyebrow">Real example · ${esc(cacheM.name)} on ${esc(cp.name)}</p>
    <p>Fresh input costs <strong>${per(cp.input)}</strong> per million tokens; a cache hit costs <strong>${per(cp.cacheRead)}</strong> — ${cacheOff}% off. Picture a ${turns}-turn coding session where each request repeats ${fmt(prefix)} tokens of instructions, files and history, adds ${fmt(fresh)} new tokens and gets ${fmt(outTok)} back.</p>
    <div class="lbars no-say" data-say="Without caching the session costs about ${money(noCache)}. With caching it costs about ${money(withCache)}.">
      <div><span>Without cache</span><i style="--w:100%"></i><b>${money(noCache)}</b></div>
      <div><span>With cache hits</span><i class="on" style="--w:${(withCache / noCache * 100).toFixed(1)}%"></i><b>${money(withCache)}</b></div>
    </div>
    <p>Same work, about <strong>${Math.round((1 - withCache / noCache) * 100)}% cheaper</strong> — and faster, because cached tokens skip most of the processing. That's why tools try hard to keep the start of every request identical.</p>
  </div>
</section>` : ''}

<section class="lsec" id="moe" data-title="Mixture of experts">
  ${head('moe', 6, 'Mixture of', 'experts')}
  <p>A normal, or <strong>dense</strong>, model uses every one of its parameters for every token. A <strong>mixture-of-experts</strong> model, or MoE, is split into many smaller sub-networks called experts. For each token, a small <strong>router</strong> picks just a few experts to do the work, and the rest stay idle.</p>
  <p>The result: the model can hold the knowledge of a huge network while each token only costs as much as a small one. That's why total parameters and <strong>active</strong> parameters are listed separately. Total size decides how much memory is needed to host the model; active size decides how fast and cheap each token is.</p>
  <figure class="lmoe no-say" data-say="In the diagram, a token goes to the router, which sends it to two of eight experts. The other six are skipped.">
    <svg viewBox="0 0 420 150" role="img" aria-label="A token passes through a router to 2 of 8 experts">
      <rect x="6" y="58" width="70" height="34" rx="3" class="mt"/><text x="41" y="80" text-anchor="middle">token</text>
      <rect x="112" y="58" width="78" height="34" rx="3" class="mr"/><text x="151" y="80" text-anchor="middle">router</text>
      <path d="M76 75h36" class="ml on"/>
      ${Array.from({ length: 8 }, (_, i) => { const y = 6 + i * 18; const on = i === 2 || i === 5; return `<path d="M190 75C230 75 230 ${y + 7} 268 ${y + 7}" class="ml${on ? ' on' : ''}"/><rect x="268" y="${y}" width="100" height="14" rx="2" class="me${on ? ' on' : ''}"/><text x="318" y="${y + 11}" text-anchor="middle" class="ms">expert ${i + 1}</text>`; }).join('')}
      <path d="M368 ${6 + 2 * 18 + 7}C400 ${6 + 2 * 18 + 7} 400 75 414 75M368 ${6 + 5 * 18 + 7}C400 ${6 + 5 * 18 + 7} 400 75 414 75" class="ml on"/>
    </svg>
    <figcaption class="muted small">The router sends each token to a few experts; the others are skipped for that token.</figcaption>
  </figure>
  ${moes.length ? `<div class="lcallout"><p class="eyebrow">Real examples · active vs. total parameters</p>
    <p>${fmt(moeCount)} of the models we track are mixture-of-experts. ${link(moeTop.m)} has ${saidParams(moeTop.s.total)} parameters, but only ${saidParams(moeTop.s.active)} — ${(moeTop.s.active / moeTop.s.total * 100).toFixed(1)}% — work on any single token.</p>
    <ul class="lmoes no-say">${moes.map(({ m, s }) => `<li><a href="${root}${modelPath(m)}">${esc(m.name)}</a><span class="lmoe-bar"><i style="--w:${Math.max(1.5, s.active / s.total * 100).toFixed(1)}%"></i></span><b>${params(s.active)} <small>of ${params(s.total)}</small></b></li>`).join('')}</ul>
  </div>` : ''}
</section>

<section class="lsec" id="reasoning" data-title="Reasoning tokens">
  ${head('reasoning', 7, 'Reasoning', 'tokens')}
  <p>Some models can <strong>think before they answer</strong>. Instead of replying straight away, they first write out a private chain of reasoning: breaking the problem down, trying an approach, checking it, and correcting mistakes. Only then do they write the final answer.</p>
  <p>This makes them much better at hard problems like tricky bugs, maths and planning a large change. The catch is that the thinking is made of tokens too. <strong>Reasoning tokens are billed as output</strong>, even when you never see them, so a hard question can cost several times more than its visible answer suggests. Many tools let you choose a reasoning effort, from low to high.</p>
  <div class="lcallout"><p class="eyebrow">Real example</p><p>${fmt(reasoners)} of the ${fmt(models.length)} models we track support reasoning. On ${link(pricey)}, output costs ${per(pricey.output)} per million tokens, so 20,000 tokens of hidden thinking before a short answer adds about <strong>${money(20000 * pricey.output / 1e6)}</strong> to that one reply.</p></div>
</section>

<section class="lsec" id="quant" data-title="Quantization">
  ${head('quant', 8, 'Quantization', '(fp8, fp4)')}
  <p>Every parameter is a number, and numbers can be stored with more or less precision. <strong>Quantization</strong> stores them with fewer bits — for example 8 bits, called fp8, or 4 bits, called fp4, instead of 16. The model gets smaller and faster to serve, and usually cheaper, at the cost of a small and sometimes noticeable drop in quality.</p>
  <p>That's why the same open model can cost different amounts from different hosts: they may be running different precisions on different hardware.</p>
  ${qModel ? `<div class="lcallout"><p class="eyebrow">Real example</p><p>Across our provider listings, the most common precisions are ${qList.slice(0, 3).map(([q, c]) => `<strong>${esc(q)}</strong> (${fmt(c)} listings)`).join(', ')}. ${link(qModel)} is served at several: ${qProv.map((p) => `${esc(p.name)} runs ${esc(p.quant)} at ${per(p.input)} per million input tokens`).join('; ')}.</p></div>` : ''}
  <p class="muted small lsrc no-say">Examples are computed from OpenRouter's public model and provider catalog, refreshed ${new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}. Prices are USD and change often.</p>
</section>

</article>
</div>

<div class="lplayer no-say" id="lplayer" hidden>
  <div class="wrap lplayer-in">
    <button type="button" class="icon-btn" id="lp-toggle" aria-label="Pause"><svg class="i-pause" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg><svg class="i-play" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg></button>
    <button type="button" class="icon-btn" id="lp-stop" aria-label="Stop"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 6h12v12H6z"/></svg></button>
    <div class="lp-now"><span class="eyebrow">Now reading</span><strong id="lp-title">—</strong></div>
    <label class="lp-opt"><span class="eyebrow">Speed</span><select id="lp-rate">${[0.8, 1, 1.15, 1.3, 1.5].map((r) => `<option value="${r}"${r === 1 ? ' selected' : ''}>${r}×</option>`).join('')}</select></label>
    <label class="lp-opt lp-voice"><span class="eyebrow">Voice</span><select id="lp-voice"></select></label>
  </div>
</div>`;
}
