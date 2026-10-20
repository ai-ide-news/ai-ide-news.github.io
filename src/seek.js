// Seek: the site-wide search. It lives in the masthead; when the masthead slims down it flies out
// as an orb that keeps to a quiet patch of screen (or wherever you drag and pin it), opening into a
// pill when there's room, and a palette grows out of whatever you clicked. It searches dist/search.json
// (every page, tool, update, news story, model, lab, skill, MCP server and Learn chapter) plus the
// headings of the page you are on, and a few commands behind ">".
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const trigger = $('#seek-open');
  if (!trigger) return;
  const ROOT = trigger.dataset.root || '';
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  $$('kbd[data-mod]').forEach((k) => { k.textContent = MAC ? '⌘K' : 'Ctrl K'; });

  const TYPES = {
    here: { label: 'On this page', one: 'Here', w: 14 },
    command: { label: 'Commands', one: 'Command', w: 9 },
    page: { label: 'Pages', one: 'Page', w: 12 },
    tool: { label: 'Tools', one: 'Tool', w: 11 },
    lab: { label: 'Labs', one: 'Lab', w: 8 },
    model: { label: 'Models', one: 'Model', w: 7 },
    learn: { label: 'Learn', one: 'Chapter', w: 7 },
    news: { label: 'News', one: 'News', w: 5 },
    update: { label: 'Updates', one: 'Update', w: 3 },
    skills: { label: 'Skills', one: 'Skill', w: 3 },
    mcp: { label: 'MCP', one: 'MCP', w: 3 },
    discussion: { label: 'Discussions', one: 'HN', w: 1 },
  };
  const SCOPES = ['all', 'tool', 'update', 'news', 'model', 'lab', 'skills', 'mcp', 'learn', 'page'];
  // The section you're in gets a nudge in the ranking.
  const path = location.pathname.replace(/\/index\.html$/, '/');
  const here = /\/models\//.test(path) ? 'model' : /\/news\//.test(path) ? 'news' : /\/skills\//.test(path) ? 'skills' : /\/mcp\//.test(path) ? 'mcp' : /\/learn\//.test(path) ? 'learn' : /\/tools\//.test(path) ? 'tool' : 'update';
  const IDEAS = ['claude code', 'cursor pricing', 'free models', 'mcp github', 'reasoning', 'context window', 'gemini', 'open weights', 'codex release', 'tokens', 'copilot', 'skills'];

  // ── index ───────────────────────────────────────────
  let index = null, loading = null, fetchedAt = '';
  const prep = (it) => ({ ...it, _n: fold(it.n), _h: fold(`${it.n} ${it.s || ''} ${it.k || ''}`) });
  const load = () => loading || (loading = fetch(`${ROOT}search.json`).then((r) => r.json()).then((j) => {
    fetchedAt = j.generatedAt;
    index = j.items.map(prep);
    return index;
  }).catch(() => { loading = null; return []; }));
  ('requestIdleCallback' in window ? requestIdleCallback : setTimeout)(() => load(), { timeout: 4000 });

  // Things only this page knows about: its section headings.
  const pageItems = () => $$('main h2, main h3, main [data-title]').filter((h) => h.offsetParent && !h.closest('.seek, .fcard, .ncard, .ecard, .vcard, .sk-row, details')).map((h, i) => {
    const target = h.closest('section[id]') || h;
    if (!target.id) target.id = `seek-${i}`;
    const n = (h.dataset.title || h.textContent).replace(/\s+/g, ' ').trim();
    return prep({ t: 'here', n, s: 'Jump on this page', u: `#${target.id}`, el: target });
  }).filter((x, i, a) => x.n && x.n.length < 90 && a.findIndex((y) => y.n === x.n) === i);

  const COMMANDS = [
    { n: 'Toggle light / dark theme', k: 'theme dark light mode', run: () => $('#theme')?.click() },
    { n: 'Back to top', k: 'top scroll up', run: () => scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }) },
    { n: 'Copy link to this page', k: 'share url copy', run: () => navigator.clipboard?.writeText(location.href).then(() => flash('Link copied')) },
    { n: 'Surprise me — random tool', k: 'random lucky discover', run: async () => { const t = (await load()).filter((x) => x.t === 'tool'); go(t[Math.floor(Math.random() * t.length)]); } },
    { n: 'Let the search orb float freely', k: 'unpin orb dock move reset position', run: () => unpinDock() },
    { n: 'Clear recent searches', k: 'history forget recent', run: () => { store.set('seek:recent', []); flash('Recent searches cleared'); } },
  ].map((c) => prep({ ...c, t: 'command', s: 'Command' }));

  // ── matching ────────────────────────────────────────
  // Every term must land somewhere; names outrank subtitles, word starts outrank the middle,
  // and a short term that misses can still match as a subsequence of the name ("cldcd" → Claude Code).
  function subseq(term, s) {
    let j = 0, gaps = 0, last = -1;
    for (let i = 0; i < s.length && j < term.length; i++) if (s[i] === term[j]) { if (last >= 0) gaps += i - last - 1; last = i; j++; }
    return j === term.length ? Math.max(1, 10 - gaps) : 0;
  }
  function score(it, terms, q, slack = 0) {
    let sc = 0, miss = 0;
    for (const t of terms) {
      const at = it._n.indexOf(t);
      if (at === 0) sc += 40;
      else if (at > 0) sc += /[\s\-./(·]/.test(it._n[at - 1]) ? 28 : 16;
      else if (it._h.includes(t)) sc += 7;
      else if (t.length >= 3 && subseq(t, it._n)) sc += subseq(t, it._n);
      else if (++miss > slack) return 0;
    }
    if (it._n === q) sc += 60;
    sc += (TYPES[it.t]?.w || 0) + (it.t === here ? 6 : 0);
    if (it.d) { const age = (Date.now() - Date.parse(it.d)) / 864e5; sc += age < 3 ? 6 : age < 14 ? 3 : age < 60 ? 1 : 0; }
    return sc - it._n.length / 60;
  }
  function search(q, scope) {
    const cmd = q.startsWith('>');
    const qq = fold(cmd ? q.slice(1) : q).trim();
    const terms = qq.split(/\s+/).filter(Boolean);
    const pool = cmd ? COMMANDS : [...pageItems(), ...COMMANDS, ...(index || [])];
    const list = (scope === 'all' ? pool : pool.filter((x) => x.t === scope));
    if (!terms.length) return cmd ? COMMANDS : [];
    const rank = (slack) => list.map((it) => [score(it, terms, qq, slack), it]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    // Nothing has every word? Settle for everything that has all but one.
    const hits = rank(0);
    return hits.length || terms.length < 2 ? hits : rank(1);
  }
  function mark(text, terms) {
    if (!terms.length) return esc(text);
    const f = fold(text), hit = new Array(text.length).fill(false);
    for (const t of terms) { let i = f.indexOf(t); while (i >= 0) { for (let k = i; k < i + t.length; k++) hit[k] = true; i = f.indexOf(t, i + t.length); } }
    let out = '', open = false;
    for (let i = 0; i < text.length; i++) {
      if (hit[i] !== open) { out += hit[i] ? '<mark>' : '</mark>'; open = hit[i]; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : s < 86400 * 30 ? `${Math.round(s / 86400)}d ago` : s < 86400 * 365 ? `${Math.round(s / 86400 / 30)}mo ago` : `${(s / 86400 / 365).toFixed(1)}y ago`;
  };
  const href = (it) => (it.x || it.t === 'here' ? it.u : ROOT + it.u);
  const glyph = (it) => {
    if (it.i) {
      const mono = it.i.startsWith('~'), src = ROOT + it.i.replace(/^~/, '');
      return `<span class="sk-ic has" style="--c:${esc(it.c || '#888')}">${mono ? `<i style="-webkit-mask-image:url('${esc(src)}');mask-image:url('${esc(src)}')"></i>` : `<img src="${esc(src)}" alt="" loading="lazy">`}</span>`;
    }
    const sym = { here: '¶', command: '›', page: '◰', learn: '✦', news: '◆', update: '↑', skills: '◇', mcp: '⌁', discussion: 'Y', tool: (it.n || '?')[0], lab: (it.n || '?')[0], model: (it.n || '?')[0] }[it.t] || '•';
    return `<span class="sk-ic sk-ic-${it.t}"${it.c ? ` style="--c:${esc(it.c)}"` : ''}>${esc(sym)}</span>`;
  };

  // ── dock ────────────────────────────────────────────
  const dock = document.createElement('button');
  dock.type = 'button';
  dock.className = 'seek-dock';
  dock.setAttribute('aria-label', 'Search the whole site');
  dock.setAttribute('aria-haspopup', 'dialog');
  dock.innerHTML = `<span class="sd-orb" aria-hidden="true"><svg viewBox="0 0 40 40" class="sd-ring"><circle cx="20" cy="20" r="18" pathLength="100"/></svg><svg viewBox="0 0 24 24" width="17" height="17" class="sd-glass"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m20 20-4.2-4.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span class="sd-text" aria-hidden="true"><span class="sd-pre">Search</span><span class="sd-type"></span><span class="sd-caret"></span></span><kbd class="sd-kbd" aria-hidden="true">${MAC ? '⌘K' : 'Ctrl K'}</kbd>`;
  document.body.append(dock);
  const typeEl = $('.sd-type', dock), ring = $('.sd-ring circle', dock);

  // Typewriter: cycles through ideas (real tool and model names once the index is in).
  let ideaI = 0, typeT = null;
  const typeIdea = () => {
    clearTimeout(typeT);
    if (document.hidden || dock.classList.contains('compact') || !dock.classList.contains('on')) { typeT = setTimeout(typeIdea, 1500); return; }
    const pool = index ? [...IDEAS, ...index.filter((x) => x.t === 'tool' || x.t === 'model').slice(0, 40).map((x) => x.n.toLowerCase())] : IDEAS;
    const word = ideaI++ === 0 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    if (calm()) { typeEl.textContent = word; typeT = setTimeout(typeIdea, 4000); return; }
    let i = 0;
    const put = () => { typeEl.textContent = word.slice(0, ++i); if (i < word.length) typeT = setTimeout(put, 45 + Math.random() * 60); else typeT = setTimeout(del, 2200); };
    const del = () => { typeEl.textContent = typeEl.textContent.slice(0, -1); typeT = typeEl.textContent ? setTimeout(del, 22) : setTimeout(typeIdea, 350); };
    put();
  };
  typeIdea();

  // ── where the dock lives ─────────────────────────────
  // The search sits in the masthead; when the masthead slims down to let you read, it flies out
  // and rides along as the orb (always on small screens, and always once you've pinned it).
  // Left alone, it looks for a quiet patch of screen and keeps out from under the words. Drag it
  // and it stays exactly where you dropped it; the little pin sets it free again.
  const nav = $('.nav');
  // The visible viewport, not innerWidth: on phones a wide table can stretch the layout viewport.
  const VW = () => document.documentElement.clientWidth, VH = () => document.documentElement.clientHeight;
  const EDGE = 14, R = 26; // screen margin · dock edge to orb centre
  let pin = store.get('seek:pin', null); // orb centre as fractions of the viewport
  let pos = null, east = true, pillW = 380, docked = false, drag = null, swallow = false;
  const pinEl = Object.assign(document.createElement('span'), { className: 'sd-pin', title: 'Pinned — click to let it find its own spot' });
  pinEl.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  dock.append(pinEl);

  const bounds = () => {
    const navB = nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0;
    // Stay clear of bars pinned to the bottom (Learn player, compare tray, live toast).
    const lift = Math.max(0, ...$$('.lplayer, .ctray, .live-toast').filter((el) => !el.hidden && el.offsetParent !== null).map((el) => VH() - el.getBoundingClientRect().top));
    return { l: EDGE + R, r: VW() - EDGE - R, t: navB + EDGE + R, b: VH() - lift - EDGE - R - (VW() <= 980 ? 0 : 4) };
  };
  const clamp = (p, b = bounds()) => ({ x: Math.min(Math.max(p.x, b.l), Math.max(b.l, b.r)), y: Math.min(Math.max(p.y, b.t), Math.max(b.t, b.b)) });

  // Is there something worth reading (or pressing) under this point?
  const rng = document.createRange();
  const SOLID = 'img, svg, video, canvas, iframe, button, input, select, textarea, label, .ticon, .lplayer, .ctray, .live-toast, .nav-in, .sk-flash';
  const busyAt = (x, y) => {
    if (x < 0 || y < 0 || x > VW() || y > VH()) return 1;
    const el = document.elementsFromPoint(x, y).find((e) => e !== dock && !dock.contains(e));
    if (!el || el === document.body || el === document.documentElement) return 0;
    if (el.closest(SOLID)) return 1;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      rng.selectNodeContents(n);
      for (const r of rng.getClientRects()) if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 4 && y <= r.bottom + 4) return 1;
    }
    return 0;
  };
  // How much of the dock's footprint at orb centre (x, y) lands on content; w = pill width or 0 for the orb.
  const cover = (x, y, w = 0, e = east) => {
    const x0 = w ? (e ? x + R - w : x - R) : x - R - 4, x1 = w ? x0 + w : x + R + 4;
    let n = 0;
    for (let sx = x0; sx <= x1 + 0.5; sx += (x1 - x0) / Math.max(3, Math.round((x1 - x0) / 22))) for (const sy of [y - R + 4, y, y + R - 4]) n += busyAt(sx, sy);
    return n;
  };
  const place = () => {
    const b = bounds();
    if (pin) { pos = clamp({ x: pin.fx * VW(), y: pin.fy * VH() }, b); return; }
    if (pos) pos = clamp(pos, b);
    if (pos && !cover(pos.x, pos.y)) return; // still a quiet spot: don't wander
    const xs = [...new Set([b.r, b.l, VW() / 2, b.r - 64, b.l + 64].map(Math.round))].filter((x) => x >= b.l && x <= b.r);
    const ys = [];
    for (let y = b.b; y >= b.t && ys.length < 12; y -= 60) ys.push(y);
    let best = null;
    for (const y of ys) for (const x of xs) {
      const s = cover(x, y) * 100 + (b.b - y) * 0.04 + (x === b.r ? 0 : x === b.l ? 4 : 8) + (pos ? Math.hypot(x - pos.x, y - pos.y) * 0.01 : 0);
      if (!best || s < best.s) best = { s, x, y };
      if (best.s < 1) break;
    }
    if (best) pos = { x: best.x, y: best.y };
  };
  const apply = () => {
    if (!pos) return;
    east = pos.x > VW() / 2;
    dock.classList.toggle('east', east);
    dock.style.left = `${Math.round(pos.x)}px`;
    dock.style.top = `${Math.round(pos.y)}px`;
  };
  // Open up into the full pill only where it won't sit on top of anything.
  const settle = () => {
    if (drag?.moved || !docked) return;
    place(); apply();
    if (pos && !dock.matches(':hover')) dock.classList.toggle('compact', !!cover(pos.x, pos.y, pillW));
  };

  const fly = (into) => {
    if (calm() || !trigger.offsetParent || VW() <= 980) return;
    const a = trigger.getBoundingClientRect(), b = dock.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const from = `translate(${dx}px, ${dy}px) scale(${Math.min(1, a.width / b.width).toFixed(3)}, ${(a.height / b.height).toFixed(3)})`;
    const frames = [{ transform: from, opacity: 0 }, { transform: `translate(${dx * 0.35}px, ${dy * 0.55 - 30}px) scale(1.06)`, opacity: 1, offset: 0.55 }, { transform: 'none', opacity: 1 }];
    dock.animate(into ? frames.reverse() : frames, { duration: into ? 420 : 620, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
  const update = () => {
    const want = !!pin || VW() <= 980 || !nav || nav.classList.contains('slim');
    dock.classList.toggle('pinned', !!pin);
    trigger.classList.toggle('away', want && VW() > 980);
    if (want === docked) return;
    docked = want;
    // Appear in place: no gliding over from wherever it was last time.
    if (want) { dock.classList.add('compact', 'still'); place(); apply(); void dock.offsetWidth; dock.classList.remove('still'); }
    dock.classList.toggle('on', want);
    if (want && !pin) fly(false);
    if (want) setTimeout(settle, 700);
  };
  if (nav) new MutationObserver(update).observe(nav, { attributes: true, attributeFilter: ['class'] });

  let lastY = scrollY, idleT = null;
  const later = (ms = 260) => { clearTimeout(idleT); idleT = setTimeout(settle, ms); };
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - VH();
    ring.style.strokeDashoffset = String(100 - (max > 0 ? Math.min(100, (y / max) * 100) : 0));
    if (Math.abs(y - lastY) > 6) {
      if (y > lastY && !dock.matches(':hover')) dock.classList.add('compact');
      lastY = y;
      later();
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { update(); place(); apply(); later(); }, { passive: true });
  new MutationObserver(() => { if (docked) later(400); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  update(); onScroll();

  // Hover opens it up to the full pill wherever it is; leaving folds it back if it's in the way.
  dock.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !drag) { dock.classList.remove('compact'); requestAnimationFrame(() => { pillW = Math.max(pillW, dock.offsetWidth); }); } });
  dock.addEventListener('pointerleave', () => { if (!drag?.moved) later(500); });

  // Drag it anywhere; let go and it stays (snapping to an edge when you drop it close to one).
  const savePin = () => {
    pin = { fx: +(pos.x / VW()).toFixed(4), fy: +(pos.y / VH()).toFixed(4) };
    store.set('seek:pin', pin);
    dock.classList.add('pinned');
  };
  function unpinDock() {
    pin = null; store.set('seek:pin', null);
    dock.classList.remove('pinned');
    flash('Search orb is free — it finds its own quiet spot');
    update(); pos = null; settle();
  }
  dock.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.sd-pin')) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos?.x ?? e.clientX, oy: pos?.y ?? e.clientY, moved: false };
  });
  dock.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      dock.setPointerCapture(e.pointerId);
      dock.classList.add('dragging', 'compact');
    }
    pos = clamp({ x: drag.ox + dx, y: drag.oy + dy });
    apply();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    dock.classList.remove('dragging');
    const b = bounds(), SNAP = 44;
    if (pos.x - b.l < SNAP) pos.x = b.l; else if (b.r - pos.x < SNAP) pos.x = b.r;
    if (pos.y - b.t < SNAP) pos.y = b.t; else if (b.b - pos.y < SNAP) pos.y = b.b;
    apply();
    const first = !pin;
    savePin();
    if (first) flash('Pinned — it stays here. Tap the pin to let it roam');
    swallow = true;
    setTimeout(() => { swallow = false; }, 0);
    later(450);
  };
  dock.addEventListener('pointerup', endDrag);
  dock.addEventListener('pointercancel', endDrag);
  // Keyboard: Alt + arrows nudge (and pin) it.
  dock.addEventListener('keydown', (e) => {
    const v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!v || !e.altKey || !pos) return;
    e.preventDefault();
    pos = clamp({ x: pos.x + v[0] * 32, y: pos.y + v[1] * 32 });
    apply(); savePin(); later(450);
  });
  [dock, trigger].forEach((b) => { b.addEventListener('pointerenter', load, { once: true }); b.addEventListener('focus', load, { once: true }); });

  // ── palette ─────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'seek';
  root.hidden = true;
  root.innerHTML = `<div class="sk-veil"></div>
<div class="sk-panel" role="dialog" aria-modal="true" aria-label="Search Patchwire">
  <div class="sk-head">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4.2-4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input class="sk-q" type="search" role="combobox" aria-expanded="true" aria-controls="sk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="Search tools, updates, models, news… or type > for commands">
    <output class="sk-count" aria-live="polite"></output>
    <button type="button" class="sk-x" aria-label="Close search">Esc</button>
    <i class="sk-scan" aria-hidden="true"></i>
  </div>
  <div class="sk-scopes" role="tablist" aria-label="Search in">${SCOPES.map((s) => `<button type="button" role="tab" data-scope="${s}" aria-selected="${s === 'all'}">${s === 'all' ? 'Everything' : TYPES[s].label}<b></b></button>`).join('')}</div>
  <div class="sk-body">
    <div class="sk-list" id="sk-list" role="listbox" aria-label="Results"></div>
    <aside class="sk-peek" aria-hidden="true"></aside>
  </div>
  <div class="sk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Tab</kbd> scope</span><span><kbd>></kbd> commands</span><span class="sk-meta"></span></div>
</div>`;
  document.body.append(root);
  const panel = $('.sk-panel', root), q = $('.sk-q', root), listEl = $('.sk-list', root), peek = $('.sk-peek', root), count = $('.sk-count', root);
  const scopeBtns = $$('.sk-scopes button', root);
  let scope = 'all', results = [], active = 0, opener = null, renderT = null;

  const setScope = (s) => {
    scope = s;
    scopeBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.scope === s)));
    $(`.sk-scopes [data-scope="${s}"]`, root)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: calm() ? 'auto' : 'smooth' });
    render();
  };
  scopeBtns.forEach((b) => b.addEventListener('click', () => { setScope(b.dataset.scope); q.focus(); }));

  const row = (it, i, terms) => `<a class="sk-row" role="option" id="sk-o${i}" data-i="${i}" href="${esc(href(it))}"${it.x ? ' target="_blank" rel="noopener"' : ''} aria-selected="${i === active}" style="--d:${Math.min(i, 12) * 18}ms">
  ${glyph(it)}<span class="sk-tx"><span class="sk-n">${mark(it.n, terms)}</span><span class="sk-s">${mark(it.s || '', terms)}</span></span>
  <span class="sk-tag">${it.d ? `<time>${ago(it.d)}</time>` : ''}${esc(TYPES[it.t]?.one || '')}${it.x ? ' ↗' : ''}</span></a>`;

  function home() {
    const recent = store.get('seek:recent', []).slice(0, 5);
    const sections = pageItems().slice(0, 6);
    const pages = (index || []).filter((x) => x.t === 'page');
    const fresh = (index || []).filter((x) => x.t === 'update').slice(0, 5);
    const groups = [
      recent.length && ['Recent searches', recent.map((r) => prep({ t: 'recent', n: r, s: 'Search again', u: '' }))],
      sections.length && ['On this page', sections],
      pages.length && ['Jump to', pages],
      fresh.length && ['Just shipped', fresh],
    ].filter(Boolean);
    return groups;
  }

  function render() {
    const raw = q.value;
    const terms = fold(raw.replace(/^>/, '')).trim().split(/\s+/).filter(Boolean);
    let groups;
    if (!raw.trim() && scope === 'all') {
      groups = home();
      count.textContent = index ? `${index.length.toLocaleString()} indexed` : 'Loading…';
    } else {
      const all = raw.trim() ? search(raw, 'all') : (index || []).filter((x) => x.t === scope).slice(0, 200);
      const by = Object.groupBy ? Object.groupBy(all, (x) => x.t) : all.reduce((a, x) => ((a[x.t] ||= []).push(x), a), {});
      scopeBtns.forEach((b) => { const n = b.dataset.scope === 'all' ? all.length : (by[b.dataset.scope] || []).length; $('b', b).textContent = raw.trim() && n ? (n > 999 ? '999+' : n) : ''; });
      const picked = scope === 'all' ? all : all.filter((x) => x.t === scope);
      count.textContent = raw.trim() ? `${picked.length.toLocaleString()} match${picked.length === 1 ? '' : 'es'}` : '';
      if (scope === 'all') {
        // Best group first; four of each, the rest one Tab away.
        const order = [...new Set(picked.slice(0, 8).map((x) => x.t))].concat(Object.keys(TYPES)).filter((t, i, a) => by[t] && a.indexOf(t) === i);
        groups = order.map((t) => [TYPES[t].label, by[t].slice(0, t === picked[0]?.t ? 6 : 4), by[t].length]);
      } else groups = [[TYPES[scope].label, picked.slice(0, 80), picked.length]];
    }
    if (!raw.trim()) scopeBtns.forEach((b) => { $('b', b).textContent = ''; });
    results = groups.flatMap((g) => g[1]);
    active = Math.min(active, Math.max(0, results.length - 1));
    let i = 0;
    listEl.innerHTML = results.length ? groups.map(([label, items, total]) => `<div class="sk-group" role="presentation"><p class="sk-gh">${esc(label)}${total > items.length ? `<button type="button" data-more="${esc(items[0].t)}">+${(total - items.length).toLocaleString()} more</button>` : ''}</p>${items.map((it) => row(it, i++, terms)).join('')}</div>`).join('')
      : `<div class="sk-none"><p class="sk-none-big">Nothing on the wire for “${esc(raw)}”</p><p>Try fewer words, a tool name, or <button type="button" data-try="${esc(IDEAS[Math.floor(Math.random() * IDEAS.length)])}">something else</button>.</p></div>`;
    $$('[data-more]', listEl).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); setScope(b.dataset.more); q.focus(); }));
    $('[data-try]', listEl)?.addEventListener('click', (e) => { q.value = e.target.dataset.try; render(); q.focus(); });
    $('.sk-meta', root).textContent = fetchedAt ? `index refreshed ${ago(fetchedAt)}` : '';
    highlight(false);
  }

  function highlight(scroll = true) {
    $$('.sk-row', listEl).forEach((r) => r.setAttribute('aria-selected', String(+r.dataset.i === active)));
    const el = $(`#sk-o${active}`, listEl);
    if (el) { q.setAttribute('aria-activedescendant', el.id); if (scroll) el.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
    const it = results[active];
    if (!it) { peek.innerHTML = ''; return; }
    peek.innerHTML = `<div class="sk-pk" style="--c:${esc(it.c || 'var(--accent)')}">${glyph(it)}<p class="eyebrow">${esc(TYPES[it.t]?.one || (it.t === 'recent' ? 'Recent' : ''))}${it.d ? ` · ${ago(it.d)}` : ''}</p><h3>${esc(it.n)}</h3>${it.s ? `<p class="sk-pk-s">${esc(it.s)}</p>` : ''}${it.k && it.k.length > 30 ? `<p class="sk-pk-k">${esc(it.k.slice(0, 180))}${it.k.length > 180 ? '…' : ''}</p>` : ''}<p class="sk-pk-go">${it.t === 'command' ? 'Run' : it.t === 'recent' ? 'Search' : it.x ? 'Opens the source in a new tab' : it.t === 'here' ? 'Scrolls to it' : 'Open page'} <kbd>↵</kbd></p></div>`;
  }

  const remember = () => {
    const v = q.value.trim();
    if (v.length < 2 || v.startsWith('>')) return;
    store.set('seek:recent', [v, ...store.get('seek:recent', []).filter((x) => x !== v)].slice(0, 8));
  };
  const flash = (msg) => {
    const t = Object.assign(document.createElement('div'), { className: 'sk-flash', textContent: msg });
    t.setAttribute('role', 'status');
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
  };
  function go(it, newTab = false) {
    if (!it) return;
    if (it.t === 'recent') { q.value = it.n; render(); return; }
    remember();
    if (it.t === 'command') { close(); it.run(); return; }
    if (it.t === 'here') {
      close();
      const el = it.el || document.querySelector(it.u);
      el?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
      el?.classList.remove('sk-found'); void el?.offsetWidth; el?.classList.add('sk-found');
      return;
    }
    if (it.x || newTab) { open(href(it), '_blank', 'noopener'); return; }
    location.href = href(it);
  }

  listEl.addEventListener('click', (e) => {
    const a = e.target.closest('.sk-row');
    if (!a) return;
    const it = results[+a.dataset.i];
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) { remember(); return; }
    e.preventDefault();
    go(it);
  });
  listEl.addEventListener('pointermove', (e) => {
    const a = e.target.closest('.sk-row');
    if (a && +a.dataset.i !== active) { active = +a.dataset.i; highlight(false); }
  });
  q.addEventListener('input', () => {
    active = 0;
    root.classList.add('typing');
    clearTimeout(renderT);
    renderT = setTimeout(() => { render(); root.classList.remove('typing'); }, index ? 30 : 0);
    if (!index) load().then(render);
  });
  q.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step && results.length) { e.preventDefault(); active = (active + step + results.length) % results.length; highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active], e.ctrlKey || e.metaKey); }
    else if (e.key === 'Tab') { e.preventDefault(); const i = SCOPES.indexOf(scope); setScope(SCOPES[(i + (e.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length]); }
    else if (e.key === 'Home' && e.altKey) { active = 0; highlight(); }
  });
  $('.sk-x', root).addEventListener('click', () => close());
  $('.sk-veil', root).addEventListener('click', () => close());

  // Grow out of the thing that opened it, shrink back into it on close.
  const morph = (from, opening) => {
    if (calm() || !from?.getClientRects().length) return null;
    const a = from.getBoundingClientRect(), p = panel.getBoundingClientRect();
    const inset = `inset(${a.top - p.top}px ${p.right - a.right}px ${p.bottom - a.bottom}px ${a.left - p.left}px round 999px)`;
    const frames = [{ clipPath: inset, opacity: 0.6 }, { clipPath: 'inset(0px round 14px)', opacity: 1 }];
    root.classList.toggle('closing', !opening);
    return panel.animate(opening ? frames : frames.reverse(), { duration: opening ? 520 : 340, easing: opening ? 'cubic-bezier(.16,1,.3,1)' : 'cubic-bezier(.5,0,.75,0)', fill: 'both' });
  };
  function show(from) {
    if (!root.hidden) { q.select(); return; }
    opener = from || document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add('seeking');
    from?.classList?.add('launching');
    load().then(() => { if (!root.hidden) render(); });
    render();
    q.value = ''; q.focus();
    const anim = morph(from, true);
    anim?.finished.then(() => { anim.cancel(); from?.classList?.remove('launching'); }).catch(() => {});
    if (!anim) from?.classList?.remove('launching');
  }
  function close() {
    if (root.hidden) return;
    const done = () => { root.hidden = true; root.classList.remove('closing'); document.documentElement.classList.remove('seeking'); };
    const target = opener?.isConnected && opener.getClientRects().length ? opener : null;
    const anim = morph(target === dock || target === trigger ? target : null, false);
    if (anim) anim.finished.then(() => { anim.cancel(); done(); }).catch(done); else done();
    if (opener?.focus && opener !== document.body) opener.focus({ preventScroll: true });
  }
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (q.value) { q.value = ''; render(); } else close(); }
    // Keep focus inside the dialog.
    if (e.key === 'Tab' && e.target !== q) { e.preventDefault(); q.focus(); }
  });

  trigger.addEventListener('click', () => show(trigger));
  dock.addEventListener('click', (e) => {
    if (swallow) return;
    if (e.target.closest('.sd-pin')) { unpinDock(); return; }
    show(dock);
  });
  document.addEventListener('keydown', (e) => {
    const typing = /input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); root.hidden ? show(dock.classList.contains('on') ? dock : trigger) : close(); }
    // "/" belongs to the page's own filter box when there is one.
    else if (e.key === '/' && !typing && !$('#q') && root.hidden) { e.preventDefault(); show(dock.classList.contains('on') ? dock : trigger); }
  });
})();
