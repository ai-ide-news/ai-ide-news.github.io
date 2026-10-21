// My feed (/my-feed/): the reader's own mix of tools from the catalog and outside sources.
// Picks live in localStorage; a share link (?t=&b=&s=) carries them to another browser.
// Catalog items come from data.json; outside sources are read through the feed proxy Worker (worker/).
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const box = $('.mf');
  if (!box) return;
  const ROOT = box.dataset.root, PROXY = box.dataset.proxy;
  const CAT = JSON.parse($('#mf-data').textContent);
  const toolBy = Object.fromEntries(CAT.tools.map((t) => [t.id, t]));
  const KEY = 'myFeed.v1', PAGE = 50;
  const KIND = { release: 'Release', changelog: 'Changelog', blog: 'Blog', discussion: 'Discussion' };
  const SRC_KIND = { youtube: 'YouTube', reddit: 'Reddit', bluesky: 'Bluesky', mastodon: 'Mastodon', instagram: 'Instagram', x: 'X', web: 'Feed' };
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  // ── state ──────────────────────────────────────────────
  const blank = () => ({ tools: [], builtin: ['news'], sources: [] });
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || null; } catch { state = null; }
  const fresh = !state;
  state = { ...blank(), ...state };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  // A shared link: adopt it outright on a fresh browser, otherwise ask before merging it in.
  const qs = new URLSearchParams(location.search);
  if (qs.has('t') || qs.has('s') || qs.has('b')) {
    const shared = {
      tools: (qs.get('t') || '').split(',').filter((id) => toolBy[id]),
      builtin: (qs.get('b') || '').split(',').filter((b) => b === 'news' || b === 'hn'),
      sources: qs.getAll('s').filter(Boolean).slice(0, 30).map((input) => ({ input, title: input })),
    };
    const n = shared.tools.length + shared.sources.length;
    if (n && (fresh || confirm(`Add ${n} shared source${n === 1 ? '' : 's'} to your feed?`))) {
      state.tools = [...new Set([...state.tools, ...shared.tools])];
      state.builtin = fresh ? shared.builtin : [...new Set([...state.builtin, ...shared.builtin])];
      for (const s of shared.sources) if (!state.sources.some((x) => x.input === s.input)) state.sources.push(s);
      save();
    }
    history.replaceState(null, '', location.pathname);
  }

  // ── data ───────────────────────────────────────────────
  let site = null; // data.json
  const remote = new Map(); // input → { items, source } | { error } | Promise
  const loadSite = () => site || (site = fetch(`${ROOT}data.json`).then((r) => r.json()).catch(() => ({ updates: [], news: [], discussions: [] })));
  const loadRemote = (input) => {
    if (!remote.has(input)) {
      const p = fetch(`${PROXY}/feed?url=${encodeURIComponent(input)}`)
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; })
        .then((j) => { remote.set(input, j); return j; }, (e) => { const v = { error: e.message || 'Failed to load' }; remote.set(input, v); return v; });
      remote.set(input, p);
    }
    return Promise.resolve(remote.get(input));
  };

  // ── sources panel ──────────────────────────────────────
  const mine = $('.mf-mine'), status = $('.mf-status');
  const tile = (name, color, kind) => `<span class="ticon ticon-sm mf-tile" style="--c:${color}" aria-hidden="true"><b>${esc((name.replace(/^(@|r\/)+/, '')[0] || '?').toUpperCase())}</b>${kind ? `<i class="mf-k mf-k-${esc(kind)}"></i>` : ''}</span>`;
  const srcTile = (s) => tile(s.title || s.input, `hsl(${hue(s.input)} 55% 55%)`, s.kind);
  function renderMine() {
    const rows = [
      ...state.sources.map((s) => {
        const r = remote.get(s.input);
        const err = r && !(r instanceof Promise) && r.error;
        return `<li class="${err ? 'bad' : ''}"${err ? ` title="${esc(err)}"` : ''}>${srcTile(s)}<span><b>${esc(s.title || s.input)}</b><small>${err ? esc(err) : esc(SRC_KIND[s.kind] || 'Source')}</small></span><button type="button" class="mf-x" data-rm-src="${esc(s.input)}" aria-label="Remove ${esc(s.title || s.input)}">×</button></li>`;
      }),
      ...state.tools.filter((id) => toolBy[id]).map((id) => { const t = toolBy[id]; return `<li>${t.icon}<span><b>${esc(t.name)}</b><small>Releases · ${esc(t.vendor)}</small></span><button type="button" class="mf-x" data-rm-tool="${esc(id)}" aria-label="Remove ${esc(t.name)}">×</button></li>`; }),
    ];
    mine.innerHTML = rows.join('') || '<li class="mf-none muted small">Nothing yet. Add a source or pick tools.</li>';
    $$('[data-builtin]').forEach((c) => { c.checked = state.builtin.includes(c.dataset.builtin); });
    const n = state.tools.length;
    $('.mf-tcount').textContent = n ? `${n} picked` : 'none picked';
    $$('.mf-tools button').forEach((b) => b.setAttribute('aria-pressed', String(state.tools.includes(b.dataset.tool))));
  }
  mine.addEventListener('click', (e) => {
    const s = e.target.closest('[data-rm-src]'), t = e.target.closest('[data-rm-tool]');
    if (s) state.sources = state.sources.filter((x) => x.input !== s.dataset.rmSrc);
    else if (t) state.tools = state.tools.filter((id) => id !== t.dataset.rmTool);
    else return;
    save(); renderMine(); refresh();
  });
  $$('[data-builtin]').forEach((c) => c.addEventListener('change', () => {
    state.builtin = $$('[data-builtin]').filter((x) => x.checked).map((x) => x.dataset.builtin);
    save(); refresh();
  }));

  async function addSource(input) {
    input = input.trim();
    if (!input) return;
    if (state.sources.some((s) => s.input === input)) { status.textContent = 'Already in your feed.'; return; }
    status.textContent = 'Looking for a feed…';
    remote.delete(input);
    const r = await loadRemote(input);
    if (r.error) { status.textContent = r.error; remote.delete(input); return false; }
    state.sources.unshift({ input, title: r.source?.title || input, kind: r.source?.kind || 'web' });
    save();
    status.textContent = `Added ${r.source?.title || input} · ${r.items.length} post${r.items.length === 1 ? '' : 's'}.`;
    renderMine(); refresh();
    return true;
  }
  const form = $('.mf-add');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = $('#mf-in'), btn = $('button', form);
    btn.disabled = true;
    if (await addSource(inp.value)) inp.value = '';
    btn.disabled = false;
  });
  const presets = $('.mf-presets');
  if (presets) {
    presets.innerHTML = CAT.presets.map((p) => `<button type="button" class="mf-preset" data-input="${esc(p.input)}">${esc(p.name)}</button>`).join('');
    presets.addEventListener('click', (e) => { const b = e.target.closest('[data-input]'); if (b) addSource(b.dataset.input); });
  }

  // Tool picker
  const picker = $('.mf-tools');
  picker.innerHTML = CAT.tools.map((t) => `<button type="button" data-tool="${esc(t.id)}" data-text="${esc(`${t.name} ${t.vendor} ${t.cat}`.toLowerCase())}" aria-pressed="false">${t.icon}<span>${esc(t.name)}</span><small>${esc(t.cat)}</small></button>`).join('');
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]'); if (!b) return;
    const id = b.dataset.tool;
    state.tools = state.tools.includes(id) ? state.tools.filter((x) => x !== id) : [...state.tools, id];
    save(); renderMine(); refresh();
  });
  $('#mf-tq').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('button', picker).forEach((b) => { b.hidden = !!q && !b.dataset.text.includes(q); });
  });
  if (!state.tools.length && !state.sources.length) $('.mf-tools-box').open = true;

  $('.mf-share').addEventListener('click', async (e) => {
    const u = new URL(location.pathname, location.origin);
    if (state.tools.length) u.searchParams.set('t', state.tools.join(','));
    u.searchParams.set('b', state.builtin.join(','));
    state.sources.forEach((s) => u.searchParams.append('s', s.input));
    try { await navigator.clipboard.writeText(u.href); e.target.textContent = 'Link copied'; } catch { prompt('Copy this link:', u.href); }
    setTimeout(() => { e.target.textContent = 'Copy share link'; }, 2000);
  });
  $('.mf-reset').addEventListener('click', () => {
    if (!confirm('Remove every source from your feed?')) return;
    state = blank(); save(); renderMine(); refresh();
  });

  // ── stream ─────────────────────────────────────────────
  const list = $('#mf-list'), empty = $('.mf-empty'), more = $('.mf-more'), chips = $('.mf-filter');
  let all = [], filter = 'all', shown = PAGE, gen = 0;

  const card = (it) => `<article class="fcard mf-card" style="--c:${it.color}">
  <div class="fcard-rail">${it.icon}</div>
  <div class="fcard-body">
    <div class="fcard-meta">${it.href ? `<a class="fcard-tool" href="${esc(it.href)}">${esc(it.from)}</a>` : `<span class="fcard-tool">${esc(it.from)}</span>`}<span class="kind${it.kindCls ? ` kind-${it.kindCls}` : ''}">${esc(it.kind)}</span>${it.version ? `<code class="ver">${esc(it.version)}</code>` : ''}${it.date ? `<time class="fcard-time" datetime="${esc(it.date)}">${ago(it.date)}</time>` : ''}</div>
    <h3 class="fcard-title"><a href="${esc(it.url)}" target="_blank" rel="noopener nofollow">${esc(it.title || it.summary.slice(0, 120))}</a></h3>
    ${it.summary && it.title ? `<p class="fcard-sum">${esc(it.summary)}</p>` : ''}
    ${it.image ? `<a class="mf-img" href="${esc(it.url)}" target="_blank" rel="noopener nofollow" tabindex="-1" aria-hidden="true"><img src="${esc(it.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>` : ''}
  </div>
