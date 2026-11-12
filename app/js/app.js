import { PLATFORMS, STORE_KEYS, logo, platTag, brandSvg } from './platforms.js';
import { store } from './store.js';
import * as api from './api.js';
import * as alerts from './alerts.js';
import { openItem, openStore, share, appLinkFor, isAppInstalled } from './open.js';
import { SUBS, SUBS_CHECKED } from './subs.js';

const isDesktop = !!window.loothub;
document.body.classList.toggle('is-web', !isDesktop);

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null || isNaN(n) ? '' : n === 0 ? 'FREE' : '$' + n.toFixed(2);
const COVERS = ['linear-gradient(135deg,#4c1d95,#a855f7)', 'linear-gradient(135deg,#0f172a,#7c3aed)', 'linear-gradient(135deg,#581c87,#db2777)', 'linear-gradient(135deg,#1e1b4b,#6366f1)', 'linear-gradient(135deg,#3b0764,#9333ea 60%,#f0abfc)', 'linear-gradient(135deg,#18181b,#6d28d9)', 'linear-gradient(135deg,#2e1065,#c026d3)', 'linear-gradient(135deg,#312e81,#8b5cf6)'];
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const cv = t => COVERS[hash(t) % COVERS.length];
const initials = t => String(t || '?').split(/\s+/).filter(w => /[a-z0-9]/i.test(w[0] || '')).map(w => w[0]).join('').slice(0, 3).toUpperCase();
const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const ic = (name, style = 'solid') => `<i class="fa-${style} fa-${name}"></i>`;
const storeName = it => it.storeLabel || (it.platform === 'other' ? 'PC' : PLATFORMS[it.platform]?.name || 'PC');

