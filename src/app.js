// Client-side enhancements: live relative times, filters, search, pagination, theme.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Ad blocker wall: a bait element that cosmetic filters hide, a probe of the AdSense script
  // that network filters block, and a check that the AdSense script in <head> really came from
  // Google (uBlock swaps in a local no-op stand-in that never shows up in resource timing).
  // Any one tripping covers the page. Skipped inside the Android app (a Trusted Web Activity,
  // see play/): it opens with ?source=twa and an android-app:// referrer, remembered per tab.
  const inApp = (() => {
    try {
      if (/^android-app:\/\//.test(document.referrer) || /[?&]source=twa\b/.test(location.search)) sessionStorage.setItem('twa', '1');
      return sessionStorage.getItem('twa') === '1';
    } catch { return false; }
  })();
  if (document.documentElement.hasAttribute('data-adwall') && navigator.onLine !== false && !inApp) {
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
      wall.innerHTML = '<div class="adwall-box"><p class="eyebrow">Ad blocker detected</p><h2 id="adwall-t">Please turn off your ad blocker</h2><p>aiticker is free and ads keep it running. Pause your ad blocker (or allow this site) and reload to keep reading.</p><button type="button" class="btn">I’ve turned it off — reload</button></div>';
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

  // Masthead: a floating panel with grouped menus. Frosted once the page moves, a reading wire
  // along its bottom edge, an ink slug that glides between groups, and it tucks away while you
  // read down the page (the search leaves with it and rides along as the orb, see seek.js).
  const navBar = $('.nav'), navToggle = $('#nav-toggle'), links = $('#nav-links');
  if (navBar && links) {
    const wide = matchMedia('(min-width: 981px)');
    const grps = $$('.nav-grp', links);
    const cats = grps.map((g) => $('.nav-cat', g));
    const setNav = (open) => {
      navBar.classList.toggle('open', open);
      navToggle?.setAttribute('aria-expanded', String(open));
      navToggle?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    let openGrp = null, hoverT = null;
    const setGrp = (g) => {
      if (openGrp === g) return;
      if (openGrp) {
        // Switching straight to another menu: the old one goes at once instead of fading under the new one.
        const old = openGrp;
        if (g) { old.classList.add('snap'); requestAnimationFrame(() => requestAnimationFrame(() => old.classList.remove('snap'))); }
        old.classList.remove('open'); $('.nav-cat', old).setAttribute('aria-expanded', 'false');
      }
      openGrp = g;
      if (g) { g.classList.add('open'); $('.nav-cat', g).setAttribute('aria-expanded', 'true'); }
      navBar.classList.toggle('menu-open', !!g);
    };
    grps.forEach((g, i) => {
      const cat = cats[i];
      g.style.setProperty('--i', i);
      cat.addEventListener('click', () => { if (wide.matches) setGrp(openGrp === g ? null : g); });
      // Hover opens on desktop, with a little grace so crossing the gap doesn't snap it shut.
      g.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse' || !wide.matches) return; clearTimeout(hoverT); hoverT = setTimeout(() => setGrp(g), openGrp ? 0 : 90); });
      g.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse' || !wide.matches) return; clearTimeout(hoverT); hoverT = setTimeout(() => { if (openGrp === g) setGrp(null); }, 220); });
      g.addEventListener('keydown', (e) => {
        if (!wide.matches) return;
        const items = $$('.nav-menu a', g), at = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); setGrp(g); items[(at + 1) % items.length]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setGrp(g); items[(at - 1 + items.length) % items.length]?.focus(); }
        else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && at < 0) { e.preventDefault(); cats[(i + (e.key === 'ArrowRight' ? 1 : -1) + cats.length) % cats.length].focus(); }
        else if (e.key === 'Escape' && openGrp) { e.stopPropagation(); setGrp(null); cat.focus(); }
      });
      g.addEventListener('focusout', (e) => { if (!g.contains(e.relatedTarget) && openGrp === g) setGrp(null); });
    });
    navToggle?.addEventListener('click', () => setNav(!navBar.classList.contains('open')));
    $$('a', links).forEach((a) => a.addEventListener('click', () => { setNav(false); setGrp(null); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && navBar.classList.contains('open')) { setNav(false); navToggle?.focus(); } });
    document.addEventListener('click', (e) => { if (!navBar.contains(e.target)) { setNav(false); setGrp(null); } });
    wide.addEventListener('change', () => { setNav(false); setGrp(null); });

    // Ink slug follows the pointer across the group buttons.
    const glide = $('.nav-glide', links);
    let lit = null;
    const moveTo = (c) => {
      lit?.classList.remove('glide-on');
      lit = c;
      if (!c || !glide) { links.classList.remove('gliding'); return; }
      c.classList.add('glide-on');
      glide.style.setProperty('--gx', c.parentElement.offsetLeft + 'px');
      glide.style.setProperty('--gw', c.offsetWidth + 'px');
      links.classList.add('gliding');
    };
    cats.forEach((c) => {
      c.addEventListener('pointerenter', () => { if (wide.matches) moveTo(c); });
      c.addEventListener('focus', () => { if (wide.matches) moveTo(c); });
    });
    links.addEventListener('pointerleave', () => moveTo(null));
    links.addEventListener('focusout', (e) => { if (!links.contains(e.relatedTarget)) moveTo(null); });
    addEventListener('resize', () => moveTo(lit));

    // Scroll: frost, reading wire, and slim down to just what it holds once you're reading
    // (the search flies out to the orb, so the bar hugs its links). It never leaves the screen.
    let ticking = false, lastY = scrollY, travel = 0;
    const onScroll = () => {
      ticking = false;
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight, dy = y - lastY;
      lastY = y;
      navBar.classList.toggle('stuck', y > 8);
      navBar.style.setProperty('--read', max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
      if (openGrp && Math.abs(travel) > 80 && !openGrp.contains(document.activeElement)) setGrp(null);
      // A little hysteresis so it doesn't flicker right at the threshold.
      const slim = navBar.classList.contains('slim') ? y > 60 : y > 120;
      if (slim !== navBar.classList.contains('slim')) navBar.classList.toggle('slim', slim);
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
  }

  // Every <select> becomes a dropdown drawn like the masthead menus. The native select stays in the
  // page (hidden) as the source of truth, so filter code keeps reading and setting .value and
  // listening for 'change'; the button follows along whenever either side moves.
  const CHEV = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let ddOpen = null;
  const ddClose = (focus) => {
    if (!ddOpen) return;
    const d = ddOpen; ddOpen = null;
    d.classList.remove('open'); $('.dd-btn', d).setAttribute('aria-expanded', 'false');
    if (focus) $('.dd-btn', d).focus();
  };
  let ddN = 0;
  const dropdown = (sel) => {
    const d = document.createElement('div');
    d.className = 'dd';
    const id = `dd-m${++ddN}`;
    d.innerHTML = `<button class="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}"><span></span>${CHEV}</button><div class="dd-menu" id="${id}" role="listbox"></div>`;
    const btn = $('.dd-btn', d), menu = $('.dd-menu', d), label = $('span', btn);
    const name = sel.getAttribute('aria-label') || sel.closest('label')?.querySelector('span')?.textContent;
    if (name) menu.setAttribute('aria-label', name);
    const opt = (o) => `<button type="button" role="option" data-v="${o.value.replace(/"/g, '&quot;')}">${o.textContent.replace(/</g, '&lt;')}</button>`;
    const build = () => {
      menu.innerHTML = [...sel.children].map((c) => (c.tagName === 'OPTGROUP'
        ? `<p class="nav-hint">${c.label.replace(/</g, '&lt;')}</p>${[...c.children].map(opt).join('')}`
        : opt(c))).join('');
      sync();
    };
    const sync = () => {
      const cur = sel.selectedOptions[0];
      label.textContent = cur?.textContent || '';
      btn.setAttribute('aria-label', `${name ? `${name}: ` : ''}${label.textContent}`);
      $$('[role=option]', menu).forEach((b) => b.setAttribute('aria-selected', String(!!cur && b.dataset.v === cur.value)));
    };
    // Filter code sets .value without firing 'change'; catch that too.
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
    sel.addEventListener('change', sync);
    new MutationObserver(build).observe(sel, { childList: true, subtree: true });
    const items = () => $$('[role=option]', menu);
    const open = () => {
      if (ddOpen && ddOpen !== d) ddClose();
      ddOpen = d; d.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      // Open leftwards / upwards when the menu would run off the right / bottom edge.
      const r = btn.getBoundingClientRect();
      d.classList.toggle('dd-end', r.left + menu.offsetWidth > document.documentElement.clientWidth - 12);
      menu.style.maxHeight = '';
      const below = innerHeight - r.bottom - 16, above = r.top - (navBar?.getBoundingClientRect().bottom || 0) - 16;
      const up = menu.offsetHeight > below && above > below;
      d.classList.toggle('dd-up', up);
      menu.style.maxHeight = `${Math.max(140, Math.min(menu.offsetHeight, up ? above : below))}px`;
      const on = $('[aria-selected=true]', menu) || items()[0];
      on?.focus(); on?.scrollIntoView({ block: 'nearest' });
    };
    const pick = (b) => {
      if (b.dataset.v !== sel.value) { sel.value = b.dataset.v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      ddClose(true);
    };
    btn.addEventListener('click', () => (ddOpen === d ? ddClose() : open()));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    menu.addEventListener('click', (e) => { const b = e.target.closest('[role=option]'); if (b) pick(b); });
    menu.addEventListener('keydown', (e) => {
      const all = items(), at = all.indexOf(document.activeElement);
      const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
      if (to != null) { e.preventDefault(); all[(to + all.length) % all.length]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ddClose(true); }
      else if (e.key === 'Tab') ddClose();
      else if (e.key.length === 1) {
        // Type-ahead: jump to the next option starting with that letter.
        const k = e.key.toLowerCase(), n = all.length;
        for (let i = 1; i <= n; i++) { const b = all[(at + i) % n]; if (b.textContent.trim().toLowerCase().startsWith(k)) { b.focus(); break; } }
      }
    });
    d.addEventListener('focusout', (e) => { if (ddOpen === d && !d.contains(e.relatedTarget)) ddClose(); });
    sel.hidden = true;
    sel.after(d);
    build();
  };
  $$('select').forEach(dropdown);
  document.addEventListener('click', (e) => { if (ddOpen && !ddOpen.contains(e.target)) ddClose(); });

  // Remote images shimmer until they arrive (or fail).
  $$('img.skel').forEach((img) => {
    const done = () => img.classList.remove('skel');
    if (img.complete) done(); else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
  });

  // Page-to-page progress bar, shown only when a navigation takes longer than a blink.
  const bar = Object.assign(document.createElement('div'), { className: 'navbar-load' });
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  let barT = null;
  const barOff = () => { clearTimeout(barT); bar.classList.remove('on'); };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
    clearTimeout(barT);
    barT = setTimeout(() => bar.classList.add('on'), 150);
  });
  // Back/forward cache restores the page as it was left, bar included.
  addEventListener('pageshow', barOff);

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
  const feed = $('#feedlist');
  const PAGE = +(feed?.dataset.page || 40);
  const state = { cat: 'all', kind: 'all', free: 'all', q: '', page: PAGE, budget: Infinity, seats: 1, vall: false };
  let cards = feed ? $$('.fcard', feed) : [];
  const vcards = $$('.vcard');
  const prows = $$('.prow');
  const more = $('#more');
  // The home version board shows its first few cards until you ask for all, filter or search.
  const vfold = $('#vgrid[data-fold]'), vmore = $('#vmore');

  function apply() {
    const q = state.q.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    const match = (el) => terms.every((t) => el.dataset.text.includes(t));
    const inCat = (el) => state.cat === 'all' || (state.cat === 'trending' ? el.dataset.trend === '1' : el.dataset.cat === state.cat);

    vcards.forEach((v) => { v.hidden = !(inCat(v) && match(v)); });
    if (vfold) {
      const fold = !state.vall && !terms.length && state.cat === 'all';
      const vis = $$('.vcard', vfold).filter((v) => !v.hidden);
      if (fold) vis.slice(+vfold.dataset.fold).forEach((v) => { v.hidden = true; });
      if (vmore) vmore.hidden = !fold || vis.length <= +vfold.dataset.fold;
    }
    const trend = $('#trending .vgrid'); if (trend) trend.closest('section').hidden = !$$('.vcard', trend).some((v) => !v.hidden);
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
    state.cat = cat; state.page = PAGE;
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
    state.page = PAGE;
    $$('.chip', chips).forEach((x) => x.classList.toggle('on', x === b));
    apply();
  }));
  const q = $('#q');
  if (q) {
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value; state.page = PAGE; apply(); }, 120); });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
      if (e.key === 'Escape' && document.activeElement === q) { q.value = ''; state.q = ''; apply(); q.blur(); }
    });
  }
  more?.addEventListener('click', () => { state.page += 40; apply(); });
  vmore?.addEventListener('click', () => { state.vall = true; apply(); });
  // "Go straight to" links that land on a search box put the cursor in it.
  $$('a[data-focus]').forEach((a) => a.addEventListener('click', () => setTimeout(() => $('#' + a.dataset.focus)?.focus({ preventScroll: true }), 350)));
  // News page: filter cards by topic and tool; the choice lives in ?tag=&tool= so it can be shared.
  const nf = $('.nfilters');
  if (nf) {
    const grid = $('.ngrid'), cards = $$('.ncard', grid), pick = $('#ntool', nf), empty = $('.nempty');
    const nq = $('#nq', nf), src = $('#nsrc', nf), when = $('#nwhen', nf), maj = $('#nmaj', nf);
    const url = new URL(location.href);
    nq.value = url.searchParams.get('q') || '';
    src.value = url.searchParams.get('src') || ''; if (src.selectedIndex < 0) src.value = '';
    when.value = url.searchParams.get('days') || ''; if (when.selectedIndex < 0) when.value = '';
    maj.checked = url.searchParams.has('major');
    let tag = url.searchParams.get('tag') || 'all';
    if (!$(`.chip[data-tag="${CSS.escape(tag)}"]`, nf)) tag = 'all';
    pick.value = url.searchParams.get('tool') || '';
    if (pick.selectedIndex < 0) pick.value = '';
    const run = () => {
      const tool = pick.value, words = nq.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const since = when.value ? Date.now() - when.value * 864e5 : 0;
      let shown = 0;
      cards.forEach((c) => {
        const ok = (tag === 'all' || c.dataset.tag === tag) && (!tool || c.dataset.tools.split(' ').includes(tool))
          && (!src.value || c.dataset.srcs.split(' ').includes(src.value)) && (!since || Date.parse(c.dataset.date) >= since)
          && (!maj.checked || c.classList.contains('major')) && words.every((w) => c.dataset.text.includes(w));
        c.hidden = !ok; shown += ok;
      });
      $$('.chip', nf).forEach((x) => { const on = x.dataset.tag === tag; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      grid.classList.toggle('filtered', tag !== 'all' || !!tool || !!src.value || !!since || maj.checked || !!words.length);
      grid.hidden = !shown; empty.hidden = !!shown;
      const u = new URL(location.href);
      tag === 'all' ? u.searchParams.delete('tag') : u.searchParams.set('tag', tag);
      tool ? u.searchParams.set('tool', tool) : u.searchParams.delete('tool');
      nq.value.trim() ? u.searchParams.set('q', nq.value.trim()) : u.searchParams.delete('q');
      src.value ? u.searchParams.set('src', src.value) : u.searchParams.delete('src');
      when.value ? u.searchParams.set('days', when.value) : u.searchParams.delete('days');
      maj.checked ? u.searchParams.set('major', '') : u.searchParams.delete('major');
      history.replaceState(null, '', u);
    };
    // Feed (one column of posts) or grid; remembered per browser, ?view=grid overrides.
    let view = url.searchParams.get('view');
    if (!view) try { view = localStorage.getItem('newsView'); } catch {}
    const setView = (v) => {
      view = v === 'grid' ? 'grid' : 'feed';
      grid.classList.toggle('feed', view === 'feed');
      $$('.nview button', nf).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    };
    setView(view);
    nf.addEventListener('click', (e) => {
      const v = e.target.closest('.nview button');
      if (v) { setView(v.dataset.view); try { localStorage.setItem('newsView', view); } catch {} const u = new URL(location.href); u.searchParams.delete('view'); history.replaceState(null, '', u); return; }
      const b = e.target.closest('.chip'); if (b) { tag = b.dataset.tag; run(); }
    });
    [pick, src, when, maj].forEach((x) => x.addEventListener('change', run));
    let nt;
    nq.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(run, 120); });
    run();
  }
  // Skills & MCP pages: filter by type, search and re-sort the cards; the choice lives in ?type=&q=&sort=.
  const eco = $('.eco');
  if (eco && $('.egrid', eco)) {
    const grid = $('.egrid', eco), cards = $$('.ecard', grid), eq = $('#eq'), sort = $('#esort'), empty = $('.eempty', eco);
    const field = $('#efield'), lang = $('#elang'), regs = $$('.reg li', eco), regEmpty = $('.reg-empty', eco);
    const url = new URL(location.href);
    field.value = url.searchParams.get('field') || ''; if (field.selectedIndex < 0) field.value = '';
    if (lang) { lang.value = url.searchParams.get('lang') || ''; if (lang.selectedIndex < 0) lang.value = ''; }
    let kind = url.searchParams.get('type') || 'all';
    if (!$(`.chip[data-ekind="${CSS.escape(kind)}"]`, eco)) kind = 'all';
    eq.value = url.searchParams.get('q') || '';
    sort.value = url.searchParams.get('sort') || 'trend';
    if (sort.selectedIndex < 0) sort.value = 'trend';
    const key = { trend: (c) => -c.dataset.trend, stars: (c) => +c.dataset.stars, new: (c) => +c.dataset.new, upd: (c) => +c.dataset.upd };
    const run = () => {
      const words = eq.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const by = key[sort.value];
      [...cards].sort((a, b) => by(b) - by(a)).forEach((c) => grid.append(c));
      let shown = 0;
      cards.forEach((c) => {
        const ok = (kind === 'all' || c.dataset.kind === kind) && (!field.value || c.dataset.fields.split(' ').includes(field.value))
          && (!lang?.value || c.dataset.lang === lang.value) && words.every((w) => c.dataset.text.includes(w));
        c.hidden = !ok; shown += ok;
      });
      // The registry list follows the field and search filters too.
      let regShown = 0;
      regs.forEach((li) => {
        const ok = (!field.value || li.dataset.fields.split(' ').includes(field.value)) && words.every((w) => li.dataset.text.includes(w));
        li.hidden = !ok; regShown += ok;
      });
      if (regEmpty) regEmpty.hidden = !!regShown;
      $$('.ecard-fields button', grid).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.efield === field.value)));
      $$('.chip', eco).forEach((x) => { const on = x.dataset.ekind === kind; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      grid.hidden = !shown; empty.hidden = !!shown;
      const u = new URL(location.href);
      kind === 'all' ? u.searchParams.delete('type') : u.searchParams.set('type', kind);
      eq.value.trim() ? u.searchParams.set('q', eq.value.trim()) : u.searchParams.delete('q');
      field.value ? u.searchParams.set('field', field.value) : u.searchParams.delete('field');
      lang?.value ? u.searchParams.set('lang', lang.value) : u.searchParams.delete('lang');
      sort.value === 'trend' ? u.searchParams.delete('sort') : u.searchParams.set('sort', sort.value);
      history.replaceState(null, '', u);
    };
    eco.addEventListener('click', (e) => {
      const b = e.target.closest('.chip[data-ekind]'); if (b) { kind = b.dataset.ekind; run(); return; }
      // A field tag on a card toggles that field.
      const f = e.target.closest('.ecard-fields button'); if (f) { field.value = field.value === f.dataset.efield ? '' : f.dataset.efield; run(); }
    });
    let t;
    eq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
    [sort, field, lang].forEach((x) => x?.addEventListener('change', run));
    run();
  }
  if ($('#cmp-data')) comparePlans();
  if ($('.mtable')) compareModels();
  $$('.vzoom').forEach(zoomChart);
  apply();

  // Model pages: zoom and pan the price vs. performance chart. Logos keep their size; only positions,
  // the frontier line and the axis ticks follow the zoom.
  function zoomChart(box) {
    const svg = $('svg', box), d = svg.dataset;
    const L = +d.pl, R = +d.pr, T = +d.pt, B = +d.pb, x0 = +d.x0, x1 = +d.x1, y0 = +d.y0, y1 = +d.y1;
    const NS = 'http://www.w3.org/2000/svg', MAX = 16;
    const pts = $$('.vpt', svg), plot = $('.vplot', svg), axes = $('.axes', svg), label = $('.me-label', svg);
    let k = 1, tx = 0, ty = 0;
    const fmtY = (v) => ({
      min: () => (v >= 60 ? `${+(v / 60).toFixed(1)} h` : `${Math.round(v)} min`),
      elo: () => `${Math.round(v)}`,
      usd: () => `$${Math.round(v).toLocaleString('en-US')}`,
      of10: () => `${v.toFixed(2)}/10`,
    }[d.unit] || (() => `${+(v * 100).toFixed(1)}%`))();
    const fmtX = (n) => `$${n < 0.1 ? +n.toPrecision(2) : n < 10 ? n.toFixed(2) : +n.toFixed(0)}`;
    // Base (unzoomed) chart coordinates ↔ data values.
    const xVal = (bx) => 10 ** (x0 + ((bx - L) / (R - L)) * (x1 - x0));
    const xPos = (v) => L + ((Math.log10(v) - x0) / (x1 - x0)) * (R - L);
    const yVal = (by) => y0 + ((B - by) / (B - T)) * (y1 - y0);
    const yPos = (v) => B - ((v - y0) / (y1 - y0)) * (B - T);
    const clamp = () => {
      k = Math.min(MAX, Math.max(1, k));
      tx = Math.min(L - L * k, Math.max(R - R * k, tx));
      ty = Math.min(T - T * k, Math.max(B - B * k, ty));
    };
    const niceStep = (span) => { const p = 10 ** Math.floor(Math.log10(span / 4)), m = span / 4 / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
    function ticks() {
      const bx = (sx) => (sx - tx) / k, by = (sy) => (sy - ty) / k;
      const lo = xVal(bx(L)), hi = xVal(bx(R)), decades = Math.log10(hi / lo);
      const mult = decades > 2.5 ? [1] : decades > 1 ? [1, 3] : decades > 0.4 ? [1, 2, 5] : [1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9];
      const xs = [];
      for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) mult.forEach((f) => { const v = f * 10 ** e; if (v >= lo && v <= hi) xs.push(v); });
      const ylo = yVal(by(B)), yhi = yVal(by(T)), st = niceStep(yhi - ylo), ysv = [];
      for (let v = Math.ceil(ylo / st) * st; v <= yhi + 1e-9; v += st) ysv.push(v);
      const g = (x1_, x2_, y1_, y2_, tx_, ty_, anchor, text) => `<g class="grid"><line x1="${x1_}" x2="${x2_}" y1="${y1_}" y2="${y2_}"/><text x="${tx_}" y="${ty_}" text-anchor="${anchor}">${text}</text></g>`;
      axes.innerHTML = ysv.map((v) => { const y = yPos(v) * k + ty; return g(L, R, y, y, L - 8, y + 4, 'end', fmtY(v)); }).join('')
        + xs.map((v) => { const x = xPos(v) * k + tx; return g(x, x, T, B, x, B + 18, 'middle', fmtX(v)); }).join('');
    }
    function draw() {
      clamp();
      plot.setAttribute('transform', `matrix(${k} 0 0 ${k} ${tx} ${ty})`);
      pts.forEach((p) => {
        const x = +p.dataset.x * k + tx, y = +p.dataset.y * k + ty;
        p.setAttribute('transform', `translate(${x} ${y})${p.classList.contains('me') ? ' scale(1.5)' : ''}`);
      });
      const lx = +label.dataset.x * k + tx, ly = +label.dataset.y * k + ty;
      const flip = lx > R - 140, dx = Math.abs(+label.dataset.dx);
      label.setAttribute('text-anchor', flip ? 'end' : 'start');
      label.setAttribute('x', lx + (flip ? -dx : dx)); label.setAttribute('y', ly + 4);
      label.style.display = lx < L || lx > R || ly < T || ly > B ? 'none' : '';
      ticks();
      box.classList.toggle('zoomed', k > 1.001);
    }
    // Screen point → SVG coordinate.
    const toSvg = (cx, cy) => { const p = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse()); return [p.x, p.y]; };
    const zoomAt = (sx, sy, f) => {
      const nk = Math.min(MAX, Math.max(1, k * f)), r = nk / k;
      tx = sx - (sx - tx) * r; ty = sy - (sy - ty) * r; k = nk; draw();
    };
    const center = () => [(L + R) / 2, (T + B) / 2];
    $('.vzoom-ctl', box).hidden = false;
    $$('[data-zoom]', box).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.zoom === 'reset') { k = 1; tx = ty = 0; draw(); } else zoomAt(...center(), b.dataset.zoom === 'in' ? 1.6 : 1 / 1.6);
    }));
    // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms; a plain wheel keeps scrolling the page.
    svg.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(...toSvg(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.01));
    }, { passive: false });
    svg.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(...toSvg(e.clientX, e.clientY), e.shiftKey ? 1 / 2 : 2); });
    // Drag to pan (mouse) and two-finger pinch (touch). A drag never follows the logo link it started on.
    const down = new Map();
    let last = null, pinch = null, moved = false;
    svg.addEventListener('pointerdown', (e) => {
      down.set(e.pointerId, [e.clientX, e.clientY]);
      moved = false;
      if (down.size === 1) last = toSvg(e.clientX, e.clientY);
      if (down.size === 2) { const [a, b] = [...down.values()]; pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), k }; }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!down.has(e.pointerId)) return;
      down.set(e.pointerId, [e.clientX, e.clientY]);
      if (down.size === 2 && pinch) {
        const [a, b] = [...down.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        zoomAt(...toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (pinch.k * (dist / pinch.dist)) / k);
        moved = true;
      } else if (down.size === 1 && last && k > 1) {
        const p = toSvg(e.clientX, e.clientY);
        if (!moved && Math.hypot(p[0] - last[0], p[1] - last[1]) < 3) return;
        if (!moved) svg.setPointerCapture(e.pointerId);
        tx += p[0] - last[0]; ty += p[1] - last[1]; last = p; moved = true; draw();
      }
    });
    const up = (e) => { down.delete(e.pointerId); if (down.size < 2) pinch = null; if (!down.size) last = null; };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    // A logo click opens its model a beat later, so a double-click there zooms instead of navigating.
    let pending = null;
    svg.addEventListener('click', (e) => {
      const a = e.target.closest('.vpt');
      if (moved) { e.preventDefault(); moved = false; return; }
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      clearTimeout(pending);
      if (e.detail === 1) pending = setTimeout(() => { location.href = new URL(a.getAttribute('href'), location.href).href; }, 280);
    }, true);
    svg.addEventListener('dblclick', () => clearTimeout(pending));
    draw();
  }

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
    // Keep in step with benchVal()/benchBar() in scripts/build.mjs.
    const fmt = (b, v) => ({
      min: () => (v >= 60 ? `${+(v / 60).toFixed(1)} h` : `${Math.round(v)} min`),
      elo: () => `${Math.round(v)}`,
      usd: () => `$${Math.round(v).toLocaleString('en-US')}`,
      of10: () => `${v.toFixed(2)}/10`,
    }[b.unit] || (() => `${(v * 100).toFixed(1)}%`))();
    const bar = (b, v, max) => Math.max(2, Math.round((b.unit === 'elo' ? (v - 1000) / (max - 1000) : v / max) * 100));
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
        $('.mbench-cell', r).innerHTML = v == null ? '<span class="muted">—</span>' : `<span class="mbench">${fmt(b, +v)}<i style="--w:${bar(b, +v, top)}%"></i></span>`;
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
    const table = sd && $('.sd', sd), foot = sd && $('.sd-foot', sd), addInput = $('#sd-q'), diffBox = $('#sd-diff'), barsBox = $('#sd-bars');
    const tray = $('.ctray');
    const start = (sd?.dataset.start || '').split(',').filter((id) => data.models[id]);
    const fromUrl = (params.get('vs') || '').split(',').filter((id) => data.models[id]);
    const picks = (fromUrl.length ? fromUrl : start).slice(0, MAX);
    let focus = picks.includes(params.get('hl')) ? params.get('hl') : picks[0];
    let rankBy = B[params.get('rank')] ? params.get('rank') : null;
    let notice = '';
    const byName = Object.fromEntries(Object.entries(data.models).map(([id, m]) => [m.name.toLowerCase(), id]));
    // Which benchmark rows to show: a ready-made set, or the reader's own choice (setId 'custom').
    const SETS = Object.fromEntries(data.sets.map((s) => [s.id, s]));
    const customIds = (params.get('b') || '').split(',').filter((id) => B[id]);
    let setId = customIds.length ? 'custom' : SETS[params.get('set')] ? params.get('set') : data.sets[0].id;
    let shown = setId === 'custom' ? customIds : SETS[setId].ids;
    const picker = sd && $('.sd-pick', sd);

    function sync() {
      const p = new URLSearchParams(location.search);
      picks.join() !== start.join() ? p.set('vs', picks.join(',')) : p.delete('vs');
      focus && focus !== picks[0] ? p.set('hl', focus) : p.delete('hl');
      rankBy ? p.set('rank', rankBy) : p.delete('rank');
      setId !== data.sets[0].id && setId !== 'custom' ? p.set('set', setId) : p.delete('set');
      setId === 'custom' ? p.set('b', shown.join(',')) : p.delete('b');
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
      // Rows keep the set's order; ones no picked model has a score on still show, as dashes.
      const benches = shown.map((id) => B[id]);
      if (rankBy && !shown.includes(rankBy)) rankBy = null;
      const f = data.models[focus];
      const best = {}, top = {}, wins = Object.fromEntries(picks.map((id) => [id, 0]));
      for (const b of benches) {
        const vals = cols.map((c) => c.bench[b.id]).filter((v) => v != null);
        if (!vals.length) continue;
        top[b.id] = Math.max(...vals);
        if (vals.length > 1) { best[b.id] = top[b.id]; cols.forEach((c) => { if (c.bench[b.id] === top[b.id]) wins[c.id]++; }); }
      }
      const contested = Object.keys(best).length;
      // Rows none of the picked models has a score on fold into one compact "Not scored yet" row.
      const unscored = benches.filter((b) => top[b.id] == null && rankBy !== b.id);
      const cheapest = Math.min(...cols.map((c) => c.input + c.output));
      const hl = (c) => (c.id === focus ? ' hl' : '');
      const gap = (b, v) => {
        const fv = f?.bench[b.id];
        if (!diffBox.checked || fv == null) return '';
        const d = v - fv;
        if (Math.abs(d) < 1e-9) return '<small class="sd-d">=</small>';
        const txt = b.unit === 'pct' ? `${(Math.abs(d) * 100).toFixed(1)}` : fmt(b, Math.abs(d)).replace('/10', '');
        return `<small class="sd-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${txt}</small>`;
      };
      const cell = (b, c) => {
        const v = c.bench[b.id];
        if (v == null) return `<td class="sd-na${hl(c)}" title="${esc(c.name)} hasn't been scored on ${esc(b.name)} yet">–</td>`;
        const isBest = v === best[b.id];
        return `<td class="${isBest ? 'best' : ''}${hl(c)}"><span class="sd-v">${fmt(b, v)}</span>${c.id === focus ? '' : gap(b, v)}${barsBox.checked ? `<i style="--w:${bar(b, v, top[b.id])}%"></i>` : ''}</td>`;
      };
      const spec = (label, fn) => `<tr class="sd-spec"><th scope="row"><span class="sd-label">${label}</span></th>${cols.map((c) => `<td class="${hl(c).trim()}">${fn(c)}</td>`).join('')}</tr>`;
      table.style.setProperty('--n', cols.length);
      table.innerHTML = !cols.length ? '<tbody><tr><td class="sd-empty">Add a model above, or tick models in the table below.</td></tr></tbody>' : `
        <thead><tr><th scope="col" class="sd-corner">Benchmarks</th>${cols.map((c) => `<th scope="col" class="sd-m${hl(c)}" style="--c:${c.color || 'var(--ink-3)'}">
          <button type="button" class="sd-focus" data-id="${esc(c.id)}" aria-pressed="${c.id === focus}" title="Highlight ${esc(c.name)}">${c.icon}<strong>${esc(c.name)}</strong><small>${esc(c.lab)}</small></button>
          <button type="button" class="sd-x" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.name)}" title="Remove">×</button></th>`).join('')}</tr></thead>
        <tbody>
          ${benches.filter((b) => top[b.id] != null || rankBy === b.id).map((b) => `<tr class="${rankBy === b.id ? 'ranked' : ''}"><th scope="row"><button type="button" class="sd-rank" data-b="${b.id}" aria-pressed="${rankBy === b.id}" title="${rankBy === b.id ? 'Stop ranking' : 'Rank models by this benchmark'}"><span class="sd-label">${esc(b.name)}</span><small>${esc(b.desc)}</small></button></th>${cols.map((c) => cell(b, c)).join('')}</tr>`).join('')}
          ${benches.length ? '' : `<tr><th scope="row"><span class="sd-label">Benchmarks</span></th>${cols.map((c) => `<td class="sd-na${hl(c)}">Choose benchmarks above</td>`).join('')}</tr>`}
          ${unscored.length ? `<tr class="sd-unscored"><th scope="row"><span class="sd-label">Not scored yet</span><small>${unscored.map((b) => `<span class="sd-nochip" title="${esc(b.desc)}">${esc(b.name)}</span>`).join('')}</small></th>${cols.map((c) => `<td class="sd-na${hl(c)}">–</td>`).join('')}</tr>` : ''}
          ${contested ? spec('Top scores', (c) => `<b class="sd-wins">${wins[c.id]}</b><small> of ${contested}</small>`) : ''}
          ${spec('Price / 1M tokens', (c) => `<span class="sd-v">${price(c.input)}</span><small> in · ${price(c.output)} out</small>${c.input + c.output === cheapest && cols.length > 1 ? '<span class="pbadge free">Cheapest</span>' : ''}`)}
          ${spec('Context', (c) => `<span class="sd-v">${esc(c.context)}</span>${c.maxOutput ? `<small> · ${esc(c.maxOutput)} out</small>` : ''}`)}
          ${spec('Released', (c) => `<span class="sd-v">${esc(c.released)}</span>`)}
        </tbody>`;
      const empty = benches.filter((b) => top[b.id] == null).length;
      foot.textContent = notice || `${cols.length} of ${MAX} models · ${benches.length} benchmarks${empty ? ` (${empty} with no scores for these models)` : ''} · best result per model from Epoch AI · “–” = not scored yet${diffBox.checked && f ? ` · gaps vs ${f.name}, in percentage points for % scores` : ''}`;
      notice = '';
      renderSuggest(empty);
      renderSetUi(); renderPicks(); sync();
    }

    // When the picked models are thin on this set, offer the models with the most scores in it.
    function renderSuggest(empty) {
      const box = $('.sd-suggest', sd);
      const count = (id) => shown.filter((b) => data.models[id].bench[b] != null).length;
      const scoredHere = picks.reduce((n, id) => n + count(id), 0);
      const thin = shown.length && (empty > 0 || scoredHere < shown.length);
      const ideas = thin ? Object.keys(data.models).filter((id) => !picks.includes(id) && count(id) > 0)
        .sort((a, b) => count(b) - count(a)).slice(0, 5) : [];
      box.hidden = !ideas.length;
      box.innerHTML = ideas.length ? `<span class="muted small">Most scored for ${esc(setId === 'custom' ? 'your benchmarks' : SETS[setId].name)}:</span>${ideas.map((id) => `<button type="button" class="sd-idea" data-add="${esc(id)}"${picks.length >= MAX ? ' disabled title="Remove a model first"' : ''}>${data.models[id].icon}<span>${esc(data.models[id].name)}</span><i>${count(id)}/${shown.length}</i></button>`).join('')}` : '';
    }
    function renderSetUi() {
      $$('.sd-sets [data-set]', sd).forEach((c) => { const on = c.dataset.set === setId; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
      $$('input', picker).forEach((i) => { i.checked = shown.includes(i.value); });
      $('.sd-pick-n', picker).textContent = `${shown.length} shown${setId === 'custom' ? ' · custom' : ''}`;
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
        picks.splice(0, picks.length, ...start); focus = picks[0]; rankBy = null;
        setId = data.sets[0].id; shown = SETS[setId].ids; renderShowdown();
      });
      $('.sd-sets .chips', sd).addEventListener('click', (e) => {
        const c = e.target.closest('[data-set]'); if (!c) return;
        setId = c.dataset.set; shown = SETS[setId].ids; renderShowdown();
      });
      // Ticking a box turns the current set into a custom one, keeping the catalog's order.
      picker.addEventListener('change', () => {
        setId = 'custom';
        shown = data.benchmarks.map((b) => b.id).filter((id) => $(`input[value="${id}"]`, picker).checked);
        renderShowdown();
      });
      $('.sd-suggest', sd).addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) add(b.dataset.add); });
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
          ${row('All plans', (c) => `<ul class="cmp-plans">${c.plans.map((p) => `<li class="${state.budget !== Infinity && !fits(p) ? 'over' : ''}"><span>${esc(p.name)}${p.note ? `<small>${esc(p.note)}</small>` : ''}${p.since ? `<small>Since ${esc(p.since)}</small>` : ''}</span><b>${priceCell(p)}</b></li>`).join('')}</ul>`)}
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
  // manual: the header refresh button, which reports "up to date" and reloads when cards can't be inserted.
  async function checkForUpdates(manual = false) {
    if ((document.hidden && !manual) || !built) return;
    try {
      const v = await (await fetch(`${versionUrl}?t=${Date.now()}`, { cache: 'no-store' })).json();
      if (!(v.generatedAt > built)) { if (manual) showToast('You’re up to date. No new updates yet.', null); return; }
      if (v.generatedAt === seen && !manual) return;
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
      if (manual) { location.reload(); return; }
      const fresh = v.latest.filter((i) => i.date > built);
      showToast(fresh.length
        ? `${fresh.length} new update${fresh.length === 1 ? '' : 's'}: ${fresh.slice(0, 2).map((i) => i.title).join(' · ')}${fresh.length > 2 ? ' …' : ''}`
        : 'The site was just refreshed with new data.');
    } catch { if (manual) showToast('Couldn’t check for updates. Try again in a moment.', null); }
  }
  $('#refresh')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains('is-spinning')) return;
    btn.classList.add('is-spinning');
    await Promise.all([checkForUpdates(true), new Promise((r) => setTimeout(r, 500))]);
    btn.classList.remove('is-spinning');
  });
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
    if (label) {
      $('.btn', toast).textContent = label;
      $('.btn', toast).addEventListener('click', onClick);
    } else {
      $('.btn', toast).remove();
      const t = toast; setTimeout(() => t.remove(), 4000);
    }
    $('.x', toast).addEventListener('click', () => toast.remove());
    document.body.append(toast);
  }
  setInterval(checkForUpdates, 90000);
  document.addEventListener('visibilitychange', checkForUpdates);

  // Leaderboard tabs (Models and Usage pages): each tab group on its own, arrow keys move between tabs.
  $$('.lb-nav').forEach((nav) => {
    const tabs = [...nav.querySelectorAll('[role="tab"]')];
    const show = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', (e) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        show(tabs[(i + step + tabs.length) % tabs.length], true);
      });
    });
  });

  // Detail titles type themselves out. Each letter keeps its slot (visibility only), so nothing shifts.
  document.querySelectorAll('.typed').forEach((el) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const text = el.textContent;
    el.textContent = '';
    const chars = [...text].map((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      el.append(s);
      return s;
    });
    const caret = document.createElement('i');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    el.prepend(caret);
    let n = 0;
    const tick = () => {
      if (n >= chars.length) {
        caret.classList.add('idle');
        setTimeout(() => caret.classList.add('gone'), 2400);
        return;
      }
      chars[n].classList.add('on');
      chars[n].after(caret);
      n++;
      setTimeout(tick, 55 + Math.random() * 70);
    };
    setTimeout(tick, 350);
  });

  // Installable app + offline reading (dist/sw.js, built from scripts/sw.js).
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
  }
})();
