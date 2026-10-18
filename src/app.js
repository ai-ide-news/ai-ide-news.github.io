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
  const state = { cat: 'all', kind: 'all', free: 'all', q: '', page: 40 };
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
    prows.forEach((r) => { r.hidden = !(inCat(r) && match(r) && (state.free === 'all' || r.dataset.free === state.free)); });
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
  apply();

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