function toast(msg, icon = 'circle-check') {
  const el = document.createElement('div');
  el.className = 'toast'; el.innerHTML = `${ic(icon)}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Broken/blocked cover images: remove them so the gradient + initials show instead.
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.dataset.fb && img.src !== img.dataset.fb) { img.src = img.dataset.fb; img.dataset.fb = ''; } // e.g. Steam header -> store thumbnail
  else img.remove();
}, true);

/* ---------------- state ---------------- */
const data = { free: null, freeErr: null, homeDeals: null, deals: { key: null, items: [], page: 0, done: false, loading: false, err: null }, installed: {} };
const ui = { q: '', freeTab: 'all', freeStore: 'all', lootTab: 'all', dealStore: 'all', dealSort: 'Deal Rating', dealQuick: null, subsTab: 'all', savedTab: 'all', msearch: false };
const registry = new Map();
const reg = it => { registry.set(it.id, it); return it.id; };

const followed = () => new Set(store.get().followed);
const byFollowed = list => { const f = followed(); return list.filter(i => i.platform === 'other' || f.has(i.platform)); };
const byQuery = list => { const q = ui.q.trim().toLowerCase(); return q ? list.filter(i => i.title.toLowerCase().includes(q)) : list; };
const followedCs = () => store.get().followed.filter(k => PLATFORMS[k]?.cs);
const endsSoonest = (a, b) => (a.endsAt ? new Date(a.endsAt) : Infinity) - (b.endsAt ? new Date(b.endsAt) : Infinity);

/* ---------------- loading ---------------- */
async function loadFree(force) {
  if (data.free && !force) return;
  try { data.free = await api.allFree(); data.freeErr = !data.free.games.length && !data.free.loot.length && data.free.failed ? new Error('offline') : null;
  if (data.freeErr) data.free = null; }
  catch (e) { data.freeErr = e; }
  render();
}
async function loadHomeDeals(force) {
  if (data.homeDeals && !force) return;
  try { data.homeDeals = await api.deals({ stores: followedCs(), sortBy: 'Deal Rating' }); } catch { data.homeDeals = []; }
  render();
}
const dealsKey = () => JSON.stringify([ui.dealStore, ui.dealSort, ui.dealQuick, ui.q, store.get().followed.join()]);
/** Load the first page when filters change; further pages only via "Load more". */
function ensureDeals() { if (data.deals.key !== dealsKey()) loadDeals(true); }
async function loadDeals(reset) {
  const key = dealsKey();
  if (reset || key !== data.deals.key) data.deals = { key, items: [], page: 0, done: false, loading: false, err: null };
  const d = data.deals;
  if (d.loading || d.done) return;
  d.loading = true; render();
  const opts = { stores: ui.dealStore === 'all' ? followedCs() : [ui.dealStore], sortBy: ui.dealSort, page: d.page, title: ui.q.trim() || undefined };
  if (ui.dealQuick === '90') { opts.minDiscount = 90; opts.sortBy = 'Savings'; }
  if (ui.dealQuick === '5') opts.upperPrice = 5;
  if (ui.dealQuick === 'aaa') opts.aaa = true;
  try {
    const items = await api.deals(opts);
    if (key !== data.deals.key) return;
    d.items.push(...items.filter(i => !d.items.some(x => x.id === i.id)));
    d.page++;
    if (items.length < (opts.minDiscount ? 1 : 60)) d.done = true;
  } catch (e) { d.err = e; d.done = true; }
  d.loading = false; render();
}
async function refreshAll() {
  api.clearMemCache();
  data.free = null; data.homeDeals = null; data.deals.key = null;
  render();
  await Promise.all([loadFree(true), loadHomeDeals(true)]);
  if (page() === 'deals') loadDeals(true);
  toast('Feeds refreshed');
}

/* ---------------- shared bits ---------------- */
function timer(it) {
  if (it.kind === 'upcoming' && it.startsAt) {
    const ms = new Date(it.startsAt) - Date.now();
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5);
    return `<span class="timer" style="color:var(--purple2)">${ic('hourglass-half')}${ms > 0 ? `In ${d ? d + 'd ' : ''}${h}h` : 'Starting'}</span>`;
  }
  if (!it.endsAt) return '';
  const ms = new Date(it.endsAt) - Date.now();
  const t = alerts.endsText(it).replace('Ends in ', '');
  return `<span class="timer" ${ms < 864e5 ? 'style="color:var(--red)"' : ''}>${ic('clock', 'regular')}${t}</span>`;
}
function badges(it) {
  if (it.kind === 'deal') return `<span class="off">-${it.discount}%</span>`;
  if (it.kind === 'upcoming') return `<span class="badge b-purple" style="background:#1a1a1acc">Free soon</span>`;
  return `<span class="badge b-free">Free</span>${it.type && it.type !== 'Free to keep' ? `<span class="badge b-white">${esc(it.type)}</span>` : ''}`;
}
function cover(it, cls = 'cover') {
  return `<div class="${cls}" style="background:${cv(it.title)}">${esc(initials(it.title))}${it.image ? `<img src="${esc(it.image)}" ${it.thumb && it.thumb !== it.image ? `data-fb="${esc(it.thumb)}"` : ''} alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}`;
}
function card(it) {
  reg(it);
  const saved = !!store.get().saved[it.id];
  return `<div class="card" data-action="open" data-id="${esc(it.id)}">
    ${cover(it)}
      <div class="tl">${badges(it)}</div>
      <div class="tr cardactions">
        <button class="share ${saved ? 'on' : ''}" data-action="save" data-id="${esc(it.id)}" title="${saved ? 'Saved' : 'Save'}">${ic('heart', saved ? 'solid' : 'regular')}</button>
        <button class="share" data-action="share" data-id="${esc(it.id)}" title="Share">${ic('share-nodes')}</button>
      </div>
    </div>
    <div class="cbody">
      <div class="ctitle" title="${esc(it.title)}">${esc(it.title)}</div>
      <div class="cmeta">${platTag(it.platform, storeName(it))}${timer(it)}</div>
      <div class="price">${it.old ? `<span class="old">${money(it.old)}</span>` : ''}<span class="new ${it.price === 0 ? 'free' : ''}">${it.kind === 'upcoming' ? 'FREE soon' : money(it.price)}</span>${it.rating ? `<span class="rating">${it.rating}% 👍</span>` : ''}</div>
    </div></div>`;
}
const skeletons = (n, h = 230) => `<div class="grid">${Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join('')}</div>`;
const empty = (icon, title, text, action = '') => `<div class="empty">${ic(icon)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
const errorBox = () => empty('wifi', "Couldn't load the feed", 'Check your internet connection, then try again.', `<button class="btn btn-p" data-action="refresh">${ic('rotate')} Retry</button>`);
function head(t, s, right = '') { return `<div class="pagehead"><div><h1>${t}</h1>${s ? `<div class="sub">${s}</div>` : ''}</div>${right}</div>`; }
function chips(list, current, action) {
  return `<div class="chips">${list.map(([v, l]) => `<span class="chip ${v === current ? 'on' : ''}" data-action="${action}" data-v="${esc(v)}">${l}</span>`).join('')}</div>`;
}
const mobileSearch = () => ui.msearch ? `<label class="search" style="max-width:none;margin-bottom:16px"><i class="fa-solid fa-magnifying-glass"></i><input id="q2" type="search" placeholder="Search…" value="${esc(ui.q)}" autocomplete="off"></label>` : '';

/* ---------------- pages ---------------- */
const NAV = [
  ['home', 'Home', 'house'], ['free', 'Free Games', 'gift'], ['deals', 'Deals', 'tags'], ['drops', 'Twitch Drops', 'twitch', 'brands'],
  ['dlc', 'DLC & Loot', 'cube'], ['subs', 'Subscriptions', 'credit-card'],
  ['alerts', 'Alerts', 'bell'], ['platforms', 'Platforms', 'store'], ['saved', 'Saved', 'heart'], ['settings', 'Settings', 'gear'],
];
const page = () => { const id = (location.hash.slice(1) || 'home').split('?')[0]; return PAGES[id] ? id : 'home'; };

function renderNav(active) {
  const s = store.get();
  const counts = { free: data.free ? byFollowed(data.free.games).length : 0, alerts: s.alerts.length, saved: Object.keys(s.saved).length };
  let h = `<div class="logo"><div class="mark"><i class="fa-solid fa-gift"></i></div><span>Loot<b>Hub</b></span></div><div class="navlabel">Browse</div>`;
  NAV.forEach(([id, label, icon, st], i) => {
    if (i === 6) h += '<div class="navlabel">You</div>';
    h += `<a href="#${id}" class="nav ${active === id ? 'active' : ''}">${ic(icon, st)}${label}${counts[id] ? `<span class="count">${counts[id]}</span>` : ''}</a>`;
  });
  h += `<div class="spacer"></div><div class="sharecard"><h4>Share LootHub</h4><p>Tell your friends where the free stuff is.</p><button data-action="share-app">${ic('share-nodes')} Share link</button></div>`;
  $('#side').innerHTML = h;
  const more = ['dlc', 'subs', 'platforms', 'saved', 'settings', 'drops', 'more'];
  $('#bnav').innerHTML = [['home', 'Home', 'house'], ['free', 'Free', 'gift'], ['deals', 'Deals', 'tags'], ['alerts', 'Alerts', 'bell'], ['more', 'More', 'bars']]
    .map(([id, l, icon]) => `<a href="#${id}" class="${active === id || (id === 'more' && more.includes(active)) ? 'active' : ''}">${ic(icon)}${l}</a>`).join('');
  const unread = s.history.length && (!s.historySeen || new Date(s.history[0].ts) > new Date(s.historySeen));
  $('#belldot').hidden = $('#belldot2').hidden = !unread;
  $('#status').innerHTML = s.alerts.length ? `<span class="dotg"></span>Alerts on · checked ${ago(s.lastCheck)}` : '';
}

const PAGES = {
  home() {
    loadFree(); loadHomeDeals();
    if (!data.free && !data.freeErr) return `<div class="skel" style="height:300px"></div><div class="stats">${'<div class="skel" style="height:110px"></div>'.repeat(4)}</div><div class="section">${skeletons(4)}</div>`;
    if (data.freeErr && !data.free) return errorBox();
    const games = byQuery(byFollowed(data.free.games)), loot = byQuery(byFollowed(data.free.loot));
    const rank = g => (g.platform === 'epic' ? 0 : g.platform === 'steam' ? 1 : PLATFORMS[g.platform]?.major ? 2 : 3) + (/bundle/i.test(g.title) ? 5 : 0) + (g.image ? 0 : 9);
    const hero = [...games].filter(g => g.type === 'Free to keep').sort((a, b) => rank(a) - rank(b) || (b.old || 0) - (a.old || 0))[0] || games[0];
    const value = games.reduce((s, g) => s + (g.old || 0), 0);
    const s = store.get();
    let h = '';
    if (hero) {
      reg(hero);
      h += `<div class="hero">${hero.image ? `<div class="bgimg" style="background-image:url('${esc(hero.image)}')"></div>` : ''}<div class="shade"></div>
        <div class="art" style="background:${cv(hero.title)}">${hero.image ? `<img src="${esc(hero.image)}" alt="">` : ''}</div>
        <div class="info">
          <span class="badge b-free">${esc(hero.type || 'Free')}</span> ${hero.endsAt ? `<span class="badge b-purple">${ic('clock', 'regular')} ${alerts.endsText(hero)}</span>` : ''}
          <h3>${esc(hero.title)}</h3>
          <p>Free on ${esc(storeName(hero))}${hero.old ? ` — normally ${money(hero.old)}` : ''}. Claim it and it's yours to keep.</p>
          <div class="row">
            <button class="btn btn-w" data-action="get" data-id="${esc(hero.id)}">${ic('arrow-up-right-from-square')} Get it on ${esc(storeName(hero))}</button>
            <button class="btn btn-g" data-action="open" data-id="${esc(hero.id)}">${ic('circle-info')} Details</button>
            <button class="btn btn-g" data-action="share" data-id="${esc(hero.id)}">${ic('share-nodes')} Share</button>
          </div>
        </div></div>`;
    }
    h += `<div class="stats">
      <div class="stat"><div class="k"><span class="ic">${ic('gift')}</span>Free right now</div><div class="v">${games.length}</div><div class="d">on stores you follow</div></div>
      <div class="stat"><div class="k"><span class="ic">${ic('cube')}</span>Free DLC & loot</div><div class="v">${loot.length}</div><div class="d">items to claim</div></div>
      <div class="stat"><div class="k"><span class="ic">${ic('tags')}</span>Hot deals</div><div class="v">${data.homeDeals ? data.homeDeals.length : '…'}</div><div class="d">top-rated discounts</div></div>
      <div class="stat"><div class="k"><span class="ic">${ic('sack-dollar')}</span>Free games value</div><div class="v">$${Math.round(value)}</div><div class="d">if you claim them all</div></div>
    </div>`;
    if (!s.alerts.length) h += `<div class="note" style="margin-top:22px">${ic('bell')}<div><b>Never miss a free game.</b> Turn on alerts for a store (like Epic Games) or a game you want, and LootHub notifies you${isDesktop ? ' from the tray' : ''} the moment it's free or on sale. <a href="#alerts" style="color:var(--purple2);font-weight:600">Set up alerts →</a></div></div>`;
    h += `<div class="section"><div class="sechead"><h2>${ic('gift')} Free games — ending soon</h2><a href="#free">See all →</a></div>
      ${games.length ? `<div class="grid hscroll">${[...games].sort(endsSoonest).slice(0, 8).map(card).join('')}</div>` : empty('gift', 'No free games right now', 'Check back soon, or turn on alerts.')}</div>`;
    if (data.free.upcoming.length) h += `<div class="section"><div class="sechead"><h2>${ic('hourglass-half')} Free next on Epic Games</h2></div><div class="grid hscroll">${data.free.upcoming.map(card).join('')}</div></div>`;
    h += `<div class="section"><div class="sechead"><h2>${ic('fire')} Top deals</h2><a href="#deals">See all →</a></div>
      ${data.homeDeals ? `<div class="grid hscroll">${byQuery(data.homeDeals).slice(0, 8).map(card).join('')}</div>` : skeletons(4)}</div>`;
    if (loot.length) h += `<div class="section"><div class="sechead"><h2>${ic('cube')} Free DLC & loot</h2><a href="#dlc">See all →</a></div><div class="grid hscroll">${loot.slice(0, 8).map(card).join('')}</div></div>`;
    return h;
  },

  free() {
    loadFree();
    const tabs = [['all', 'All'], ['Free to keep', 'Free to keep'], ['Early access', 'Early access / betas'], ['upcoming', 'Coming soon']];
    const stores = store.get().followed;
    let h = head('Free Games', 'Every free-to-keep game across your stores — claim before the timer runs out.') +
      `<div class="toolbar">${chips(tabs, ui.freeTab, 'freeTab')}<select class="select" data-change="freeStore"><option value="all">All my stores</option>${stores.map(k => `<option value="${k}" ${ui.freeStore === k ? 'selected' : ''}>${PLATFORMS[k].name}</option>`).join('')}</select></div>`;
    if (!data.free) return h + (data.freeErr ? errorBox() : skeletons(8));
    let list = ui.freeTab === 'upcoming' ? data.free.upcoming : byFollowed(data.free.games);
    if (ui.freeTab !== 'all' && ui.freeTab !== 'upcoming') list = list.filter(i => i.type === ui.freeTab);
    if (ui.freeStore !== 'all') list = list.filter(i => i.platform === ui.freeStore);
    list = byQuery(list).sort(endsSoonest);
    return h + (list.length ? `<div class="grid">${list.map(card).join('')}</div>` : empty('gift', 'Nothing here right now', 'Try another filter, or set an alert so we tell you when something lands.', `<a class="btn btn-p" href="#alerts">${ic('bell')} Create alert</a>`));
  },

  deals() {
    ensureDeals();
    const d = data.deals;
    const storeChips = [['all', 'All my stores'], ...followedCs().map(k => [k, PLATFORMS[k].name])];
    const quick = [['90', '90%+ off'], ['5', 'Under $5'], ['aaa', 'AAA only']];
    let h = head('Deals & Discounts', 'Live prices from 15 stores — Steam, Epic, GOG, Humble, Fanatical, GMG and more. Prices in USD.') +
      `<div class="toolbar">${chips(storeChips, ui.dealStore, 'dealStore')}</div>
       <div class="toolbar">
         <select class="select" data-change="dealSort">${[['Deal Rating', 'Best deals'], ['Savings', 'Biggest discount'], ['Price', 'Lowest price'], ['Recent', 'Newest'], ['Reviews', 'Best reviewed'], ['Metacritic', 'Metacritic']].map(([v, l]) => `<option value="${v}" ${ui.dealSort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
         <div class="chips">${quick.map(([v, l]) => `<span class="chip ${ui.dealQuick === v ? 'on' : ''}" data-action="dealQuick" data-v="${v}">${l}</span>`).join('')}</div>
       </div>`;
    if (!d.items.length && d.loading) return h + `<div class="skel" style="height:500px"></div>`;
    if (!d.items.length && d.err) return h + errorBox();
    if (!d.items.length) return h + empty('tags', 'No deals match', 'Try another store or filter.');
    const saved = store.get().saved;
    h += `<div class="table"><div class="tr-row head"><span></span><span>Game</span><span>Store</span><span>Discount</span><span>Price</span><span>Was</span><span></span></div>
      ${d.items.map(it => {
        reg(it);
        return `<div class="tr-row" data-action="open" data-id="${esc(it.id)}">
          ${cover(it, 'thumb')}</div>
          <div style="min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.title)}</div>
            <div class="rating">${it.ratingText ? `${esc(it.ratingText)} · ${it.rating}%` : ''}${it.metacritic ? ` · MC ${it.metacritic}` : ''}</div>
            <div class="mo" style="margin-top:4px">${platTag(it.platform, storeName(it))}</div></div>
          <span class="hm">${platTag(it.platform, storeName(it))}</span>
          <span class="hm"><span class="off">-${it.discount}%</span></span>
          <span><span class="new">${money(it.price)}</span><div class="old mo" style="font-size:12px">${money(it.old)} · -${it.discount}%</div></span>
          <span class="hm old">${money(it.old)}</span>
          <span class="hm acts"><button class="minibtn ${saved[it.id] ? 'on' : ''}" data-action="save" data-id="${esc(it.id)}" title="Save">${ic('heart', saved[it.id] ? 'solid' : 'regular')}</button><button class="minibtn" data-action="get" data-id="${esc(it.id)}" title="Open store">${ic('arrow-up-right-from-square')}</button></span>
        </div>`;
      }).join('')}</div>`;
    if (!d.done) h += `<div class="loadmore"><button class="btn btn-g" data-action="moreDeals" ${d.loading ? 'disabled' : ''}>${d.loading ? 'Loading…' : 'Load more deals'}</button></div>`;
    return h;
  },

  drops() {
    loadFree();
    const dropLoot = data.free ? byQuery(byFollowed(data.free.loot)).filter(i => ['Drop', 'Twitch reward', 'Prime Loot', 'In-game item'].includes(i.type)) : null;
    return head('Twitch Drops', 'Watch streams, earn in-game rewards.') +
      `<div class="drops-hero"><div><h3>${ic('twitch', 'brands')} Live Drops campaigns</h3>
        <p>Twitch doesn't publish drops publicly, so LootHub opens Twitch's own Drops page${isDesktop ? ' inside the app' : ''}. Sign in once to see every active campaign, your watch progress and rewards ready to claim.</p></div>
        <div class="row"><button class="btn btn-w" data-action="twitch" data-v="campaigns">${ic('gift')} Browse campaigns</button><button class="btn btn-g" data-action="twitch" data-v="inventory">${ic('box-open')} My inventory</button></div></div>
       <div class="steps">
        <div class="step"><div class="n">1</div><h4>Link your game account</h4><p>Each campaign shows which game account to connect on Twitch (Riot, Ubisoft, Steam…).</p></div>
        <div class="step"><div class="n">2</div><h4>Watch a drops-enabled stream</h4><p>Look for the "Drops Enabled" tag. Progress counts while the stream plays.</p></div>
        <div class="step"><div class="n">3</div><h4>Claim the reward</h4><p>Claim it from your Drops inventory and it shows up in your game.</p></div>
       </div>
       <div class="sechead"><h2>${ic('cube')} Drops & in-game loot right now</h2><a href="#dlc">All loot →</a></div>
       ${dropLoot == null ? skeletons(4) : dropLoot.length ? `<div class="grid">${dropLoot.map(card).join('')}</div>` : empty('box-open', 'No loot drops right now', 'New ones show up here as soon as they go live.')}`;
  },

  dlc() {
    loadFree();
    let h = head('DLC & Free Loot', 'Free DLC, in-game items, keys, Prime loot and drops.');
    if (!data.free) return h + (data.freeErr ? errorBox() : skeletons(8));
    const all = byQuery(byFollowed(data.free.loot));
    const types = [...new Set(all.map(i => i.type))];
    h += `<div class="toolbar">${chips([['all', `All (${all.length})`], ...types.map(t => [t, `${t} (${all.filter(i => i.type === t).length})`])], ui.lootTab, 'lootTab')}</div>`;
    const list = ui.lootTab === 'all' ? all : all.filter(i => i.type === ui.lootTab);
    return h + (list.length ? `<div class="grid">${list.map(card).join('')}</div>` : empty('cube', 'No free loot right now', 'Check back soon.'));
  },

  subs() {
    const tabs = [['all', 'All'], ['discord', 'Discord'], ['library', 'Game libraries'], ['streaming', 'Streaming & Prime']];
    const list = SUBS.filter(s => ui.subsTab === 'all' || s.cat === ui.subsTab).filter(s => !ui.q || s.name.toLowerCase().includes(ui.q.toLowerCase()));
    return head('Subscriptions & Prices', 'Discord Nitro, Game Pass, EA Play, Ubisoft+ and more.') +
      `<div class="note">${ic('circle-info')}<div>Standard US monthly prices, last checked ${SUBS_CHECKED}. Prices change by region and over time — tap <b>View offer</b> to see today's price and any promo.</div></div>
       <div class="toolbar">${chips(tabs, ui.subsTab, 'subsTab')}</div>
       <div class="subs">${list.map(s => `<div class="sub-card">
         <div class="logoBox" style="background:${s.color};color:${s.fg || '#fff'}">${brandSvg(s.logo, 24)}</div>
         <h3>${esc(s.name)}</h3>
         <div class="pr">$${s.price.toFixed(2)}<small>/mo</small></div>
         <div class="yr">${s.yearly ? `or $${s.yearly}/year (save ${Math.round((1 - s.yearly / (s.price * 12)) * 100)}%)` : 'Monthly plan'}</div>
         <ul>${s.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
         ${s.promo ? `<div style="color:var(--green);font-size:12px;margin-bottom:12px">${ic('bolt')} ${esc(s.promo)}</div>` : ''}
         <button class="btn btn-g" style="width:100%;justify-content:center" data-action="url" data-v="${esc(s.url)}">${ic('arrow-up-right-from-square')} View offer</button></div>`).join('')}</div>`;
  },

  alerts() {
    const s = store.get();
    if (s.history.length && (!s.historySeen || new Date(s.history[0].ts) > new Date(s.historySeen))) setTimeout(() => store.set({ historySeen: new Date().toISOString() }), 0);
    const hasFree = s.alerts.some(a => a.type === 'free'), has90 = s.alerts.some(a => a.type === 'discount' && a.minDiscount === 90);
    const next = s.lastCheck ? Math.max(0, Math.round((new Date(s.lastCheck).getTime() + s.settings.interval * 6e4 - Date.now()) / 6e4)) : 0;
    return head('Alerts', `Get a notification when a store has something free, a game you want goes on sale, or a huge discount drops.${isDesktop ? ' Works while LootHub runs in the tray.' : ' Works while LootHub is open.'}`,
      `<button class="btn btn-p" data-action="newAlert">${ic('plus')} New alert</button>`) +
      `<div class="quick">
        <button class="qa" data-action="quick" data-v="free">${ic('gift')}<b>${hasFree ? '✓ ' : ''}Any free game</b><span>Every new free game on your stores</span></button>
        <button class="qa" data-action="newAlert" data-v="store">${ic('store')}<b>A store</b><span>e.g. everything free on Epic Games</span></button>
        <button class="qa" data-action="newAlert" data-v="game">${ic('gamepad')}<b>A game</b><span>When it drops to your price or goes free</span></button>
        <button class="qa" data-action="quick" data-v="90">${ic('percent')}<b>${has90 ? '✓ ' : ''}90%+ off deals</b><span>Only the really big discounts</span></button>
      </div>
      <div class="alerts-grid">
        <div>
          <div class="sechead"><h2>Your alerts (${s.alerts.length})</h2></div>
          ${s.alerts.length ? `<div class="alist">${s.alerts.map(a => {
            const d = alerts.describe(a);
            const iconHtml = a.type === 'store' ? logo(a.platform, 42) : a.type === 'game' ? (a.image ? `<img src="${esc(a.image)}" alt="">` : ic('gamepad')) : a.type === 'free' ? ic('gift') : ic('percent');
            return `<div class="arow"><div class="aic" ${a.type === 'store' ? 'style="background:none"' : ''}>${iconHtml}</div>
              <div class="grow"><h4>${esc(d.title)}</h4><p>${esc(d.sub)}</p>${a.lastMatches != null ? `<p style="color:#71717a">${a.lastMatches} matching right now</p>` : ''}</div>
              <button class="minibtn" data-action="delAlert" data-id="${a.id}" title="Delete alert">${ic('trash-can', 'regular')}</button></div>`;
          }).join('')}</div>` : empty('bell', 'No alerts yet', 'Pick one of the options above, or tap the bell on any store or game.')}
        </div>
        <div style="display:grid;gap:16px">
          <div class="panel"><h3>${ic('signal')} Status</h3>
            <div style="display:grid;gap:8px;font-size:13px;color:#d4d4d8">
              <div>Notifications: <b style="color:${s.settings.notifications ? 'var(--green)' : 'var(--red)'}">${s.settings.notifications ? 'On' : 'Off'}</b></div>
              <div>Last check: <b>${ago(s.lastCheck)}</b>${s.alerts.length ? ` · next in ~${next} min` : ''}</div>
              <div>Checking every <b>${s.settings.interval} min</b> <a href="#settings" style="color:var(--purple2)">change</a></div>
            </div>
            <div class="row" style="margin-top:14px"><button class="btn btn-p" data-action="checkNow">${ic('rotate')} Check now</button><button class="btn btn-g" data-action="testNotif">${ic('bell')} Test</button></div>
          </div>
          <div class="panel"><h3>${ic('clock-rotate-left')} Recent notifications</h3>
            ${s.history.length ? `<div class="hist">${s.history.slice(0, 12).map((n, i) => `<div class="hrow" data-action="hist" data-v="${i}"><div style="min-width:0"><div class="t">${esc(n.title)}</div><div class="b">${esc(n.body)}</div></div><div class="w">${ago(n.ts)}</div></div>`).join('')}</div>` : '<p style="color:var(--muted);font-size:13px">Nothing yet. When an alert matches, it shows up here too.</p>'}
          </div>
        </div>
      </div>`;
  },

  platforms() {
    const f = followed();
    if (isDesktop) STORE_KEYS.forEach(k => { if (data.installed[k] === undefined) { data.installed[k] = null; isAppInstalled(k).then(v => { data.installed[k] = v; if (page() === 'platforms') render(); }); } });
    const pcard = k => {
      const p = PLATFORMS[k], on = f.has(k), al = alerts.findStoreAlert(k);
      const inst = data.installed[k];
      return `<div class="platc"><button class="pl" style="padding:0;background:none" data-action="openStore" data-v="${k}" title="Open ${esc(p.name)}">${logo(k, 46)}</button>
        <div style="min-width:0" title="${p.cs ? 'Free games, loot and deals' : 'Free games & loot (no deals feed for this store)'}"><h4>${esc(p.name)}</h4><p>${on ? 'Following' : 'Hidden'}${inst ? ' · <span class="ok">Installed</span>' : ''}</p></div>
        <div class="acts"><button class="bell ${al ? 'on' : ''}" data-action="storeBell" data-v="${k}" title="${al ? 'Alerts on' : 'Notify me'}">${ic('bell', al ? 'solid' : 'regular')}</button>
        <button class="toggle ${on ? 'on' : ''}" data-action="follow" data-v="${k}" title="${on ? 'Following' : 'Follow'}"></button></div></div>`;
    };
    const major = STORE_KEYS.filter(k => PLATFORMS[k].major), more = STORE_KEYS.filter(k => !PLATFORMS[k].major);
    return head('Platforms', 'Choose the stores you use — LootHub only shows loot from these. Tap the bell to get notified about a store.') +
      `<div class="sechead"><h2>Major PC stores</h2></div><div class="plats">${major.map(pcard).join('')}</div>
       <div class="section"><div class="sechead"><h2>More platforms</h2></div><div class="plats">${more.map(pcard).join('')}</div></div>`;
  },

  saved() {
    const all = Object.values(store.get().saved).reverse();
    const tabs = [['all', 'All'], ['free', 'Free'], ['deal', 'Deals'], ['loot', 'Loot']];
    const list = byQuery(ui.savedTab === 'all' ? all : all.filter(i => i.kind === ui.savedTab));
    return head('Saved', 'Games and loot you\'re keeping an eye on. Tap the bell inside a game to get price alerts.') +
      `<div class="toolbar">${chips(tabs, ui.savedTab, 'savedTab')}</div>` +
      (list.length ? `<div class="grid">${list.map(card).join('')}</div>` : empty('heart', 'Nothing saved yet', 'Tap the heart on any game, deal or loot to keep it here.', `<a class="btn btn-p" href="#deals">${ic('tags')} Browse deals</a>`));
  },

  settings() {
    const s = store.get().settings;
    const row = (k, t, d, extraCls = '') => `<div class="setrow ${extraCls}"><div><h4>${t}</h4><p>${d}</p></div><button class="toggle ${s[k] ? 'on' : ''}" style="margin-left:auto" data-action="setting" data-v="${k}"></button></div>`;
    return head('Settings', 'Notifications, the tray and preferences.') + `<div class="setlist">
      ${row('notifications', 'Notifications', 'Show a notification when an alert matches')}
      ${row('sound', 'Notification sound', 'Play the system sound with notifications')}
      <div class="setrow"><div><h4>Check for new loot every</h4><p>How often LootHub looks for matches${isDesktop ? ' in the background' : ' while open'}</p></div>
        <select class="select" style="margin-left:auto" data-change="interval">${[10, 15, 30, 60, 120].map(m => `<option value="${m}" ${s.interval === m ? 'selected' : ''}>${m < 60 ? m + ' minutes' : m / 60 + ' hour' + (m > 60 ? 's' : '')}</option>`).join('')}</select></div>
      ${row('openInApp', 'Open in store apps', 'Steam, Epic, etc. open in their app when installed — otherwise the website')}
      ${isDesktop ? row('closeToTray', 'Keep running in the tray', 'Closing the window hides LootHub to the taskbar tray so alerts keep working') : ''}
      ${isDesktop ? row('startWithSystem', 'Start with Windows', 'Launch LootHub quietly in the tray when you sign in') : ''}
      <div class="setrow"><div><h4>Test notification</h4><p>Make sure notifications reach you</p></div><button class="btn btn-g" style="margin-left:auto" data-action="testNotif">${ic('bell')} Send test</button></div>
      <div class="setrow"><div><h4>Reset alert memory</h4><p>Forget which items you were already notified about</p></div><button class="btn btn-g" style="margin-left:auto" data-action="resetSeen">Reset</button></div>
    </div>
    ${!isDesktop ? `<div class="note" style="margin-top:18px;max-width:760px">${ic('mobile-screen')}<div><b>Install LootHub on your phone:</b> open the browser menu and choose "Add to Home screen" / "Install app". On PC, get the desktop app for tray notifications.</div></div>` : ''}
    <div class="panel" style="margin-top:18px;max-width:760px"><h3>${ic('circle-info')} About</h3>
      <p style="color:var(--muted);font-size:13px;line-height:1.6">LootHub ${isDesktop ? 'desktop' : 'web'} · Data from <b>GamerPower</b> (free games & loot), <b>Epic Games</b> (weekly free games) and <b>CheapShark</b> (deals). Store logos from Simple Icons & Font Awesome; trademarks belong to their owners. LootHub isn't affiliated with any store.</p></div>`;
  },

  more() {
    return head('More', '') + `<div class="setlist">${NAV.filter(([id]) => !['home', 'free', 'deals', 'alerts'].includes(id)).map(([id, l, icon, st]) => `<a href="#${id}" class="setrow" style="display:flex">${ic(icon, st)}<h4>${l}</h4><span style="margin-left:auto;color:var(--muted)">›</span></a>`).join('')}</div>
      <div class="sharecard" style="margin-top:16px"><h4>Share LootHub</h4><p>Tell your friends where the free stuff is.</p><button data-action="share-app">${ic('share-nodes')} Share link</button></div>`;
  },
};

