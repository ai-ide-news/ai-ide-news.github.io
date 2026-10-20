// Learn page: the interactive demos in each chapter, and the narration player.
// Narration plays the Magnific recordings (section[data-audio]); a chapter without one is read by the
// browser's own speech engine instead, a sentence at a time.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const money = (n) => `$${n >= 100 ? n.toFixed(0) : n >= 0.1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4)}`;
  const kTok = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Single-choice button groups (role=radio or role=tab): click selects, arrows move.
  const choice = (group, onPick) => {
    if (!group) return;
    const btns = $$('button', group), attr = btns[0].getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-checked';
    const pick = (b, focus) => {
      btns.forEach((x) => { x.setAttribute(attr, String(x === b)); x.tabIndex = x === b ? 0 : -1; });
      if (focus) b.focus();
      onPick(b);
    };
    btns.forEach((b, i) => {
      b.tabIndex = b.getAttribute(attr) === 'true' ? 0 : -1;
      b.addEventListener('click', () => pick(b));
      b.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (step) { e.preventDefault(); pick(btns[(i + step + btns.length) % btns.length], true); }
      });
    });
    if (!btns.some((b) => b.getAttribute(attr) === 'true')) btns.forEach((b, i) => { b.tabIndex = i ? -1 : 0; });
    return { pick, btns };
  };
  // Write text out a few characters at a time.
  const typeOut = async (node, text, token) => {
    if (reduced) { node.textContent = text; return; }
    node.textContent = '';
    for (let i = 0; i < text.length; i += 3) {
      if (token.cancelled) return;
      node.textContent = text.slice(0, i + 3);
      await sleep(12);
    }
  };

  // ── Next-token sampler ─────────────────────────────────
  if ($('#w-temp')) {
    const cands = [['Python', 3.2], ['Bash', 2.0], ['JavaScript', 1.7], ['Ruby', 0.6], ['Perl', 0.2], ['Lua', -0.4], ['COBOL', -2.2]];
    const t = $('#tp-t'), tv = $('#tp-tv'), ul = $('#tp-probs'), pick = $('#tp-pick');
    let counts = null;
    const probs = () => {
      const T = Number(t.value);
      if (T < 0.01) return cands.map((_, i) => (i === 0 ? 1 : 0));
      const ex = cands.map(([, l]) => Math.exp(l / T)), sum = ex.reduce((a, b) => a + b, 0);
      return ex.map((e) => e / sum);
    };
    const rows = cands.map(([w]) => { const li = el('li', {}, el('b', { textContent: w }), el('span')); ul.append(li); return li; });
    const render = () => {
      tv.textContent = Number(t.value).toFixed(2);
      const p = probs(), total = counts && counts.reduce((a, b) => a + b, 0);
      rows.forEach((li, i) => {
        li.style.setProperty('--p', `${(p[i] * 100).toFixed(1)}%`);
        li.lastChild.textContent = `${p[i] < 0.001 && p[i] > 0 ? '<0.1' : (p[i] * 100).toFixed(1)}%${counts ? ` · picked ${counts[i]}×` : ''}`;
        li.classList.toggle('hit', !!counts && counts[i] > 0 && counts[i] === Math.max(...counts) && total > 0);
      });
    };
    const sample = () => { const p = probs(); let r = Math.random(); for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return i; } return 0; };
    const flash = (i) => {
      pick.textContent = cands[i][0];
      pick.classList.remove('pop'); void pick.offsetWidth; pick.classList.add('pop');
      rows.forEach((li, j) => li.classList.toggle('now', j === i));
    };
    t.addEventListener('input', () => { counts = null; render(); });
    $('#tp-one').addEventListener('click', () => { counts = null; render(); flash(sample()); });
    $('#tp-many').addEventListener('click', () => {
      counts = cands.map(() => 0);
      for (let n = 0; n < 50; n++) counts[sample()]++;
      render(); flash(counts.indexOf(Math.max(...counts)));
    });
    render();
  }

  // ── Tokenizer: splits the way BPE tokenizers tend to (words with their leading space, long words in
  // pieces, digits in groups of up to three, runs of symbols).
  const tokSplit = (text) => (text.match(/ ?[A-Za-z]+| ?\d{1,3}| ?[^\sA-Za-z\d]{1,2}|\s+/g) || []).flatMap((t) => {
    const w = t.trimStart(), lead = t.slice(0, t.length - w.length);
    if (!/^[A-Za-z]{9,}$/.test(w)) return [t];
    const parts = w.match(/.{1,5}/g);
    return [lead + parts[0], ...parts.slice(1)];
  });
  const tokin = $('#tokin');
  if (tokin) {
    const out = $('#tokout'), stats = $('#tokstats');
    // Per 1,000 sends: a single short prompt costs a tiny fraction of a cent.
    const cost = (n) => { const v = n * Number(stats.dataset.in) / 1e3; return `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`; };
    const render = () => {
      const toks = tokSplit(tokin.value);
      out.replaceChildren(...toks.map((t, i) => el('span', { className: `tk tk${i % 5}`, textContent: t.replace(/\n/g, '↵').replace(/ /g, '·') })));
      const words = (tokin.value.match(/\S+/g) || []).length;
      stats.replaceChildren(el('b', { textContent: toks.length }), ` tokens · ${tokin.value.length} characters · ${words} words · sending this 1,000 times to ${stats.dataset.name} ≈ `, el('b', { textContent: cost(toks.length) }));
    };
    tokin.addEventListener('input', render);
    render();
  }

  // ── Context window ─────────────────────────────────────
  if ($('#w-ctx')) {
    const SIZE = { sys: 6000, file: 12000, chat: 3000, log: 45000, repo: 400000 };
    const NAME = { sys: 'System prompt', file: 'File', chat: 'Chat turn', log: 'Log', repo: 'Whole repo' };
    const bar = $('#cx-bar'), read = $('#cx-read');
    let win = 200000, items = [{ k: 'sys', n: SIZE.sys }], dropped = 0, note = '';
    const fit = () => {
      while (items.reduce((a, x) => a + x.n, 0) > win) {
        const i = items.findIndex((x) => x.k !== 'sys');
        if (i < 0) break;
        items.splice(i, 1); dropped++;
      }
    };
    const render = (fresh) => {
      const used = items.reduce((a, x) => a + x.n, 0);
      bar.replaceChildren(...items.map((x, i) => el('i', { className: `c-${x.k}${fresh && i === items.length - 1 ? ' new' : ''}`, title: `${NAME[x.k]} · ${fmt(x.n)} tokens`, style: `--w:${(x.n / win * 100).toFixed(3)}%` })));
      bar.classList.toggle('full', used / win > 0.9);
      read.replaceChildren(el('b', { textContent: `${kTok(used)} of ${kTok(win)}` }), ` tokens used (${Math.round(used / win * 100)}%)`,
        dropped ? el('span', { className: 'lw-warn', textContent: ` · ${dropped} older item${dropped === 1 ? '' : 's'} pushed out of memory` }) : '', note ? el('span', { className: 'lw-warn', textContent: ` · ${note}` }) : '');
    };
    choice($('#cx-size'), (b) => { win = Number(b.dataset.v); note = ''; fit(); render(); });
    $$('[data-add]', $('#w-ctx')).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.add;
      note = '';
      if (SIZE[k] > win - SIZE.sys) { note = `a ${NAME[k].toLowerCase()} is too big for this window at all`; return render(); }
      items.push({ k, n: SIZE[k] }); fit(); render(true);
    }));
    $('#cx-reset').addEventListener('click', () => { items = [{ k: 'sys', n: SIZE.sys }]; dropped = 0; note = ''; render(); });
    render();
  }

  // ── System prompts ─────────────────────────────────────
  if ($('#w-sys')) {
    const P = [
      ['(none — just your message)', 'You can use slicing: items[::-1] gives you a reversed copy of the list, or call items.reverse() to reverse it in place.'],
      ['You are a strict senior code reviewer. Point out pitfalls.', 'Use items.reverse() to reverse in place, or items[::-1] / list(reversed(items)) for a copy. Pitfall: .reverse() returns None, so x = items.reverse() leaves x empty — a classic bug.'],
      ['You are a patient teacher for complete beginners. Use an example.', 'Great question! Picture a list as a row of boxes: nums = [1, 2, 3]. Writing nums[::-1] means “walk the boxes from the end back to the start”, so you get [3, 2, 1]. Try it in the Python shell!'],
      ['Reply with code only. No prose.', 'items[::-1]'],
      ['You are a pirate. Never break character.', 'Arr! Flip yer list with items[::-1], matey — or items.reverse() to turn the whole crew about, right where they stand!'],
    ];
    const sys = $('#sp-sys'), out = $('#sp-out');
    let tok = { cancelled: true };
    const show = (i) => { tok.cancelled = true; tok = { cancelled: false }; sys.textContent = P[i][0]; typeOut(out, P[i][1], tok); };
    choice($('#sp-pick'), (b) => show(Number(b.dataset.i)));
    sys.textContent = P[0][0]; out.textContent = P[0][1];
  }

  // ── Cache calculator ───────────────────────────────────
  const ccBars = $('#cc-bars');
  if (ccBars) {
    const d = ccBars.dataset, inP = +d.in, outP = +d.out, rd = +d.read, fresh = +d.fresh, outTok = +d.outtok;
    const t = $('#cc-t'), p = $('#cc-p'), [bNo, bYes] = $$('div', ccBars);
    const render = () => {
      const n = +t.value, pre = +p.value;
      $('#cc-tv').textContent = n; $('#cc-pv').textContent = fmt(pre);
      const no = (n * (pre + fresh) * inP + n * outTok * outP) / 1e6;
      const yes = ((pre + fresh) * inP + (n - 1) * (pre * rd + fresh * inP) + n * outTok * outP) / 1e6;
      bNo.querySelector('b').textContent = money(no);
      bYes.querySelector('b').textContent = money(yes);
      bYes.querySelector('i').style.setProperty('--w', `${(yes / no * 100).toFixed(1)}%`);
      $('#cc-save').replaceChildren(el('b', { textContent: `${Math.round((1 - yes / no) * 100)}%` }), ' cheaper with caching · saves ', el('b', { textContent: money(no - yes) }));
    };
    t.addEventListener('input', render); p.addEventListener('input', render);
    render();
  }

  // ── Reasoning effort ───────────────────────────────────
  if ($('#w-think')) {
    const thoughts = [
      'It fails only on Mondays, so something depends on the weekday.',
      'The test formats new Date() and compares it to a fixed string.',
      'CI runs in UTC; laptops usually don’t. Could be a timezone gap.',
      'Check: Monday 00:30 local time is still Sunday in UTC. That’s the bug.',
      'Does it fail late Sunday night too? Yes — same mismatch, other way round.',
      'Fix: build the date in UTC, or pass a fixed date into the test.',
      'Search for other tests calling new Date() without a timezone…',
      'Two more do. Mention them so they get fixed too.',
    ];
    const L = [
      { n: 0, think: 0, ans: 120, a: 'Probably a flaky test. Try running it again.' },
      { n: 2, think: 1500, ans: 250, a: 'Likely date-related — check how the test builds its dates.' },
      { n: 4, think: 6000, ans: 400, a: 'Timezone bug: CI runs in UTC, so early on Monday it’s still Sunday there. Build the date in UTC.' },
      { n: 8, think: 24000, ans: 600, a: 'Timezone bug (CI runs in UTC). Build dates in UTC — and two other tests have the same problem.' },
    ];
    const group = $('#rz-pick'), outP = Number(group.dataset.out), trace = $('#rz-trace'), barT = $('#rz-bar .t'), barA = $('#rz-bar .a'), read = $('#rz-read');
    let tok = { cancelled: true };
    const show = async (i) => {
      tok.cancelled = true; const my = tok = { cancelled: false };
      const lv = L[i], max = L[3].think + L[3].ans;
      barT.style.setProperty('--w', `${(lv.think / max * 100).toFixed(2)}%`);
      barA.style.setProperty('--w', `${Math.max(1.5, lv.ans / max * 100).toFixed(2)}%`);
      read.replaceChildren(el('b', { textContent: fmt(lv.think) }), ' thinking + ', el('b', { textContent: fmt(lv.ans) }), ` answer tokens ≈ `, el('b', { textContent: money((lv.think + lv.ans) * outP / 1e6) }), ' per reply');
      trace.replaceChildren();
      for (let k = 0; k < lv.n; k++) {
        if (my.cancelled) return;
        trace.append(el('p', { className: 'th', textContent: thoughts[k] }));
        if (!reduced) await sleep(260);
      }
      if (my.cancelled) return;
      trace.append(el('p', { className: 'ans', textContent: lv.a }));
    };
    choice(group, (b) => show(Number(b.dataset.i)));
    show(2);
  }

  // ── Agent loop ─────────────────────────────────────────
  if ($('#w-agent')) {
    const S = [
      ['think', 'The user says the tests fail. Run them first to see the error.'],
      ['call', 'run_command("npm test")'],
      ['result', 'FAIL  src/date.test.js › formats Monday\n  Expected: "Mon"   Received: "Sun"'],
      ['think', 'Off by one day — smells like a timezone issue. Read the function.'],
      ['call', 'read_file("src/date.js")'],
      ['result', 'export const day = (d) => DAYS[new Date(d).getDay()];'],
      ['think', 'getDay() uses local time, but the test date is UTC. Use getUTCDay().'],
      ['call', 'edit_file("src/date.js", "getDay()" → "getUTCDay()")'],
      ['result', 'Edited 1 line.'],
      ['call', 'run_command("npm test")'],
      ['result', 'PASS  12 tests passed'],
      ['done', 'Fixed: day() used local time instead of UTC. Switched to getUTCDay(); all 12 tests pass.'],
    ];
    const LBL = { think: 'Model thinks', call: 'Tool call', result: 'Tool result', done: 'Answer' };
    const log = $('#ag-log'), loop = $$('#ag-loop li'), n = $('#ag-n'), next = $('#ag-next'), auto = $('#ag-auto');
    let i = 0, timer = null;
    const mark = (k) => loop.forEach((li) => li.classList.toggle('on', li.dataset.k === k));
    const step = () => {
      if (i >= S.length) return stopAuto();
      const [k, text] = S[i++];
      const row = el('div', { className: `lt lt-${k}` }, el('span', { className: 'lt-k', textContent: LBL[k] }), el(k === 'think' || k === 'done' ? 'p' : 'pre', { textContent: text }));
      log.append(row);
      log.scrollTop = log.scrollHeight;
      mark(k);
      n.textContent = `Step ${i} of ${S.length}${i === S.length ? ' · done' : ''}`;
      next.disabled = i >= S.length;
      if (i >= S.length) stopAuto();
    };
    const stopAuto = () => { clearInterval(timer); timer = null; auto.textContent = 'Play'; };
    next.addEventListener('click', () => { stopAuto(); step(); });
    auto.addEventListener('click', () => {
      if (timer) return stopAuto();
      if (i >= S.length) reset();
      auto.textContent = 'Pause'; step(); timer = setInterval(step, 1100);
    });
    const reset = () => { stopAuto(); i = 0; log.replaceChildren(); mark(''); n.textContent = `${S.length} steps`; next.disabled = false; };
    $('#ag-reset').addEventListener('click', reset);
    reset();
  }

  // ── MCP hub ────────────────────────────────────────────
  if ($('#w-mcp')) {
    const T = {
      github: ['create_pull_request', 'list_issues', 'get_file_contents', 'search_code'],
      postgres: ['query', 'list_tables', 'describe_table'],
      browser: ['navigate', 'click', 'screenshot', 'read_page'],
      figma: ['get_design', 'get_variables', 'export_image'],
      sentry: ['list_issues', 'get_stack_trace', 'resolve_issue'],
    };
    const tools = $('#mc-tools'), count = $('#mc-count'), btns = $$('.lmcp-s');
    const render = (added) => {
      const on = btns.filter((b) => b.getAttribute('aria-pressed') === 'true');
      const total = on.reduce((a, b) => a + T[b.dataset.k].length, 0);
      count.textContent = `${total} tool${total === 1 ? '' : 's'} available`;
      $('#mc-hub').classList.toggle('live', on.length > 0);
      tools.replaceChildren(...(on.length ? on.flatMap((b) => T[b.dataset.k].map((t) => el('code', { className: b.dataset.k === added ? 'new' : '', textContent: `${b.dataset.k}.${t}` })))
        : [el('span', { className: 'muted small', textContent: 'No servers plugged in — the model can only write text.' })]));
    };
    btns.forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      render(on ? b.dataset.k : null);
    }));
    btns[0].setAttribute('aria-pressed', 'true');
    render();
  }

  // ── Embeddings map ─────────────────────────────────────
  if ($('#w-emb')) {
    const NS = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const D = [
      ['Login fails after password reset', 110, 62, 'a'], ['OAuth callback returns 401', 196, 100, 'a'], ['Session cookie expires too early', 70, 128, 'a'], ['Two-factor setup guide', 168, 40, 'a'],
      ['Images not lazy-loaded', 450, 58, 'p'], ['Slow SQL query on dashboard', 552, 104, 'p'], ['Bundle grew to 4 MB', 478, 140, 'p'], ['CDN cache for static assets', 566, 46, 'p'],
      ['Navbar overlaps content on mobile', 112, 248, 'u'], ['Dark mode contrast too low', 200, 296, 'u'], ['Button padding broken in Safari', 176, 222, 'u'], ['Responsive grid breakpoints', 72, 300, 'u'],
      ['Docker build fails on CI', 444, 238, 'd'], ['Staging deploy checklist', 520, 282, 'd'], ['Roll back a bad release', 574, 226, 'd'], ['Production environment variables', 470, 308, 'd'],
    ];
    const Q = [[132, 92], [506, 92], [140, 262], [512, 262]];
    const svg = $('#em-map'), hits = $('#em-hits');
    const lines = svgEl('g', { class: 'el' }), dots = svgEl('g', {});
    svg.append(lines, dots);
    const nodes = D.map(([t, x, y, c]) => {
      const g = svgEl('g', { class: `ed ed-${c}` });
      g.append(svgEl('circle', { cx: x, cy: y, r: 5 }));
      const tx = svgEl('text', { x: x + (x > 320 ? -9 : 9), y: y + 4, 'text-anchor': x > 320 ? 'end' : 'start' });
      tx.textContent = t; g.append(tx); dots.append(g); return g;
    });
    const qDot = svgEl('g', { class: 'eq', opacity: 0 });
    qDot.append(svgEl('circle', { r: 8 }), svgEl('circle', { r: 16, class: 'ring' }));
    svg.append(qDot);
    choice($('#em-q'), (b) => {
      const [qx, qy] = Q[b.dataset.i];
      const ranked = D.map(([t, x, y], i) => ({ i, t, x, y, d: Math.hypot(x - qx, y - qy) })).sort((a, z) => a.d - z.d);
      const top = ranked.slice(0, 3);
      qDot.setAttribute('transform', `translate(${qx} ${qy})`); qDot.setAttribute('opacity', 1);
      lines.replaceChildren(...top.map((r) => svgEl('line', { x1: qx, y1: qy, x2: r.x, y2: r.y })));
      nodes.forEach((g, i) => g.classList.toggle('hit', top.some((r) => r.i === i)));
      svg.classList.add('q');
      hits.replaceChildren(...top.map((r) => el('li', {}, el('span', { textContent: r.t }), el('b', { textContent: (1 - r.d / 900).toFixed(2) }))));
    });
    hits.replaceChildren(el('li', { className: 'muted' }, 'Pick a question to search the documents.'));
  }

  // ── Hallucination quiz ─────────────────────────────────
  if ($('#qz')) {
    const QZ = [
      ['Which JavaScript array method doesn’t exist?', ['arr.findLast()', 'arr.flatMap()', 'arr.removeWhere()'], 2, 'findLast() and flatMap() are real. There is no removeWhere() — you’d use filter().'],
      ['Which Python call is made up?', ['"v1.2".removeprefix("v")', 'my_list.sorted()', 'my_dict.setdefault("k", [])'], 1, 'Lists have .sort(), which works in place; sorted() is a built-in function, not a list method.'],
      ['Which git command isn’t built in?', ['git switch main', 'git restore app.js', 'git undo'], 2, 'switch and restore are real (Git 2.23+). There is no built-in git undo — you’d reach for git reset or git revert.'],
      ['Which CSS line would do nothing?', ['text-wrap: balance;', 'container-type: inline-size;', 'flex-gap: 8px;'], 2, 'The property is just gap. flex-gap sounds right, which is exactly why a model might write it.'],
    ];
    const box = $('#qz'), score = $('#qz-score');
    let right = 0, done = 0;
    QZ.forEach(([q, opts, fake, why], qi) => {
      const card = el('div', { className: 'lq' }, el('p', { className: 'lq-q', textContent: `${qi + 1}. ${q}` }));
      const row = el('div', { className: 'lq-opts' });
      const explain = el('p', { className: 'lq-why', hidden: true, textContent: why });
      opts.forEach((o, oi) => {
        const b = el('button', { type: 'button', className: 'lq-o' }, el('code', { textContent: o }));
        b.addEventListener('click', () => {
          if (card.dataset.done) return;
          card.dataset.done = '1'; done++;
          if (oi === fake) right++;
          $$('.lq-o', row).forEach((x, xi) => { x.disabled = true; x.classList.add(xi === fake ? 'fake' : 'real'); if (xi === oi) x.classList.add('chosen'); });
          explain.hidden = false;
          score.textContent = done === QZ.length ? `You spotted ${right} of ${QZ.length}. ${right === QZ.length ? 'Sharp eyes — now imagine checking every line a model writes.' : 'Plausible fakes are hard to catch. That’s why running the code matters.'}` : `${right} of ${done} so far`;
        });
        row.append(b);
      });
      card.append(row, explain); box.append(card);
    });
  }

  // ── Training stages ────────────────────────────────────
  if ($('#w-train')) {
    const ST = [
      ['Model after pre-training', 'Write a function that checks whether a word is a palindrome.\nWrite a function that counts the vowels in a string.\nWrite a function that reverses each word in a sentence.\n\n— posted by user_4821 · 14 replies', 'It just continues the text. It has seen lists of exercises like this, so it writes more of them. All knowledge, no manners.'],
      ['Model after fine-tuning', 'def is_palindrome(word):\n    return word == word[::-1]', 'Now it answers the question. But “Racecar” or “A man, a plan, a canal: Panama” would come back False.'],
      ['Model after reinforcement learning', 'def is_palindrome(text: str) -> bool:\n    letters = [c.lower() for c in text if c.isalnum()]\n    return letters == letters[::-1]\n\nassert is_palindrome("Racecar")\nassert is_palindrome("A man, a plan, a canal: Panama")\nassert not is_palindrome("patchwire")', 'Rewarded for passing hidden tests, it learned to handle case and punctuation — and to check its own work.'],
    ];
    const out = $('#tr-out'), who = $('#tr-who'), note = $('#tr-note');
    let tok = { cancelled: true };
    const show = (i, animate = true) => {
      tok.cancelled = true; tok = { cancelled: false };
      who.textContent = ST[i][0]; note.textContent = ST[i][2];
      $('#w-train').dataset.stage = i;
      if (animate) typeOut(out, ST[i][1], tok); else out.textContent = ST[i][1];
    };
    choice($('#tr-pick'), (b) => show(Number(b.dataset.i)));
    show(0, false);
  }

  // ── Mixture of experts ─────────────────────────────────
  if ($('#w-moe')) {
    const words = ['def', ' parse', '_date', '(', 's', ')', ':', ' return', ' datetime', '.', 'strptime', '(', 's', ',', ' "%Y"', ')'];
    const seq = $('#mo-seq'), tokText = $('#mo-tok'), use = $('#mo-use'), auto = $('#mo-auto');
    const parts = $$('[data-e]', $('#mo-svg'));
    let i = 0, used = new Set(), timer = null;
    const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const step = () => {
      const w = words[i % words.length], h = hash(w + (i % 3));
      const a = h % 8; let b = (h >> 4) % 8; if (b === a) b = (a + 3) % 8;
      parts.forEach((p) => p.classList.toggle('on', +p.dataset.e === a || +p.dataset.e === b));
      used.add(a); used.add(b);
      tokText.textContent = JSON.stringify(w.trim() || '␣').slice(1, -1).slice(0, 9);
      seq.replaceChildren(...words.map((x, k) => el('span', { className: k < (i % words.length) ? 'done' : k === i % words.length ? 'now' : '', textContent: x })));
      use.textContent = `This token: experts ${Math.min(a, b) + 1} & ${Math.max(a, b) + 1} · used so far: ${used.size} of 8`;
      i++;
      if (i % words.length === 0) used = new Set();
    };
    const stopAuto = () => { clearInterval(timer); timer = null; auto.textContent = 'Play'; };
    $('#mo-next').addEventListener('click', () => { stopAuto(); step(); });
    auto.addEventListener('click', () => { if (timer) return stopAuto(); auto.textContent = 'Pause'; step(); timer = setInterval(step, 700); });
    seq.replaceChildren(...words.map((x) => el('span', { textContent: x })));
    use.textContent = 'Press “Send next token” to route the sentence, one token at a time.';
  }

  // ── Quantization ───────────────────────────────────────
  if ($('#w-quant')) {
    const BITS = [32, 16, 8, 4, 2];
    const b = $('#qt-b'), ref = $('#qt-wave .ref'), q = $('#qt-wave .q');
    let size = 70;
    const f = (x) => 0.62 * Math.sin(x * 2.1) + 0.28 * Math.sin(x * 5.3 + 1) + 0.08 * Math.sin(x * 13);
    const path = (fn) => Array.from({ length: 301 }, (_, k) => { const x = k / 300 * 6; return `${k ? 'L' : 'M'}${(k * 2).toFixed(1)} ${(60 - fn(x) * 52).toFixed(2)}`; }).join('');
    ref.setAttribute('d', path(f));
    const render = () => {
      const bits = BITS[b.value];
      $('#qt-bv').textContent = bits;
      const levels = 2 ** Math.min(bits, 12), stepQ = 2 / (levels - 1);
      q.setAttribute('d', path((x) => Math.round((f(x) + 1) / stepQ) * stepQ - 1));
      const gb = size * bits / 8;
      $('#qt-mem').replaceChildren(el('b', { textContent: gb >= 1000 ? `${+(gb / 1000).toFixed(2)} TB` : `${+gb.toFixed(gb < 10 ? 1 : 0)} GB` }), ` of memory just to hold a ${size >= 1000 ? '1-trillion' : `${size}-billion`}-parameter model's weights at ${bits}-bit`);
      const fit = gb <= 16 ? 'Fits on a good laptop.' : gb <= 24 ? 'Fits on one 24 GB gaming GPU.' : gb <= 80 ? 'Needs one 80 GB data-centre GPU.' : `Needs about ${Math.ceil(gb / 80)} data-centre GPUs (80 GB each).`;
      $('#qt-fit').textContent = `${fit} ${bits >= 16 ? 'Full quality.' : bits === 8 ? 'Quality is nearly identical.' : bits === 4 ? 'Usually a small, sometimes noticeable quality drop.' : 'Heavy rounding — quality drops a lot.'}`;
    };
    b.addEventListener('input', render);
    choice($('#qt-size'), (x) => { size = Number(x.dataset.v); render(); });
    render();
  }

  // ── Generic tab switchers (open/closed list, benchmarks) ─
  choice($('#wt-pick'), (b) => $$('#w-weights .lmlist').forEach((u) => { u.hidden = u.dataset.k !== b.dataset.k; }));
  choice($('#bm-pick'), (b) => $$('#w-bench .lbench').forEach((u) => { u.hidden = u.dataset.i !== b.dataset.i; }));

  // ── Image tokens ───────────────────────────────────────
  if ($('#w-img')) {
    const s = $('#im-s'), grid = $('#im-grid');
    const render = () => {
      const w = Number(s.value), h = Math.round(w * 0.75), tokens = Math.round(w * h / 750);
      $('#im-sv').textContent = `${w} × ${h}`;
      const cols = Math.max(4, Math.round(w / 64)), rows = Math.max(3, Math.round(h / 64));
      grid.style.setProperty('--cols', cols); grid.style.setProperty('--rows', rows);
      grid.dataset.n = `${cols * rows} patches shown`;
      $('#im-tok').replaceChildren(el('b', { textContent: `≈ ${fmt(tokens)}` }), ' tokens');
      $('#im-eq').textContent = `About as much context as ${fmt(tokens * 0.75)} words of text. Most providers shrink very large images first, which caps the count.`;
    };
    s.addEventListener('input', render);
    render();
  }

  // ── Speed simulator ────────────────────────────────────
  if ($('#w-speed')) {
    const CODE = `import { readFile } from "node:fs/promises";

// Parse a CSV file into an array of objects keyed by the header row.
export async function parseCsv(path) {
  const text = await readFile(path, "utf8");
  const [header, ...rows] = text.trim().split("\\n");
  const keys = header.split(",").map((k) => k.trim());
  return rows.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(keys.map((k, i) => [k, cells[i]?.trim() ?? ""]));
  });
}

const people = await parseCsv("people.csv");
console.log(\`Loaded \${people.length} rows\`);
`;
    const toks = tokSplit(CODE);
    const t = $('#sd-t'), sp = $('#sd-s'), out = $('#sd-out'), clock = $('#sd-clock'), run = $('#sd-run'), est = $('#sd-est');
    let raf = 0;
    const label = () => {
      $('#sd-tv').textContent = `${Number(t.value).toFixed(1)} s`; $('#sd-sv').textContent = sp.value;
      est.textContent = `≈ ${(Number(t.value) + toks.length / Number(sp.value)).toFixed(1)} s for this ${toks.length}-token answer`;
    };
    const pre = choice($('#sd-pre'), (b) => { t.value = b.dataset.t; sp.value = b.dataset.s; label(); });
    const unpick = () => { pre.btns.forEach((x) => x.setAttribute('aria-checked', 'false')); label(); };
    t.addEventListener('input', unpick); sp.addEventListener('input', unpick);
    run.addEventListener('click', () => {
      cancelAnimationFrame(raf);
      const ttft = Number(t.value) * 1000, rate = Number(sp.value), t0 = performance.now();
      out.textContent = ''; out.classList.add('wait');
      const tick = (now) => {
        const ms = now - t0;
        clock.textContent = `${(ms / 1000).toFixed(1)} s`;
        if (ms < ttft) { raf = requestAnimationFrame(tick); return; }
        out.classList.remove('wait');
        const n = Math.min(toks.length, Math.floor((ms - ttft) / 1000 * rate));
        out.textContent = toks.slice(0, n).join('');
        out.scrollTop = out.scrollHeight;
        if (n < toks.length) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    label();
  }

  // ── Narration player ───────────────────────────────────
  const player = $('#lplayer');
  if (!player) return;
  const playBtns = $$('.lplay'), secs = $$('.lsec');
  const rateSel = $('#lp-rate'), voiceSel = $('#lp-voice'), voiceOpt = $('.lp-voice'), title = $('#lp-title'), toggle = $('#lp-toggle');
  const barEl = $('#lp-bar'), timeEl = $('#lp-time');
  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
  rateSel.value = load('lp-rate') || '1';
  const audio = new Audio();
  audio.preload = 'auto';
  const synth = window.speechSynthesis;
  const canSpeak = !!synth && typeof SpeechSynthesisUtterance !== 'undefined';
  if (!canSpeak) secs.forEach((s) => { if (!s.dataset.audio) { const b = $('.lplay', s); if (b) { b.disabled = true; b.title = 'Read-aloud is not supported in this browser'; } } });

  // Browser voices for chapters without a recording; natural / neural voices first.
  const natural = /natural|neural|online|premium|enhanced|google/i;
  let voices = [];
  const loadVoices = () => {
    if (!canSpeak) return;
    voices = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang)).sort((a, b) => (natural.test(b.name) - natural.test(a.name)) || a.lang.localeCompare(b.lang));
    if (!voices.length) return;
    const saved = load('lp-voice');
    voiceSel.replaceChildren(...voices.map((v) => new Option(`${v.name.replace(/^Microsoft /, '')} (${v.lang})`, v.name, false, v.name === saved)));
  };
  if (canSpeak) {
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
    setTimeout(() => { if (!voices.length) voiceSel.replaceChildren(new Option('System default', '')); }, 3000);
  }

  // ── Live demos in sync with the narration ──────────────
  // captions.json holds each recording's phrases as [start, end, text] (Magnific word timings).
  // Each cue names words the narrator says; when playback reaches them, the chapter's demo acts them out.
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const seq = (fns, gap = 450) => fns.forEach((f, i) => later(f, i * gap));
  const click = (sel) => $(sel)?.click();
  const pickIn = (sel, test) => { const b = $$(`${sel} button`).find(test); if (b && b.getAttribute('aria-checked') !== 'true' && b.getAttribute('aria-selected') !== 'true') b.click(); };
  const nth = (sel, i) => pickIn(sel, (_, j) => j === i);
  // Glide a slider to a value, firing input events so the demo redraws as it moves.
  const glide = (sel, to, ms = 700) => {
    const r = $(sel); if (!r) return;
    const from = Number(r.value), t0 = performance.now(), my = (r.dataset.glide = String(t0));
    const step = (now) => {
      if (r.dataset.glide !== my) return;
      const k = reduced ? 1 : Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
      r.value = from + (to - from) * e; r.dispatchEvent(new Event('input'));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const typeIn = (sel, text) => {
    const ta = $(sel); if (!ta) return;
    const my = (ta.dataset.typing = String(performance.now()));
    let n = 0;
    const tick = () => { if (ta.dataset.typing !== my) return; n = Math.min(text.length, n + 2); ta.value = text.slice(0, n); ta.dispatchEvent(new Event('input')); if (n < text.length) later(tick, reduced ? 0 : 28); };
    tick();
  };
  const pulse = (e) => { if (!e) return; e.classList.remove('cue'); void e.offsetWidth; e.classList.add('cue'); };
  const plug = (k, on) => { const b = $(`.lmcp-s[data-k="${k}"]`); if (b && (b.getAttribute('aria-pressed') === 'true') !== on) b.click(); };
  const agentTo = (n) => { const done = $$('#ag-log .lt').length; if (n < done) click('#ag-reset'); for (let k = Math.min(done, n); k < n; k++) click('#ag-next'); };
  const moeAuto = (on) => { const b = $('#mo-auto'); if (b && (b.textContent === 'Pause') !== on) b.click(); };
  const speedRun = (t, s) => { const T = $('#sd-t'), S = $('#sd-s'); T.value = t; S.value = s; T.dispatchEvent(new Event('input')); S.dispatchEvent(new Event('input')); click('#sd-run'); };
  const QB = [32, 16, 8, 4, 2], bits = (b) => glide('#qt-b', QB.indexOf(b), 300);
  const CUES = {
    how: [
      ['At every step', () => { glide('#tp-t', 0.7); click('#tp-one'); }], ['One piece is picked', () => click('#tp-one')], ['word by word', () => click('#tp-one')],
      ['Low temperature', () => glide('#tp-t', 0)], ['takes the top choice', () => click('#tp-many')],
      ['Higher temperature', () => glide('#tp-t', 1.6, 1200)], ['less likely words', () => click('#tp-many')],
      ['Drag the temperature', () => glide('#tp-t', 0.7)],
    ],
    tokens: [
      ['They read tokens', () => typeIn('#tokin', 'Models read tokens, not letters or words.')],
      ['Common words like', () => typeIn('#tokin', 'the cat sat on the mat')],
      ['A rare word', () => typeIn('#tokin', 'tokenization internationalization')],
      ['Code usually takes', () => typeIn('#tokin', 'if (user?.id) { return fetch(`/api/${id}`); }')],
      ['how they\'re billed', () => pulse($('#tokstats'))],
      ['Try the token counter', () => typeIn('#tokin', 'Patchwire tracks AI coding tools. function add(a, b) { return a + b; }')],
    ],
    context: [
      ['in one go', () => { click('#cx-reset'); nth('#cx-size', 1); }], ['the files a', () => click('[data-add="file"]')], ['conversation so far', () => click('[data-add="chat"]')],
      ['coding agent has opened', () => click('[data-add="file"]')],
      ['one million token window', () => { nth('#cx-size', 2); later(() => click('[data-add="repo"]'), 500); }],
      ['when the window fills up', () => { click('#cx-reset'); nth('#cx-size', 0); seq(['file', 'chat', 'file', 'chat'].map((k) => () => click(`[data-add="${k}"]`)), 380); }],
      ['the oldest', () => click('[data-add="file"]')], ['dropped, or summarized', () => click('[data-add="chat"]')],
    ],
    prompts: [
      ['Everything you type', () => nth('#sp-pick', 0)], ['called the system prompt', () => nth('#sp-pick', 1)], ['who it is', () => nth('#sp-pick', 2)],
      ['what style to write in', () => nth('#sp-pick', 3)], ['Same brain', () => nth('#sp-pick', 4)], ['Good prompts are specific', () => nth('#sp-pick', 1)],
      ['Switch between', () => nth('#sp-pick', 0)],
    ],
    cache: [
      ['over and over', () => { glide('#cc-t', 2, 400); glide('#cc-p', 60000, 400); }], ['Prompt caching fixes this', () => glide('#cc-t', 40, 2600)],
      ['That reuse is a cache hit', () => pulse($('#cc-bars'))], ['steep discount', () => pulse($('#cc-save'))],
      ['help most in', () => glide('#cc-t', 120, 1800)], ['Move the sliders', () => glide('#cc-p', 200000, 1800)],
    ],
    reasoning: [
      ['Reasoning tokens.', () => nth('#rz-pick', 0)], ['Instead of replying', () => nth('#rz-pick', 1)], ['checking it', () => nth('#rz-pick', 2)],
      ['much better at hard problems', () => nth('#rz-pick', 3)], ['billed as output', () => pulse($('#rz-bar'))],
      ['from low to high', () => seq([0, 1, 2, 3].map((i) => () => nth('#rz-pick', i)), 500)],
    ],
    tools: [
      ['Tool calling changes that', () => agentTo(0)], ['which tools exist', () => agentTo(1)], ['structured', () => agentTo(2)], ['The app runs that tool', () => agentTo(3)],
      ['decides what to do next', () => agentTo(4)], ['Read the failing test', () => agentTo(5)], ['Open the file', () => agentTo(6)], ['Make a change', () => agentTo(8)],
      ['Run the tests again', () => agentTo(10)], ['Repeat until they pass', () => agentTo(11)], ['at heart', () => agentTo(12)],
    ],
    mcp: [
      ['Every tool a model', () => ['github', 'postgres', 'browser', 'figma', 'sentry'].forEach((k) => plug(k, false))],
      ['such as GitHub', () => plug('github', true)], ['database', () => plug('postgres', true)], ['a browser', () => plug('browser', true)],
      ['design files', () => plug('figma', true)], ['works everywhere', () => plug('sentry', true)],
    ],
    embeddings: [
      ['Fix the login bug', () => nth('#em-q', 0)], ['search by meaning possible', () => nth('#em-q', 1)], ['closest documents', () => nth('#em-q', 2)],
      ['RAG', () => nth('#em-q', 3)], ['Pick a question', () => nth('#em-q', 0)],
    ],
    hallucinations: [
      ['a function that doesn', () => pulse($$('.lq')[0])], ['config option', () => pulse($$('.lq')[3])], ['package name', () => pulse($$('.lq')[1])],
      ['Try the quiz', () => $$('.lq').forEach((q, i) => later(() => pulse(q), i * 250))],
    ],
    training: [['First comes pre-training', () => nth('#tr-pick', 0)], ['fine-tuning', () => nth('#tr-pick', 1)], ['reinforcement learning', () => nth('#tr-pick', 2)]],
    moe: [['A mixture of experts model', () => click('#mo-next')], ['a small router', () => moeAuto(true)], ['Press the button', () => moeAuto(false)]],
    quant: [
      ['Every parameter', () => bits(16)], ['eight bits', () => bits(8)], ['four bits', () => bits(4)], ['instead of sixteen', () => bits(16)],
      ['Halving the bits', () => seq([16, 8, 4].map((b) => () => bits(b)), 700)], ['different precisions', () => nth('#qt-size', 2)],
      ['rounded away', () => bits(2)],
    ],
    weights: [['Some labs keep', () => nth('#wt-pick', 1)], ['Others publish', () => nth('#wt-pick', 0)], ['Closed models have often', () => nth('#wt-pick', 1)], ['Open models give you choice', () => nth('#wt-pick', 0)]],
    multimodal: [['Under the hood', () => glide('#im-s', 256, 500)], ['cut into small patches', () => glide('#im-s', 2048, 2600)], ['a page of text', () => glide('#im-s', 1024, 800)]],
    speed: [
      ['Latency, or time', () => nth('#sd-pre', 0)], ['fifty tokens a second', () => speedRun(0.5, 50)], ['five hundred tokens a second', () => speedRun(0.5, 500)],
      ['Reasoning models also spend', () => { nth('#sd-pre', 0); click('#sd-run'); }], ['press run', () => { nth('#sd-pre', 1); click('#sd-run'); }],
    ],
    benchmarks: [
      ['exam-style questions', () => pickIn('#bm-pick', (b) => b.dataset.b === 'gpqa')], ['Coding benchmarks', () => pickIn('#bm-pick', (b) => b.dataset.b === 'swe')],
      ['says little about', () => pickIn('#bm-pick', (b) => b.dataset.b === 'hle')], ['Our leaderboard', () => pickIn('#bm-pick', (b) => b.dataset.b === 'arc2')],
    ],
  };
  const capEl = $('#lp-cap'), ccBtn = $('#lp-cc');
  let captions = null, capOn = load('lp-cc') !== '0';
  ccBtn.setAttribute('aria-pressed', String(capOn));
  ccBtn.addEventListener('click', () => { capOn = !capOn; ccBtn.setAttribute('aria-pressed', String(capOn)); save('lp-cc', capOn ? '1' : '0'); player.classList.toggle('cc-off', !capOn); });
  player.classList.toggle('cc-off', !capOn);
  const loadCaptions = () => captions || (captions = fetch(player.dataset.captions).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  // The moment a snippet is spoken: its phrase's start plus its share of the phrase's characters.
  const timeOf = (phrases, text) => {
    const q = text.toLowerCase();
    for (const [a, b, p] of phrases) { const k = p.toLowerCase().indexOf(q); if (k >= 0) return a + (b - a) * (k / p.length); }
    return null;
  };
  const sync = (() => {
    let id = null, phrases = [], cues = [], last = -1, raf = 0, curP = -1, took = false, lastScroll = 0;
    const demo = () => id && $(`#${id} .lw`);
    addEventListener('wheel', () => { lastScroll = performance.now(); }, { passive: true });
    addEventListener('touchmove', () => { lastScroll = performance.now(); }, { passive: true });
    // A click inside a demo during narration hands it to the reader for the rest of the chapter.
    document.addEventListener('pointerdown', (e) => { const d = demo(); if (e.isTrusted && d && d.contains(e.target) && id) { took = true; d.classList.remove('lw-live'); d.classList.add('lw-yours'); } }, true);
    const caption = (t) => {
      const i = phrases.findIndex(([a, b], k) => t >= a && (t < (phrases[k + 1]?.[0] ?? b + 1)));
      if (i < 0) return;
      if (i !== curP) {
        curP = i;
        capEl.replaceChildren(...phrases[i][2].split(' ').map((w) => el('span', { textContent: `${w} ` })));
      }
      const [a, b, p] = phrases[i], k = Math.max(0, Math.min(1, (t - a) / Math.max(0.01, b - a))) * p.length;
      let n = 0;
      [...capEl.children].forEach((s) => { const len = s.textContent.length; s.className = n + len <= k ? 'past' : n <= k ? 'on' : ''; n += len; });
    };
    const fire = ([, fn]) => {
      if (took) return;
      const d = demo();
      if (d) {
        pulse(d);
        const r = d.getBoundingClientRect();
        if ((r.top < 60 || r.bottom > innerHeight - 140) && performance.now() - lastScroll > 4000) d.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      }
      try { fn(); } catch { /* a demo missing from this build */ }
    };
    const step = () => {
      if (!id) return;
      const t = audio.currentTime;
      if (t < last - 0.75) last = t - 0.01; // seeked back: re-arm what's ahead without replaying the past
      for (const c of cues) if (c[0] > last && c[0] <= t) fire(c.slice(1));
      last = t;
      caption(t);
    };
    const tick = () => { step(); if (id && !audio.paused) raf = requestAnimationFrame(tick); };
    return {
      begin(chapterId) {
        this.clear();
        id = chapterId; took = false;
        demo()?.classList.add('lw-live');
        loadCaptions().then((all) => {
          if (id !== chapterId) return;
          phrases = all[chapterId] || [];
          cues = (CUES[chapterId] || []).map(([text, fn]) => [timeOf(phrases, text), text, fn]).filter((c) => c[0] != null).sort((a, b) => a[0] - b[0]);
          player.classList.toggle('has-cap', phrases.length > 0);
        });
      },
      run() { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); },
      // timeupdate keeps cues firing in a background tab, where animation frames stop.
      poke() { if (document.hidden) step(); },
      clear() {
        cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers.clear();
        $$('.lw-live, .lw-yours').forEach((d) => d.classList.remove('lw-live', 'lw-yours'));
        id = null; phrases = []; cues = []; last = -1; curP = -1;
        capEl.replaceChildren(); player.classList.remove('has-cap');
      },
    };
  })();

  let idx = -1, mode = 'one', running = false, speaking = false, queue = [], qi = 0, current = null, lit = null;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const setState = (s) => { player.dataset.state = s; toggle.setAttribute('aria-label', s === 'paused' ? 'Resume' : 'Pause'); };
  const light = (e) => { lit?.classList.remove('saying'); lit = e; e?.classList.add('saying'); };
  const into = (e) => { const r = e.getBoundingClientRect(); if (r.top < 70 || r.top > innerHeight - 160) e.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }); };
  const pressed = () => playBtns.forEach((b) => {
    const on = running && (mode === 'all' ? b.dataset.play === 'all' : b.dataset.play === secs[idx]?.id);
    if (on) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed');
  });
  const halt = () => { audio.pause(); sync.clear(); speaking = false; current = null; if (canSpeak) synth.cancel(); light(null); };
  const stop = () => {
    running = false; halt();
    secs.forEach((s) => s.classList.remove('lsec-on'));
    player.hidden = true; pressed();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  };
  const ended = () => { if (mode === 'all' && idx < secs.length - 1) chapter(idx + 1); else stop(); };

  // Browser speech for chapters without a recording: headings and prose, a sentence at a time.
  const readable = (e) => {
    const ns = e.closest('.no-say');
    if (ns && !(ns === e && e.dataset.say)) return false;
    if (e.closest('.lhead') && e.tagName !== 'H2') return false;
    return true;
  };
  const sentences = (text) => text.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean);
  const speakNext = () => {
    if (!running) return;
    if (qi >= queue.length) return ended();
    const item = queue[qi], u = new SpeechSynthesisUtterance(item.text);
    u.rate = Number(rateSel.value);
    const v = voices.find((x) => x.name === voiceSel.value);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.onstart = () => { if (current === u && player.dataset.state === 'loading') setState('playing'); };
    u.onend = () => { if (current === u) { qi++; speakNext(); } };
    u.onerror = (e) => { if (current === u && e.error !== 'interrupted' && e.error !== 'canceled') { qi++; speakNext(); } };
    current = u;
    if (item.el !== lit) { light(item.el); into(item.el); }
    barEl.style.width = `${(qi / queue.length * 100).toFixed(1)}%`;
    timeEl.textContent = '';
    synth.speak(u);
  };

  const chapter = (i) => {
    halt();
    idx = i; running = true;
    const s = secs[i];
    secs.forEach((x) => x.classList.toggle('lsec-on', x === s));
    title.textContent = `${String(i + 1).padStart(2, '0')} · ${s.dataset.title}`;
    player.hidden = false; setState('loading'); pressed();
    barEl.style.width = '0%';
    into(s);
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: s.dataset.title, artist: 'How AI actually works', album: document.title.split('|').pop().trim() });
    }
    if (s.dataset.audio) {
      voiceOpt.hidden = true;
      audio.src = s.dataset.audio;
      sync.begin(s.id);
      audio.playbackRate = Number(rateSel.value);
      audio.play().catch(() => { if (running && secs[idx] === s) { sync.clear(); speakChapter(s); } });
    } else speakChapter(s);
  };
  const speakChapter = (s) => {
    if (!canSpeak) return ended();
    voiceOpt.hidden = false; speaking = true;
    queue = $$('h2, p, li, [data-say]', s).filter(readable).flatMap((e) => sentences(e.dataset.say || e.textContent.replace(/\s+/g, ' ').trim()).map((text) => ({ el: e, text })));
    qi = 0; speakNext();
  };

  audio.addEventListener('playing', () => { if (running) { setState('playing'); sync.run(); } if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
  audio.addEventListener('waiting', () => { if (running && !audio.paused) setState('loading'); });
  audio.addEventListener('timeupdate', () => {
    sync.poke();
    if (!audio.duration) return;
    barEl.style.width = `${(audio.currentTime / audio.duration * 100).toFixed(2)}%`;
    timeEl.textContent = `${mmss(audio.currentTime)} / ${mmss(audio.duration)}`;
  });
  audio.addEventListener('ended', () => { if (running) ended(); });
  audio.addEventListener('seeked', () => { if (running && !audio.paused) sync.run(); });
  audio.addEventListener('error', () => { if (running && secs[idx]?.dataset.audio && audio.src) { sync.clear(); speakChapter(secs[idx]); } });

  const usingAudio = () => !speaking;
  const pause = () => {
    if (usingAudio()) audio.pause();
    else { current = null; synth?.cancel(); }
    setState('paused');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  };
  const resume = () => {
    if (usingAudio()) { setState('loading'); audio.play().catch(() => {}); }
    else { setState('loading'); speakNext(); }
  };
  const start = (which) => {
    mode = which === 'all' ? 'all' : 'one';
    chapter(which === 'all' ? 0 : secs.findIndex((s) => s.id === which));
  };
  playBtns.forEach((b) => b.addEventListener('click', () => (b.getAttribute('aria-pressed') === 'true' ? stop() : start(b.dataset.play))));
  toggle.addEventListener('click', () => (player.dataset.state === 'paused' ? resume() : pause()));
  $('#lp-stop').addEventListener('click', stop);
  // Previous restarts the chapter if it's a few seconds in, like a music player.
  const prev = () => (usingAudio() && audio.currentTime > 4 ? (audio.currentTime = 0) : chapter(Math.max(0, idx - 1)));
  const next = () => (idx < secs.length - 1 ? chapter(idx + 1) : stop());
  $('#lp-prev').addEventListener('click', prev);
  $('#lp-next').addEventListener('click', next);
  rateSel.addEventListener('change', () => {
    save('lp-rate', rateSel.value);
    audio.playbackRate = Number(rateSel.value);
    if (running && !usingAudio() && player.dataset.state !== 'paused') { current = null; synth.cancel(); speakNext(); }
  });
  voiceSel.addEventListener('change', () => { save('lp-voice', voiceSel.value); if (running && !usingAudio() && player.dataset.state !== 'paused') { current = null; synth.cancel(); speakNext(); } });
  // Click the progress bar to seek within a recording.
  $('.lp-prog').addEventListener('click', (e) => { if (usingAudio() && audio.duration) audio.currentTime = (e.offsetX / e.currentTarget.clientWidth) * audio.duration; });
  if ('mediaSession' in navigator) {
    const h = { play: resume, pause, stop, previoustrack: prev, nexttrack: next };
    for (const k in h) { try { navigator.mediaSession.setActionHandler(k, h[k]); } catch { /* unsupported action */ } }
  }
  addEventListener('pagehide', () => { audio.pause(); synth?.cancel(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && running) stop(); });
})();
