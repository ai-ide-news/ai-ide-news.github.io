// Client-side enhancements: live relative times, filters, search, pagination, theme.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Ad blocker wall: a bait element that cosmetic filters hide, a probe of the AdSense script
  // that network filters block, and a check that the AdSense script in <head> really came from
  // Google (uBlock swaps in a local no-op stand-in that never shows up in resource timing).
  // Any one tripping covers the page.
  if (document.documentElement.hasAttribute('data-adwall') && navigator.onLine !== false) {
    const ADS_JS = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    const loaded = new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
    const swapped = () => !!document.querySelector(`script[src^="${ADS_JS}"]`)
      && (!performance.getEntriesByType('resource').some((e) => e.name.startsWith(ADS_JS))
        || /^function\s*\(\)\s*\{\s*;?\s*\}$/.test(String(window.adsbygoogle?.push)));
    const bait = document.createElement('div');
    bait.className = 'adsbox ad-banner pub_300x250 textads banner-ads';
    bait.setAttribute('aria-hidden', 'true');
    bait.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px';
    bait.innerHTML = '&nbsp;';
    document.body.append(bait);
    const hidden = () => !bait.isConnected || bait.offsetHeight === 0 || getComputedStyle(bait).display === 'none';
    const probe = fetch(ADS_JS, { mode: 'no-cors' }).then(() => false, () => true);
    Promise.all([probe, loaded.then(() => new Promise((r) => setTimeout(r, 300)))]).then(([netBlocked]) => {
      const blocked = netBlocked || hidden() || swapped();
      bait.remove();
      if (!blocked) return;
      const wall = document.createElement('div');
      wall.className = 'adwall';
      wall.setAttribute('role', 'alertdialog');
      wall.setAttribute('aria-modal', 'true');
      wall.setAttribute('aria-labelledby', 'adwall-t');
      wall.innerHTML = '<div class="adwall-box"><p class="eyebrow">Ad blocker detected</p><h2 id="adwall-t">Please turn off your ad blocker</h2><p>Patchwire is free and ads keep it running. Pause your ad blocker (or allow this site) and reload to keep reading.</p><button type="button" class="btn">I’ve turned it off — reload</button></div>';
      wall.querySelector('button').addEventListener('click', () => location.reload());
      document.documentElement.classList.add('adwalled');
      document.body.append(wall);
      wall.querySelector('button').focus();
    });
  }

  // Theme
  $('#theme')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  });

  // Relative times stay accurate between rebuilds
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
    if (s < 86400 * 365) return `${Math.round(s / 86400 / 30)}mo ago`;
    return `${(s / 86400 / 365).toFixed(1)}y ago`;
  };
  const tick = () => $$('time[datetime]').forEach((t) => { t.textContent = ago(t.dateTime); });
  tick(); setInterval(tick, 60000);

  // Filters
  const state = { cat: 'all', kind: 'all', free: 'all', q: '', page: 40, budget: Infinity, seats: 1 };
  const feed = $('#feedlist');
  let cards = feed ? $$('.fcard', feed) : [];
  const vcards = $$('.vcard');
  const prows = $$('.prow');
  const more = $('#more');

  function apply() {
    const q = state.q.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    const match = (el) => terms.every((t) => el.dataset.text.includes(t));
    const inCat = (el) => state.cat === 'all' || (state.cat === 'trending' ? el.dataset.trend === '1' : el.dataset.cat === state.cat);

    vcards.forEach((v) => { v.hidden = !(inCat(v) && match(v)); });
    prows.forEach((r) => { r.hidden = !(inCat(r) && match(r) && (state.free === 'all' || r.dataset.free === state.free) && r.dataset.fits !== '0'); });
    const pempty = $('.ptable-wrap + .empty'); if (pempty) pempty.hidden = prows.some((r) => !r.hidden);
    $$('.vgrid').forEach((g) => { const e = g.nextElementSibling; if (e?.classList.contains('empty')) e.hidden = $$('.vcard', g).some((v) => !v.hidden); });

    if (!feed) return;
    let shown = 0, total = 0;
    for (const c of cards) {
      const ok = inCat(c) && (state.kind === 'all' || c.dataset.kind === state.kind) && match(c);
      if (ok) total++;
      const vis = ok && shown < state.page;
      if (vis) shown++;
      c.hidden = !vis;
    }
    // Hide day headers with no visible cards
    $$('.day', feed).forEach((h) => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains('day')) { if (!n.hidden) { any = true; break; } n = n.nextElementSibling; }
      h.hidden = !any;
    });
    if (more) more.hidden = shown >= total;
    const empty = $('.feed-more .empty'); if (empty) empty.hidden = total > 0;
  }

  const setCat = (cat) => {
    state.cat = cat; state.page = 40;
    $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.cat === state.cat)));
    apply();
  };
  $$('.tabs').forEach((tabs) => tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (b) setCat(b.dataset.cat);
  }));
  // /tools/#trending opens the directory pre-filtered
  if (location.hash === '#trending' && !$('#trending') && $('.tabs button[data-cat="trending"]')) setCat('trending');
  $$('.chips').forEach((chips) => chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.free) state.free = b.dataset.free; else state.kind = b.dataset.kind;
    state.page = 40;
    $$('.chip', chips).forEach((x) => x.classList.toggle('on', x === b));
    apply();
  }));
  const q = $('#q');
  if (q) {
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value; state.page = 40; apply(); }, 120); });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
      if (e.key === 'Escape' && document.activeElement === q) { q.value = ''; state.q = ''; apply(); q.blur(); }
    });
  }
  more?.addEventListener('click', () => { state.page += 40; apply(); });
  if ($('#cmp-data')) comparePlans();
  if ($('.mtable')) compareModels();
  apply();

  // Models page: sortable columns, a switchable benchmark column, and the head-to-head benchmark showdown.
  function compareModels() {
    const data = JSON.parse($('#mcmp-data').textContent);
    const B = Object.fromEntries(data.benchmarks.map((b) => [b.id, b]));
    const MAX = 6;
    const tbody = $('.mtable tbody');
    const benchSel = $('#bench'), scoredOnly = $('#scored-only');
    const params = new URLSearchParams(location.search);
    let sort = { key: 'date', dir: -1 };
    const defaultBench = benchSel?.value || data.benchmarks[0].id;
    let bench = B[params.get('bench')] ? params.get('bench') : defaultBench;

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const fmt = (b, v) => (b.unit === 'min' ? (v >= 60 ? `${+(v / 60).toFixed(1)} h` : `${Math.round(v)} min`) : `${(v * 100).toFixed(1)}%`);
    const price = (n) => (n === 0 ? 'Free' : `$${n < 0.1 ? +n.toFixed(3) : n.toFixed(2)}`);
    const score = (r) => r.dataset[`b${bench[0].toUpperCase()}${bench.slice(1)}`];

    function resort() {
      const key = sort.key;
      // Unscored models always sink to the bottom of a benchmark sort.
      const val = (r) => (key === 'bench' ? (score(r) == null ? Infinity * sort.dir : +score(r)) : key === 'name' || key === 'date' ? r.dataset[key] : +r.dataset[key]);
      $$('.mrow', tbody).sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir).forEach((r) => tbody.append(r));
      $$('.msort').forEach((x) => x.closest('th').setAttribute('aria-sort', x.dataset.sort === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'));
    }
    $$('.msort').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.sort;
      sort = { key, dir: sort.key === key ? -sort.dir : key === 'name' || key === 'input' || key === 'output' ? 1 : -1 };
      resort();
    }));

    // Benchmark column: rewrite every cell for the chosen benchmark, with a bar relative to the best score.
    function renderBench() {
      const b = B[bench];
      const top = Math.max(0, ...$$('.mrow', tbody).map((r) => +(score(r) ?? 0)));
      const head = $('.msort[data-sort="bench"]');
      head.textContent = b.name; head.title = b.desc;
      $$('.mrow', tbody).forEach((r) => {
        const v = score(r);
        $('.mbench-cell', r).innerHTML = v == null ? '<span class="muted">—</span>' : `<span class="mbench">${fmt(b, +v)}<i style="--w:${Math.round((v / top) * 100)}%"></i></span>`;
        r.dataset.scored = String(Number(data.benchmarks.some((x) => data.models[r.dataset.id].bench[x.id] != null)));
      });
      if (sort.key === 'bench') resort();
    }
    function filterScored() {
      $$('.mrow', tbody).forEach((r) => { r.dataset.fits = scoredOnly?.checked && r.dataset.scored === '0' ? '0' : '1'; });
      apply();
    }
    benchSel?.addEventListener('change', () => { bench = benchSel.value; renderBench(); sync(); });
    scoredOnly?.addEventListener('change', filterScored);

    // ── Showdown: benchmarks as rows, picked models as columns ──
    const sd = $('#showdown');
    const table = $('.sd', sd), foot = $('.sd-foot', sd), addInput = $('#sd-q'), diffBox = $('#sd-diff'), barsBox = $('#sd-bars');
    const tray = $('.ctray');
    const start = (sd?.dataset.start || '').split(',').filter((id) => data.models[id]);
    const fromUrl = (params.get('vs') || '').split(',').filter((id) => data.models[id]);
    const picks = (fromUrl.length ? fromUrl : start).slice(0, MAX);
    let focus = picks.includes(params.get('hl')) ? params.get('hl') : picks[0];
    let rankBy = B[params.get('rank')] ? params.get('rank') : null;
    let notice = '';
    const byName = Object.fromEntries(Object.entries(data.models).map(([id, m]) => [m.name.toLowerCase(), id]));

    function sync() {
      const p = new URLSearchParams(location.search);
      picks.join() !== start.join() ? p.set('vs', picks.join(',')) : p.delete('vs');
      focus && focus !== picks[0] ? p.set('hl', focus) : p.delete('hl');
      rankBy ? p.set('rank', rankBy) : p.delete('rank');
      bench !== defaultBench ? p.set('bench', bench) : p.delete('bench');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
    }

    // Ranking by a benchmark reorders the columns, best first; unscored models go last.
    function rank() {
      if (!rankBy) return;
      const v = (id) => data.models[id].bench[rankBy] ?? -Infinity;
      picks.sort((a, b) => v(b) - v(a));
    }

    function renderShowdown() {
      if (!sd) return;
      rank();
      const cols = picks.map((id) => ({ id, ...data.models[id] }));
      const benches = data.benchmarks.filter((b) => cols.some((c) => c.bench[b.id] != null));
      const f = data.models[focus];
      const best = {}, top = {}, wins = Object.fromEntries(picks.map((id) => [id, 0]));
      for (const b of benches) {
        const vals = cols.map((c) => c.bench[b.id]).filter((v) => v != null);
        top[b.id] = Math.max(...vals);
        if (vals.length > 1) { best[b.id] = top[b.id]; cols.forEach((c) => { if (c.bench[b.id] === top[b.id]) wins[c.id]++; }); }
      }
      const contested = Object.keys(best).length;
      const cheapest = Math.min(...cols.map((c) => c.input + c.output));
      const hl = (c) => (c.id === focus ? ' hl' : '');
      const gap = (b, v) => {
        const fv = f?.bench[b.id];
        if (!diffBox.checked || fv == null) return '';
        const d = v - fv;
        if (Math.abs(d) < 1e-9) return '<small class="sd-d">=</small>';
        const txt = b.unit === 'min' ? fmt(b, Math.abs(d)) : `${(Math.abs(d) * 100).toFixed(1)}`;
        return `<small class="sd-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${txt}</small>`;
      };
      const cell = (b, c) => {
        const v = c.bench[b.id];
        if (v == null) return `<td class="sd-na${hl(c)}" title="${esc(c.name)} hasn't been scored on ${esc(b.name)} yet">–</td>`;
        const isBest = v === best[b.id];
        return `<td class="${isBest ? 'best' : ''}${hl(c)}"><span class="sd-v">${fmt(b, v)}</span>${c.id === focus ? '' : gap(b, v)}${barsBox.checked ? `<i style="--w:${Math.round((v / top[b.id]) * 100)}%"></i>` : ''}</td>`;
      };
      const spec = (label, fn) => `<tr class="sd-spec"><th scope="row"><span class="sd-label">${label}</span></th>${cols.map((c) => `<td class="${hl(c).trim()}">${fn(c)}</td>`).join('')}</tr>`;
      table.style.setProperty('--n', cols.length);
      table.innerHTML = !cols.length ? '<tbody><tr><td class="sd-empty">Add a model above, or tick models in the table below.</td></tr></tbody>' : `
        <thead><tr><th scope="col" class="sd-corner">Benchmarks</th>${cols.map((c) => `<th scope="col" class="sd-m${hl(c)}" style="--c:${c.color}">
          <button type="button" class="sd-focus" data-id="${esc(c.id)}" aria-pressed="${c.id === focus}" title="Highlight ${esc(c.name)}">${c.icon}<strong>${esc(c.name)}</strong><small>${esc(c.lab)}</small></button>
          <button type="button" class="sd-x" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.name)}" title="Remove">×</button></th>`).join('')}</tr></thead>
        <tbody>
          ${benches.map((b) => `<tr class="${rankBy === b.id ? 'ranked' : ''}"><th scope="row"><button type="button" class="sd-rank" data-b="${b.id}" aria-pressed="${rankBy === b.id}" title="${rankBy === b.id ? 'Stop ranking' : 'Rank models by this benchmark'}"><span class="sd-label">${esc(b.name)}</span><small>${esc(b.desc)}</small></button></th>${cols.map((c) => cell(b, c)).join('')}</tr>`).join('')}
          ${benches.length ? '' : `<tr><th scope="row"><span class="sd-label">Benchmarks</span></th>${cols.map((c) => `<td class="sd-na${hl(c)}">No scores yet</td>`).join('')}</tr>`}
          ${contested ? spec('Top scores', (c) => `<b class="sd-wins">${wins[c.id]}</b><small> of ${contested}</small>`) : ''}
          ${spec('Price / 1M tokens', (c) => `<span class="sd-v">${price(c.input)}</span><small> in · ${price(c.output)} out</small>${c.input + c.output === cheapest && cols.length > 1 ? '<span class="pbadge free">Cheapest</span>' : ''}`)}
          ${spec('Context', (c) => `<span class="sd-v">${esc(c.context)}</span>${c.maxOutput ? `<small> · ${esc(c.maxOutput)} out</small>` : ''}`)}
          ${spec('Released', (c) => `<span class="sd-v">${esc(c.released)}</span>`)}
        </tbody>`;
      foot.textContent = notice || `${cols.length} of ${MAX} models · ${benches.length} benchmarks · best result per model from Epoch AI · “–” = not scored yet${diffBox.checked && f ? ` · gaps in percentage points vs ${f.name}` : ''}`;
      notice = '';
      renderPicks(); sync();
    }

    function add(id) {
      if (picks.includes(id)) { notice = `${data.models[id].name} is already in the showdown.`; return renderShowdown(); }
      if (picks.length >= MAX) { notice = `Up to ${MAX} models — remove one first.`; return renderShowdown(); }
      picks.push(id);
      if (!focus) focus = id;
      renderShowdown();
    }
    function remove(id) {
      picks.splice(picks.indexOf(id), 1);
      if (focus === id) focus = picks[0];
      renderShowdown();
    }

    // Keep the table's tick boxes and the floating tray in step with the showdown.
    function renderPicks() {
      $$('.pick', tbody).forEach((b) => {
        const on = picks.includes(b.dataset.pick);
        b.setAttribute('aria-pressed', String(on));
        b.disabled = !on && picks.length >= MAX;
        b.closest('.mrow').classList.toggle('picked', on);
      });
      if (!tray) return;
      $('.ctray-picks', tray).innerHTML = picks.map((id) => `<button type="button" class="ctray-pick" data-pick="${esc(id)}" title="Remove ${esc(data.models[id].name)}">${data.models[id].icon}<span>${esc(data.models[id].name)}</span><i aria-hidden="true">×</i></button>`).join('');
      $('.ctray-n', tray).textContent = `${picks.length} of ${MAX} in the showdown`;
      showTray();
    }
    let sdVisible = true;
    const showTray = () => {
      tray.hidden = sdVisible || !picks.length;
      document.body.classList.toggle('has-tray', !tray.hidden);
    };

    if (sd) {
      table.addEventListener('click', (e) => {
        const x = e.target.closest('.sd-x'); if (x) return remove(x.dataset.id);
        const fb = e.target.closest('.sd-focus'); if (fb) { focus = fb.dataset.id; return renderShowdown(); }
        const r = e.target.closest('.sd-rank'); if (r) { rankBy = rankBy === r.dataset.b ? null : r.dataset.b; return renderShowdown(); }
      });
      addInput.addEventListener('input', () => {
        const id = byName[addInput.value.trim().toLowerCase()];
        if (id) { addInput.value = ''; add(id); }
      });
      addInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const q = addInput.value.trim().toLowerCase();
        const id = byName[q] || Object.keys(byName).filter((n) => n.includes(q)).map((n) => byName[n])[0];
        if (q && id) { addInput.value = ''; add(id); }
      });
      diffBox.addEventListener('change', renderShowdown);
      barsBox.addEventListener('change', () => { sd.classList.toggle('no-bars', !barsBox.checked); renderShowdown(); });
      $('.sd-reset', sd).addEventListener('click', () => {
        picks.splice(0, picks.length, ...start); focus = picks[0]; rankBy = null; renderShowdown();
      });
      tbody.addEventListener('click', (e) => {
        const b = e.target.closest('.pick'); if (!b) return;
        picks.includes(b.dataset.pick) ? remove(b.dataset.pick) : add(b.dataset.pick);
      });
      tray?.addEventListener('click', (e) => {
        const p = e.target.closest('.ctray-pick'); if (p) return remove(p.dataset.pick);
        if (e.target.closest('.ctray-go')) sd.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      new IntersectionObserver(([en]) => { sdVisible = en.isIntersecting; showTray(); }).observe(sd);
    }

    // Restore state from a shared link
    if (benchSel) benchSel.value = bench;
    renderBench(); filterScored(); renderShowdown();
  }

  // Compare page: budget + team-size pricing, sortable columns, and a pick-up-to-4 side-by-side view.
  function comparePlans() {
    const data = JSON.parse($('#cmp-data').textContent);
    const BUDGETS = [0, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, Infinity];
    const MAX = 4;
    const tbody = $('.ptable tbody');
    const budget = $('#budget'), budgetOut = $('#budget-out'), seats = $('#seats');
    const tray = $('.ctray'), dialog = $('.cmp');
    const params = new URLSearchParams(location.search);
    const picks = (params.get('vs') || '').split(',').filter((id) => data[id]).slice(0, MAX);
    let sort = { key: 'from', dir: 1 };

    const money = (n) => `$${Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2)}`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    // Budget is per person; team size multiplies every paid plan (each member needs their own). null = custom pricing.
    const cost = (p) => (p.price == null ? null : p.price * state.seats);
    const fits = (p) => p.price != null && p.price <= state.budget;
    const cheapestPaid = (id) => {
      const c = data[id].plans.filter((p) => p.price > 0).map(cost);
      return c.length ? Math.min(...c) : null;
    };
    const bestFit = (id) => data[id].plans.filter(fits).sort((a, b) => cost(b) - cost(a))[0];

    function reprice() {
      const team = state.seats > 1;
      prows.forEach((r) => {
        const id = r.dataset.id;
        r.dataset.fits = String(Number(data[id].plans.some(fits)));
        $$('.pchip', r).forEach((c) => {
          const p = { price: c.dataset.price === '' ? null : +c.dataset.price };
          c.classList.toggle('over', state.budget !== Infinity && !fits(p));
          const tot = $('.ptotal', c);
          tot.hidden = !(team && p.price != null);
          if (!tot.hidden) tot.textContent = `${money(cost(p))}/mo for ${state.seats}`;
        });
      });
    }
    function resort() {
      const val = (r) => sort.key === 'name' ? data[r.dataset.id].name.toLowerCase() : (cheapestPaid(r.dataset.id) ?? -1);
      prows.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir).forEach((r) => tbody.append(r));
      $$('.psort').forEach((b) => b.closest('th').setAttribute('aria-sort', b.dataset.sort === sort.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'));
    }
    function sync() {
      const p = new URLSearchParams(location.search);
      picks.length ? p.set('vs', picks.join(',')) : p.delete('vs');
      state.budget === Infinity ? p.delete('budget') : p.set('budget', state.budget);
      state.seats > 1 ? p.set('seats', state.seats) : p.delete('seats');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
    }
    function update() { reprice(); apply(); renderTray(); if (dialog.open) renderCompare(); sync(); }

    function setBudget(i) {
      state.budget = BUDGETS[i];
      budgetOut.textContent = state.budget === Infinity ? 'Any' : state.budget === 0 ? 'Free only' : `Up to ${money(state.budget)}/seat`;
      budget.setAttribute('aria-valuetext', budgetOut.textContent);
    }
    budget.addEventListener('input', () => { setBudget(+budget.value); update(); });
    const setSeats = (n) => { state.seats = Math.min(500, Math.max(1, Math.round(n) || 1)); seats.value = state.seats; };
    seats.addEventListener('change', () => { setSeats(+seats.value); update(); });
    $$('.stepper [data-step]').forEach((b) => b.addEventListener('click', () => { setSeats(state.seats + +b.dataset.step); update(); }));
    $$('.psort').forEach((b) => b.addEventListener('click', () => {
      sort = { key: b.dataset.sort, dir: sort.key === b.dataset.sort ? -sort.dir : 1 };
      resort();
    }));

    // Picking tools
    function togglePick(id) {
      const i = picks.indexOf(id);
      if (i >= 0) picks.splice(i, 1); else if (picks.length < MAX) picks.push(id);
      update();
      if (!picks.length && dialog.open) dialog.close();
    }
    tbody.addEventListener('click', (e) => { const b = e.target.closest('.pick'); if (b) togglePick(b.dataset.pick); });
    function renderTray() {
      $$('.pick').forEach((b) => {
        const on = picks.includes(b.dataset.pick);
        b.setAttribute('aria-pressed', String(on));
        b.disabled = !on && picks.length >= MAX;
        b.closest('.prow').classList.toggle('picked', on);
      });
      tray.hidden = !picks.length;
      document.body.classList.toggle('has-tray', !!picks.length);
      $('.ctray-picks', tray).innerHTML = picks.map((id) => `<button type="button" class="ctray-pick" data-pick="${id}" title="Remove ${esc(data[id].name)}">${data[id].icon}<span>${esc(data[id].name)}</span><i aria-hidden="true">×</i></button>`).join('');
      $('.ctray-n', tray).textContent = picks.length < 2 ? `Pick ${2 - picks.length} more to compare` : `${picks.length} of ${MAX} selected`;
      $('.ctray-go', tray).disabled = picks.length < 2;
    }
    tray.addEventListener('click', (e) => {
      const p = e.target.closest('.ctray-pick'); if (p) return togglePick(p.dataset.pick);
      if (e.target.closest('.ctray-clear')) { picks.length = 0; update(); }
      if (e.target.closest('.ctray-go')) { renderCompare(); dialog.showModal(); }
    });

    // Side-by-side view: one column per tool, rows aligned so plans line up.
    function renderCompare() {
      const cols = picks.map((id) => ({ id, ...data[id], min: cheapestPaid(id), best: bestFit(id), free: data[id].plans.filter((p) => p.price === 0) }));
      const mins = cols.map((c) => c.min).filter((n) => n != null);
      const low = mins.length ? Math.min(...mins) : null;
      const priceCell = (p) => (p.price == null ? 'Custom' : p.price === 0 ? 'Free' : `${p.from ? 'from ' : ''}${money(cost(p))}<small>/mo${state.seats > 1 ? ` · ${state.seats} seats` : ''}</small>`);
      const team = state.seats > 1 ? ` for a team of ${state.seats}` : '';
      $('.cmp-sub', dialog).textContent = `Monthly USD${team}${state.budget === Infinity ? '' : `, budget up to ${money(state.budget)} per seat`}.`;
      const row = (label, fn) => `<tr><th scope="row">${label}</th>${cols.map((c) => `<td>${fn(c)}</td>`).join('')}</tr>`;
      $('.cmp-body', dialog).innerHTML = `<div class="cmp-scroll"><table class="cmp-table" style="--n:${cols.length}">
        <thead><tr><td></td>${cols.map((c) => `<th scope="col" style="--c:${c.color}"><a href="${c.href}" class="cmp-tool">${c.icon}<span><strong>${esc(c.name)}</strong><small>${esc(c.vendor)}</small></span></a><button type="button" class="cmp-rm" data-pick="${c.id}" aria-label="Remove ${esc(c.name)}">Remove</button></th>`).join('')}</tr></thead>
        <tbody>
          ${row('Cheapest paid', (c) => `<b class="cmp-big">${c.min == null ? (c.free.length ? 'Free' : 'Custom') : `${money(c.min)}<small>/mo</small>`}</b>${c.min != null && c.min === low && cols.length > 1 ? '<span class="pbadge free">Lowest</span>' : ''}`)}
          ${state.budget === Infinity ? '' : row('Best in budget', (c) => (c.best ? `<strong>${esc(c.best.name)}</strong> <span class="cmp-inline">${priceCell(c.best)}</span>` : '<span class="pbadge none">Over budget</span>'))}
          ${row('Free plan', (c) => (c.free.length ? c.free.map((p) => `<div><span class="pbadge free">Free</span> <strong>${esc(p.name)}</strong>${p.note ? `<small>${esc(p.note)}</small>` : ''}</div>`).join('') : '<span class="pbadge none">None</span>'))}
          ${row('All plans', (c) => `<ul class="cmp-plans">${c.plans.map((p) => `<li class="${state.budget !== Infinity && !fits(p) ? 'over' : ''}"><span>${esc(p.name)}${p.note ? `<small>${esc(p.note)}</small>` : ''}</span><b>${priceCell(p)}</b></li>`).join('')}</ul>`)}
          ${row('Notes', (c) => (c.note ? `<small>${esc(c.note)}</small>` : '<span class="muted">—</span>'))}
          ${row('Official', (c) => (c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">Pricing page ↗</a>` : '<span class="muted">—</span>'))}
        </tbody></table></div>`;
    }
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('.cmp-x')) dialog.close();
      const rm = e.target.closest('.cmp-rm'); if (rm) togglePick(rm.dataset.pick);
    });

    // Restore state from a shared link
    const b0 = BUDGETS.indexOf(+params.get('budget'));
    budget.value = params.has('budget') && b0 >= 0 ? b0 : BUDGETS.length - 1;
    setBudget(+budget.value);
    setSeats(+params.get('seats') || 1);
    reprice(); renderTray();
    if (picks.length >= 2) { renderCompare(); dialog.showModal(); }
  }

  // Live updates: poll the tiny version.json; on the home feed, new cards are inserted in place,
  // elsewhere a refresh is offered.
  let built = $('meta[name="pw-generated"]')?.content;
  const versionUrl = new URL('../version.json', document.currentScript?.src || location.href);
  let seen = null, toast = null;
  async function checkForUpdates() {
    if (document.hidden || !built) return;
    try {
      const v = await (await fetch(`${versionUrl}?t=${Date.now()}`, { cache: 'no-store' })).json();
      if (!(v.generatedAt > built) || v.generatedAt === seen) return;
      seen = v.generatedAt;
      const added = feed && v.cards ? insertCards(v.cards) : [];
      if (added.length) {
        built = v.generatedAt;
        $$('time.live-ago').forEach((t) => { t.dateTime = v.generatedAt; });
        tick();
        const titles = added.map((c) => $('.fcard-title', c).textContent.trim());
        showToast(`${added.length} new update${added.length === 1 ? '' : 's'} added: ${titles.slice(0, 2).join(' · ')}${titles.length > 2 ? ' …' : ''}`,
          'View', () => { added[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); toast.remove(); });
        return;
      }
      const fresh = v.latest.filter((i) => i.date > built);
      showToast(fresh.length
        ? `${fresh.length} new update${fresh.length === 1 ? '' : 's'}: ${fresh.slice(0, 2).map((i) => i.title).join(' · ')}${fresh.length > 2 ? ' …' : ''}`
        : 'The site was just refreshed with new data.');
    } catch {}
  }
  // Places each unseen card under its day header (creating it if needed), newest first.
  function insertCards(list) {
    const known = new Set(cards.map((c) => c.dataset.id));
    const tpl = document.createElement('template');
    const added = [];
    for (const { id, date, html } of list) {
      if (known.has(id)) continue;
      tpl.innerHTML = html.trim();
      const card = tpl.content.firstElementChild;
      const day = date.slice(0, 10);
      let head = $(`.day[data-day="${day}"]`, feed);
      if (!head) {
        head = dayHeader(day);
        feed.insertBefore(head, $$('.day', feed).find((h) => h.dataset.day < day) || null);
      }
      let n = head.nextElementSibling;
      while (n && !n.classList.contains('day') && $('time', n).dateTime >= date) n = n.nextElementSibling;
      feed.insertBefore(card, n);
      card.classList.add('is-new');
      known.add(id);
      added.push(card);
    }
    if (added.length) {
      cards = $$('.fcard', feed);
      state.page += added.length;
      added.sort((a, b) => cards.indexOf(a) - cards.indexOf(b));
      apply(); tick();
    }
    return added;
  }
  function dayHeader(day) {
    const d = new Date(`${day}T00:00:00Z`);
    const diff = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - d) / 86400000);
    const h = document.createElement('h2');
    h.className = 'day'; h.dataset.day = day;
    h.innerHTML = '<span></span><i></i><small></small>';
    $('span', h).textContent = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    $('small', h).textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return h;
  }
  function showToast(text, label = 'Refresh', onClick = () => location.reload()) {
    toast?.remove();
    toast = document.createElement('div');
    toast.className = 'live-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<span class="dot"></span><p></p><button type="button" class="btn"></button><button type="button" class="x" aria-label="Dismiss">×</button>';
    $('p', toast).textContent = text;
    $('.btn', toast).textContent = label;
    $('.btn', toast).addEventListener('click', onClick);
    $('.x', toast).addEventListener('click', () => toast.remove());
    document.body.append(toast);
  }
  setInterval(checkForUpdates, 90000);
  document.addEventListener('visibilitychange', checkForUpdates);
})();