/* ---------------- item modal ---------------- */
async function openModal(it) {
  reg(it);
  const o = $('#overlay');
  const saved = !!store.get().saved[it.id];
  const hasAlert = alerts.findGameAlert(it.gameID, it.title);
  const sName = storeName(it);
  const appLink = appLinkFor(it);
  o.innerHTML = `<div class="modal" style="position:relative" role="dialog" aria-label="${esc(it.title)}"><button class="closeX" data-action="close" title="Close">✕</button>
    ${cover(it)}</div>
    <div class="mb"><div class="row" style="gap:6px;align-items:center">${badges(it)}${platTag(it.platform, sName)}</div>
      <h2>${esc(it.title)}</h2>
      <div class="price" style="margin:0 0 12px">${it.old ? `<span class="old">${money(it.old)}</span>` : ''}<span class="new ${it.price === 0 ? 'free' : ''}" style="font-size:22px">${it.kind === 'upcoming' ? 'FREE soon' : money(it.price)}</span>${timer(it)}</div>
      ${it.desc ? `<p class="desc">${esc(it.desc).replace(/\n/g, '<br>')}</p>` : ''}
      ${it.instructions ? `<div class="history-box"><b>How to claim</b>${esc(it.instructions).replace(/\r?\n/g, '<br>')}</div>` : ''}
      <div id="gameinfo"></div>
      <div class="openbox">
        <button class="btn btn-p" data-action="get" data-id="${esc(it.id)}" id="primaryOpen">${ic(appLink ? 'desktop' : 'arrow-up-right-from-square')} ${appLink ? `Open in ${esc(sName)} app` : `Get it on ${esc(sName)}`}</button>
        <button class="btn btn-g" data-action="web" data-id="${esc(it.id)}">${ic('globe')} Open website</button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-g" data-action="save" data-id="${esc(it.id)}">${ic('heart', saved ? 'solid' : 'regular')} ${saved ? 'Saved' : 'Save'}</button>
        <button class="btn btn-g" data-action="gameBell" data-id="${esc(it.id)}">${ic('bell', hasAlert ? 'solid' : 'regular')} ${hasAlert ? 'Alert on' : 'Alert me'}</button>
        <button class="btn btn-g" data-action="share" data-id="${esc(it.id)}">${ic('share-nodes')} Share</button>
      </div>
      <div class="hint">${ic('circle-info')}<span>${appLink ? `If the ${esc(sName)} app is installed it opens straight to this game. If not, the store website opens instead.` : `Opens the ${esc(sName)} page${PLATFORMS[it.platform]?.app ? ` — sign in with your ${esc(sName)} account to claim` : ''}.`}</span></div>
    </div></div>`;
  o.classList.add('show');
  // Desktop: change the label if the store app isn't installed.
  if (appLink && isDesktop) isAppInstalled(it.platform).then(inst => {
    const b = $('#primaryOpen'); if (b && inst === false) b.innerHTML = `${ic('arrow-up-right-from-square')} Get it on ${esc(sName)}`;
  });
  if (it.gameID) {
    try {
      const info = (await api.gamesInfo([it.gameID]))[it.gameID];
      const box = $('#gameinfo');
      if (box && info) box.innerHTML = `<div class="history-box">${info.cheapestEver ? `<div>${ic('chart-line')} Lowest price ever: <b>${money(info.cheapestEver.price)}</b> (${new Date(info.cheapestEver.date).toLocaleDateString()})${it.price <= info.cheapestEver.price ? ' — <span class="ok">this is the lowest!</span>' : ''}</div>` : ''}
        ${info.deals.length > 1 ? `<div style="margin-top:6px"><b>Prices on other stores</b></div><div class="otherdeals">${info.deals.slice(0, 5).map(d => `<div class="od" data-action="url" data-v="https://www.cheapshark.com/redirect?dealID=${esc(d.dealID)}">${logo(d.platform)}<span>${esc(d.storeLabel || PLATFORMS[d.platform]?.name)}</span>${d.savings ? `<span class="off" style="font-size:11px">-${d.savings}%</span>` : ''}<span class="p">${money(d.price)}</span></div>`).join('')}</div>` : ''}</div>`;
    } catch { /* optional extra */ }
  }
}
const closeModal = () => { $('#overlay').classList.remove('show'); $('#overlay').innerHTML = ''; };

