// Client-side enhancements: live relative times, filters, search, pagination, theme.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

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
  apply();

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