</article>`;
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : s < 86400 * 30 ? `${Math.round(s / 86400)}d ago` : s < 86400 * 365 ? `${Math.round(s / 86400 / 30)}mo ago` : `${(s / 86400 / 365).toFixed(1)}y ago`;
  };
  const dayLabel = (k) => {
    const diff = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(k)) / 86400e3);
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : new Date(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  };

  function render() {
    const items = filter === 'all' ? all : all.filter((it) => it.key === filter);
    let out = '', last = '';
    for (const it of items.slice(0, shown)) {
      const k = (it.date || '').slice(0, 10);
      if (k && k !== last) { out += `<h2 class="day"><span>${esc(dayLabel(k))}</span><i></i><small>${esc(k)}</small></h2>`; last = k; }
      out += card(it);
    }
    list.innerHTML = out;
    list.removeAttribute('aria-busy');
    empty.hidden = !!items.length;
    more.hidden = items.length <= shown;
    // Source chips: only worth showing with more than one source in the stream.
    const keys = [...all.reduce((m, it) => m.set(it.key, { label: it.from, n: (m.get(it.key)?.n || 0) + 1 }), new Map())];
    chips.innerHTML = keys.length < 2 ? '' : [['all', { label: 'All', n: all.length }], ...keys].map(([k, v]) => `<button type="button" class="chip${k === filter ? ' on' : ''}" data-key="${esc(k)}" aria-pressed="${k === filter}">${esc(v.label)} <small>${v.n}</small></button>`).join('');
  }
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) { filter = b.dataset.key; shown = PAGE; render(); } });
  more.addEventListener('click', () => { shown += PAGE; render(); });

  async function refresh() {
    const my = ++gen;
    const picked = new Set(state.tools);
    const d = await loadSite();
    const out = [];
    for (const u of d.updates || []) {
      if (!picked.has(u.toolId)) continue;
      const t = toolBy[u.toolId];
      out.push({ key: `t:${t.id}`, from: t.name, href: `${ROOT}tools/${t.id}/`, icon: t.icon, color: t.color, kind: KIND[u.kind] || u.kind, kindCls: u.kind, version: u.version, title: u.title, url: u.url, date: u.date, summary: u.summary || '' });
    }
    if (state.builtin.includes('news')) for (const n of d.news || []) {
      const t = toolBy[n.toolIds?.[0]];
      out.push({ key: 'b:news', from: 'Important news', icon: t ? t.icon : tile('★', '#ff6b35'), color: t?.color || '#ff6b35', kind: n.tag || 'News', title: n.title, url: n.url, date: n.date, summary: n.summary || '', image: safeUrl(n.image) });
    }
    if (state.builtin.includes('hn')) for (const h of d.discussions || []) {
      if (picked.size && !(h.toolIds || [h.toolId]).some((id) => picked.has(id))) continue;
      const t = toolBy[h.toolId];
      out.push({ key: 'b:hn', from: 'Hacker News', icon: tile('Y', '#ff6600'), color: '#ff6600', kind: `▲ ${h.points} · ${h.comments} comments${t ? ` · ${t.name}` : ''}`, title: h.title, url: h.hnUrl || h.url, date: h.date, summary: '' });
    }
    // Outside sources stream in as they arrive; whatever is already loaded shows straight away.
    const pending = state.sources.map((s) => loadRemote(s.input).then((r) => ({ s, r })));
    const addRemote = ({ s, r }) => {
      if (!r || r.error) return;
      if (r.source?.title && s.title === s.input) { s.title = r.source.title; s.kind = r.source.kind; save(); }
      for (const i of r.items || []) {
        if (!safeUrl(i.url)) continue;
        out.push({ key: `s:${s.input}`, from: s.title || r.source?.title || s.input, href: safeUrl(r.source?.home), icon: srcTile(s), color: `hsl(${hue(s.input)} 55% 55%)`, kind: SRC_KIND[s.kind] || 'Feed', title: i.title, url: i.url, date: i.date, summary: i.summary || '', image: safeUrl(i.image) });
      }
    };
    const publish = () => {
      if (my !== gen) return;
      const seen = new Set();
      all = out.filter((it) => it.url && !seen.has(it.url) && seen.add(it.url)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (filter !== 'all' && !all.some((it) => it.key === filter)) filter = 'all';
      render();
    };
    publish();
    for (const p of pending) p.then((x) => { addRemote(x); publish(); renderMine(); });
  }

  renderMine();
  refresh();
})();