/* ---------------- alert form ---------------- */
const form = { tab: 'store', platform: 'epic', kinds: ['free', 'loot'], minDiscount: 75, game: null, target: '', results: [], dMin: 90, dMax: '' };
function openAlertForm(tab = 'store', prefill = {}) {
  Object.assign(form, { tab, results: [], game: null, target: '' }, prefill);
  renderAlertForm();
  $('#overlay').classList.add('show');
  if (tab === 'game' && form.game?.title && !form.game.gameID) searchGame(form.game.title, true);
}
function renderAlertForm() {
  const tabs = [['store', 'Store'], ['game', 'Game'], ['discount', 'Big discount'], ['free', 'Any free game']];
  let body = '';
  if (form.tab === 'store') body = `
    <div class="field"><label>Store</label><select class="input" data-fchange="platform">${STORE_KEYS.map(k => `<option value="${k}" ${form.platform === k ? 'selected' : ''}>${PLATFORMS[k].name}</option>`).join('')}</select></div>
    <div class="field"><label>Notify me about</label><div class="checks">${[['free', 'Free games'], ['loot', 'Free DLC & loot'], ['deal', 'Deals']].map(([v, l]) => `<span class="chip ${form.kinds.includes(v) ? 'on' : ''}" data-action="fkind" data-v="${v}">${l}</span>`).join('')}</div></div>
    ${form.kinds.includes('deal') ? (PLATFORMS[form.platform].cs ? `<div class="field"><label>Only deals with at least</label><select class="input" data-fchange="minDiscount">${[0, 50, 75, 90].map(v => `<option value="${v}" ${+form.minDiscount === v ? 'selected' : ''}>${v ? v + '% off' : 'Any discount'}</option>`).join('')}</select></div>` : `<p class="hint">${ic('circle-info')} We don't have a deals feed for ${PLATFORMS[form.platform].name} — only free games & loot.</p>`) : ''}`;
  if (form.tab === 'game') body = `
    <div class="field"><label>Find a game</label><input class="input" id="gsearch" placeholder="Type a game name…" value="${esc(form.game?.title || '')}" autocomplete="off"></div>
    <div class="results" id="gresults">${form.results.map((g, i) => `<button class="res ${form.game?.gameID === g.gameID ? 'on' : ''}" data-action="fpick" data-v="${i}"><img src="${esc(g.image || g.thumb || '')}" alt=""><div><div class="rt">${esc(g.title)}</div><div class="rp">Cheapest now: ${money(g.cheapest)}</div></div></button>`).join('')}</div>
    <div class="field"><label>Notify me when it costs (optional)</label><input class="input" id="gtarget" type="number" min="0" step="0.01" placeholder="e.g. 10 — leave empty for any price drop" value="${esc(form.target)}"></div>
    <p class="hint">${ic('circle-info')} You'll also be notified if it's given away for free on any store.</p>`;
  if (form.tab === 'discount') body = `
    <div class="field"><label>Minimum discount</label><select class="input" data-fchange="dMin">${[75, 80, 90, 95].map(v => `<option value="${v}" ${+form.dMin === v ? 'selected' : ''}>${v}% off or more</option>`).join('')}</select></div>
    <div class="field"><label>Max price (optional)</label><input class="input" id="dmax" type="number" min="0" step="0.5" placeholder="e.g. 5" value="${esc(form.dMax)}"></div>`;
  if (form.tab === 'free') body = `<p class="desc" style="margin-top:16px">Get a notification for every new free-to-keep game on the stores you follow (change those on the Platforms page).</p>`;
  $('#overlay').innerHTML = `<div class="modal form" style="position:relative"><button class="closeX" data-action="close" style="background:#2a2a2a">✕</button><div class="mb">
    <h2>${ic('bell')} New alert</h2>
    <div class="tabs">${tabs.map(([v, l]) => `<button class="${form.tab === v ? 'on' : ''}" data-action="ftab" data-v="${v}">${l}</button>`).join('')}</div>
    ${body}
    <div class="modal-actions"><button class="btn btn-g" data-action="close">Cancel</button><button class="btn btn-p" data-action="fsave">${ic('check')} Create alert</button></div></div></div>`;
  const gs = $('#gsearch');
  if (gs) { gs.addEventListener('input', debounce(e => searchGame(e.target.value), 350)); if (!form.game) gs.focus(); }
  $('#gtarget')?.addEventListener('input', e => { form.target = e.target.value; });
  $('#dmax')?.addEventListener('input', e => { form.dMax = e.target.value; });
}
async function searchGame(q, autopick) {
  if (q.trim().length < 2) return;
  try {
    form.results = await api.searchGames(q.trim());
    if (autopick && form.results[0]) form.game = form.results.find(r => r.title.toLowerCase() === q.toLowerCase()) || null;
    const box = $('#gresults');
    if (box) box.innerHTML = form.results.length ? form.results.map((g, i) => `<button class="res ${form.game?.gameID === g.gameID ? 'on' : ''}" data-action="fpick" data-v="${i}"><img src="${esc(g.image || g.thumb || '')}" alt=""><div><div class="rt">${esc(g.title)}</div><div class="rp">Cheapest now: ${money(g.cheapest)}</div></div></button>`).join('') : '<p class="hint">No games found.</p>';
  } catch { toast("Couldn't search right now", 'triangle-exclamation'); }
}
async function saveAlertForm() {
  let rule;
  if (form.tab === 'store') {
    if (!form.kinds.length) return toast('Pick at least one thing to be notified about', 'triangle-exclamation');
    const kinds = PLATFORMS[form.platform].cs ? form.kinds : form.kinds.filter(k => k !== 'deal');
    const existing = alerts.findStoreAlert(form.platform);
    if (existing) alerts.removeAlert(existing.id);
    rule = { type: 'store', platform: form.platform, kinds: kinds.length ? kinds : ['free'], minDiscount: +form.minDiscount || 0 };
  } else if (form.tab === 'game') {
    const g = form.game;
    if (!g) return toast('Search and pick a game first', 'triangle-exclamation');
    const target = form.target === '' ? null : Math.max(0, parseFloat(form.target));
    rule = { type: 'game', gameID: g.gameID || null, title: g.title, image: g.image || g.thumb || null, targetPrice: isNaN(target) ? null : target, basePrice: g.cheapest ?? null };
  } else if (form.tab === 'discount') {
    rule = { type: 'discount', minDiscount: +form.dMin, maxPrice: form.dMax === '' ? null : +form.dMax };
  } else {
    if (store.get().alerts.some(a => a.type === 'free')) { closeModal(); return toast('You already have this alert'); }
    rule = { type: 'free' };
  }
  const ok = await alerts.ensurePermission();
  alerts.addAlert(rule);
  closeModal(); render();
  toast(ok ? 'Alert created — we\'ll notify you' : 'Alert created. Allow notifications in your browser to get pop-ups.', ok ? 'bell' : 'triangle-exclamation');
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------------- actions ---------------- */
function toggleSave(it) {
  const saved = { ...store.get().saved };
  if (saved[it.id]) { delete saved[it.id]; toast('Removed from Saved', 'heart-crack'); }
  else { saved[it.id] = { id: it.id, kind: it.kind, type: it.type, title: it.title, platform: it.platform, storeLabel: it.storeLabel, price: it.price, old: it.old, discount: it.discount, image: it.image, thumb: it.thumb, url: it.url, appUrl: it.appUrl, endsAt: it.endsAt, gameID: it.gameID, steamAppID: it.steamAppID, desc: it.desc }; toast('Saved', 'heart'); }
  store.set({ saved });
}
const ACTIONS = {
  open: (el, it) => it && openModal(it),
  get: (el, it) => it && openItem(it),
  web: (el, it) => it && openItem(it, { forceWeb: true }),
  save: (el, it) => { if (it) { toggleSave(it); if ($('#overlay').classList.contains('show') && $('#overlay .mb h2')?.textContent === it.title) openModal(it); } },
  share: async (el, it) => { const r = await share(it); if (r === 'copied') toast('Link copied to clipboard', 'link'); },
  'share-app': async () => { const r = await share(null); if (r === 'copied') toast('Link copied to clipboard', 'link'); },
  close: () => closeModal(),
  refresh: () => refreshAll(),
  msearch: () => { ui.msearch = !ui.msearch; render(); setTimeout(() => $('#q2')?.focus(), 0); },
  freeTab: el => { ui.freeTab = el.dataset.v; },
  lootTab: el => { ui.lootTab = el.dataset.v; },
  subsTab: el => { ui.subsTab = el.dataset.v; },
  savedTab: el => { ui.savedTab = el.dataset.v; },
  dealStore: el => { ui.dealStore = el.dataset.v; },
  dealQuick: el => { ui.dealQuick = ui.dealQuick === el.dataset.v ? null : el.dataset.v; },
  moreDeals: () => loadDeals(),
  url: el => window.loothub ? window.loothub.openSmart({ webUrl: el.dataset.v }) : window.open(el.dataset.v, '_blank', 'noopener'),
  twitch: el => { const url = `https://www.twitch.tv/drops/${el.dataset.v}`; window.loothub?.openTwitch ? window.loothub.openTwitch(url) : window.open(url, '_blank', 'noopener'); },
  openStore: el => openStore(el.dataset.v),
  follow: el => {
    const k = el.dataset.v, f = new Set(store.get().followed);
    f.has(k) ? f.delete(k) : f.add(k);
    store.set({ followed: STORE_KEYS.filter(x => f.has(x)) });
    data.homeDeals = null;
  },
  storeBell: el => {
    const k = el.dataset.v, a = alerts.findStoreAlert(k);
    if (a) { alerts.removeAlert(a.id); toast(`Alerts off for ${PLATFORMS[k].name}`, 'bell-slash'); }
    else openAlertForm('store', { platform: k, kinds: PLATFORMS[k].cs ? ['free', 'loot', 'deal'] : ['free', 'loot'], minDiscount: 75 });
  },
  gameBell: (el, it) => {
    const a = alerts.findGameAlert(it.gameID, it.title);
    if (a) { alerts.removeAlert(a.id); toast('Alert removed', 'bell-slash'); openModal(it); return; }
    openAlertForm('game', { game: { gameID: it.gameID || null, title: it.title, image: it.image, cheapest: it.price ?? null } });
  },
  newAlert: el => openAlertForm(el.dataset.v || 'store'),
  quick: async el => {
    const v = el.dataset.v, s = store.get();
    const ex = v === 'free' ? s.alerts.find(a => a.type === 'free') : s.alerts.find(a => a.type === 'discount' && a.minDiscount === 90);
    if (ex) { alerts.removeAlert(ex.id); toast('Alert removed', 'bell-slash'); return; }
    await alerts.ensurePermission();
    alerts.addAlert(v === 'free' ? { type: 'free' } : { type: 'discount', minDiscount: 90, maxPrice: null });
    toast('Alert created — we\'ll notify you', 'bell');
  },
  delAlert: el => { alerts.removeAlert(el.dataset.id); toast('Alert deleted', 'trash-can'); },
  checkNow: async el => { el.disabled = true; el.innerHTML = `${ic('rotate')} Checking…`; const r = await alerts.runCheck({ fresh: true }).catch(() => null); toast(r ? (r.notified ? `${r.notified} new notification(s)` : 'No new matches — you\'re up to date') : 'Check failed — are you online?', r ? 'circle-check' : 'triangle-exclamation'); render(); },
  testNotif: async () => {
    const ok = await alerts.ensurePermission();
    if (!ok) return toast('Notifications are blocked — allow them in your browser settings', 'triangle-exclamation');
    const it = data.free?.games?.[0];
    alerts.notify({ title: 'LootHub notifications work!', body: it ? `Example: ${it.title} is free on ${storeName(it)}` : 'You\'ll see alerts like this one.', item: it });
  },
  hist: el => { const n = store.get().history[+el.dataset.v]; if (n?.item) openModal(n.item); },
  setting: el => {
    const k = el.dataset.v, v = !store.get().settings[k];
    store.setting(k, v);
    window.loothub?.setSetting?.(k, v);
    if (k === 'notifications' && v) alerts.ensurePermission();
  },
  resetSeen: () => { store.set({ seen: {}, alerts: store.get().alerts.map(a => ({ ...a, primed: false })) }); toast('Alert memory cleared'); },
  ftab: el => { form.tab = el.dataset.v; renderAlertForm(); },
  fkind: el => { const v = el.dataset.v; form.kinds = form.kinds.includes(v) ? form.kinds.filter(k => k !== v) : [...form.kinds, v]; renderAlertForm(); },
  fpick: el => { form.game = form.results[+el.dataset.v]; if (form.target === '' && form.game) form.target = ''; renderAlertForm(); },
  fsave: () => saveAlertForm(),
};
const NO_RERENDER = new Set(['open', 'get', 'web', 'share', 'share-app', 'close', 'refresh', 'url', 'twitch', 'openStore', 'newAlert', 'ftab', 'fkind', 'fpick', 'fsave', 'hist', 'checkNow', 'testNotif', 'msearch', 'moreDeals', 'storeBell', 'gameBell']);

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) { if (e.target.id === 'overlay') closeModal(); return; }
  const a = el.dataset.action, fn = ACTIONS[a];
  if (!fn) return;
  e.preventDefault();
  const it = el.dataset.id ? (registry.get(el.dataset.id) || store.get().saved[el.dataset.id]) : null;
  fn(el, it);
  if (!NO_RERENDER.has(a)) render();
});
document.addEventListener('change', e => {
  const k = e.target.dataset.change, fk = e.target.dataset.fchange;
  if (fk) { form[fk] = e.target.value; renderAlertForm(); return; }
  if (!k) return;
  if (k === 'interval') { store.setting('interval', +e.target.value); toast('Saved'); }
  else ui[k] = e.target.value;
  render();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const onSearch = debounce(v => { ui.q = v; render(); }, 250);
$('#q').addEventListener('input', e => onSearch(e.target.value));
document.addEventListener('input', e => { if (e.target.id === 'q2') onSearch(e.target.value); });

/* ---------------- render loop ---------------- */
let lastPage = null;
function render() {
  const p = page();
  renderNav(p);
  const active = document.activeElement?.id;
  $('#content').innerHTML = (p === 'home' || p === 'free' || p === 'deals' || p === 'dlc' ? mobileSearch() : '') + PAGES[p]();
  if (active === 'q2') { const q2 = $('#q2'); q2?.focus(); q2?.setSelectionRange(q2.value.length, q2.value.length); }
  if (p !== lastPage) { window.scrollTo(0, 0); lastPage = p; }
}
window.addEventListener('hashchange', () => { closeModal(); render(); });
// Re-render when saved state changes (alerts added, checks finished…) unless the user is typing or a dialog is open.
store.subscribe(debounce(() => {
  if ($('#overlay').classList.contains('show') || document.activeElement?.matches('input,select')) renderNav(page());
  else render();
}, 60));
setInterval(() => { if (!$('#overlay').classList.contains('show') && !document.activeElement?.matches('input,select')) render(); }, 60e3); // countdowns

/* ---------------- desktop bridge & startup ---------------- */
alerts.setNotificationClickHandler(it => openModal(it));
if (isDesktop) {
  window.loothub.onNotificationClick(id => {
    const it = alerts.itemFromNotification(id) || registry.get(id);
    if (it) openModal(it); else location.hash = '#alerts';
  });
  window.loothub.onCommand(cmd => {
    if (cmd === 'check') alerts.runCheck({ fresh: true }).then(r => toast(r.notified ? `${r.notified} new notification(s)` : 'No new matches')).catch(() => { });
    if (cmd.startsWith('go:')) location.hash = cmd.slice(3);
    if (cmd.startsWith('set:')) { const [, k, v] = cmd.split(':'); store.setting(k, v === 'true'); render(); }
  });
  const s = store.get().settings;
  window.loothub.setSetting('closeToTray', s.closeToTray);
  window.loothub.setSetting('notifications', s.notifications);
  window.loothub.setSetting('startWithSystem', s.startWithSystem);
}
if (!isDesktop && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
render();
alerts.startScheduler();
