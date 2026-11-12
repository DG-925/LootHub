// Alert rules + background checker + notifications.
import { store } from './store.js';
import { allFree, deals, gamesInfo, clearMemCache, steamHeader } from './api.js';
import { PLATFORMS } from './platforms.js';

/*
 Rule shapes:
  { id, type:'store',    platform:'epic', kinds:['free','loot','deal'], minDiscount:50 }
  { id, type:'game',     gameID, title, image, targetPrice|null, basePrice }
  { id, type:'free' }                       any free game on a followed store
  { id, type:'discount', minDiscount:90, maxPrice|null }
 Every rule: createdAt, primed (false until the first check has recorded what already exists).
*/

const uid = () => Math.random().toString(36).slice(2, 10);
const normTitle = t => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function addAlert(rule) {
  const r = { id: uid(), createdAt: new Date().toISOString(), primed: false, ...rule };
  store.set({ alerts: [...store.get().alerts, r] });
  runCheck({ only: r.id }).catch(() => { });
  return r;
}
export function removeAlert(id) {
  const { alerts, seen } = store.get();
  const s = { ...seen }; delete s[id];
  store.set({ alerts: alerts.filter(a => a.id !== id), seen: s });
}
export const findStoreAlert = p => store.get().alerts.find(a => a.type === 'store' && a.platform === p);
export const findGameAlert = (gameID, title) => store.get().alerts.find(a => a.type === 'game' && (gameID ? a.gameID === gameID : normTitle(a.title) === normTitle(title)));

export function describe(r) {
  const p = PLATFORMS[r.platform];
  switch (r.type) {
    case 'store': {
      const kinds = r.kinds.map(k => ({ free: 'free games', loot: 'free DLC & loot', deal: `deals${r.minDiscount ? ` ${r.minDiscount}%+ off` : ''}` }[k])).join(', ');
      return { title: p?.name || r.platform, sub: `Notify me about ${kinds}` };
    }
    case 'game': return { title: r.title, sub: r.targetPrice != null ? `When it's $${r.targetPrice.toFixed(2)} or less, or free` : 'When the price drops or it goes free' };
    case 'free': return { title: 'Any free game', sub: 'Every new free-to-keep game on the stores you follow' };
    case 'discount': return { title: `${r.minDiscount}%+ off`, sub: `Any deal with ${r.minDiscount}% or more off${r.maxPrice ? `, under $${r.maxPrice}` : ''}` };
  }
  return { title: 'Alert', sub: '' };
}

/* ---------------- notifications ---------------- */
const notified = new Map(); // id -> item, so a click can open the right game
export function itemFromNotification(id) { return notified.get(id); }

export async function ensurePermission() {
  if (window.loothub) return true;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

let onOpenItem = () => { };
export function setNotificationClickHandler(fn) { onOpenItem = fn; }

export function notify({ title, body, item }) {
  const { settings, history } = store.get();
  const entry = { ts: new Date().toISOString(), title, body, item: item ? slim(item) : null };
  store.set({ history: [entry, ...history].slice(0, 50) });
  if (!settings.notifications) return;
  const id = item?.id || uid();
  if (item) notified.set(id, item);
  if (window.loothub) {
    window.loothub.notify({ title, body, id, silent: !settings.sound });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, { body, icon: 'assets/icon-192.png', tag: id, silent: !settings.sound });
    n.onclick = () => { window.focus(); if (item) onOpenItem(item); n.close(); };
  }
}
const slim = it => ({ id: it.id, kind: it.kind, title: it.title, platform: it.platform, price: it.price, old: it.old, discount: it.discount, image: it.image, thumb: it.thumb, url: it.url, appUrl: it.appUrl, endsAt: it.endsAt, type: it.type, gameID: it.gameID, storeLabel: it.storeLabel });

/* ---------------- checker ---------------- */
let running = null;
export function runCheck(opts = {}) {
  if (running) return running;
  running = doCheck(opts).finally(() => { running = null; });
  return running;
}

async function doCheck({ only, fresh } = {}) {
  const state = store.get();
  const rules = state.alerts.filter(r => !only || r.id === only);
  if (!rules.length) { store.set({ lastCheck: new Date().toISOString() }); return { notified: 0 }; }
  if (fresh) clearMemCache();

  const followed = new Set(state.followed);
  const free = await allFree().catch(() => ({ games: [], loot: [] })); // every rule type can match a giveaway

  // deals: one "recent" feed for discount rules, plus one per store rule that wants deals
  const dealFeeds = {};
  const wantDeals = rules.filter(r => (r.type === 'store' && r.kinds.includes('deal')) || r.type === 'discount');
  if (wantDeals.some(r => r.type === 'discount')) dealFeeds.all = await deals({ sortBy: 'Recent' }).catch(() => []);
  for (const r of wantDeals.filter(r => r.type === 'store' && PLATFORMS[r.platform]?.cs))
    dealFeeds[r.platform] = await deals({ stores: [r.platform], sortBy: 'Recent' }).catch(() => []);

  const gameRules = rules.filter(r => r.type === 'game' && r.gameID);
  const info = gameRules.length ? await gamesInfo(gameRules.map(r => r.gameID)).catch(() => ({})) : {};

  const seenAll = { ...state.seen };
  let count = 0, newCount = 0;
  const updatedRules = [];

  for (const r of rules) {
    const matches = []; // [{key, item, title, body}]
    if (r.type === 'store') {
      const p = PLATFORMS[r.platform]?.name || r.platform;
      if (r.kinds.includes('free')) free.games.filter(i => i.platform === r.platform).forEach(i => matches.push({ key: i.id, item: i, title: `Free on ${p}: ${i.title}`, body: endsText(i) }));
      if (r.kinds.includes('loot')) free.loot.filter(i => i.platform === r.platform).forEach(i => matches.push({ key: i.id, item: i, title: `Free loot on ${p}`, body: `${i.title}${i.endsAt ? ' · ' + endsText(i) : ''}` }));
      if (r.kinds.includes('deal')) (dealFeeds[r.platform] || []).filter(d => d.discount >= (r.minDiscount || 0)).forEach(d => matches.push({ key: d.id, item: d, title: `${d.discount}% off on ${p}`, body: `${d.title} — $${d.price.toFixed(2)} (was $${d.old.toFixed(2)})` }));
    }
    if (r.type === 'free') free.games.filter(i => followed.has(i.platform) || i.platform === 'other').forEach(i => matches.push({ key: i.id, item: i, title: `Free game: ${i.title}`, body: `${PLATFORMS[i.platform]?.name || 'PC'} · ${endsText(i)}` }));
    if (r.type === 'discount') (dealFeeds.all || []).filter(d => d.discount >= r.minDiscount && (!r.maxPrice || d.price <= r.maxPrice) && followed.has(d.platform))
      .forEach(d => matches.push({ key: d.id, item: d, title: `${d.discount}% off: ${d.title}`, body: `$${d.price.toFixed(2)} on ${d.storeLabel || PLATFORMS[d.platform]?.name} (was $${d.old.toFixed(2)})` }));
    if (r.type === 'game') {
      const g = info[r.gameID], best = g?.deals?.[0];
      if (best) {
        const hit = r.targetPrice != null ? best.price <= r.targetPrice : (r.basePrice != null && best.price < r.basePrice - 0.009);
        if (hit || best.price === 0) {
          const item = { id: 'game-' + r.gameID + '-' + best.dealID, kind: best.price === 0 ? 'free' : 'deal', title: r.title, platform: best.platform, storeLabel: best.storeLabel, price: best.price, old: best.retail, discount: best.savings, gameID: r.gameID, steamAppID: g.steamAppID, image: g.steamAppID ? steamHeader(g.steamAppID) : (r.image || g.thumb), thumb: g.thumb, url: `https://www.cheapshark.com/redirect?dealID=${best.dealID}`, appUrl: g.steamAppID && best.platform === 'steam' ? `steam://store/${g.steamAppID}` : null };
          matches.push({ key: `${r.gameID}:${best.price}`, item, title: best.price === 0 ? `${r.title} is FREE` : `${r.title} is $${best.price.toFixed(2)}`, body: `${best.savings ? best.savings + '% off on ' : 'On '}${best.storeLabel || PLATFORMS[best.platform]?.name}${g.cheapestEver && best.price <= g.cheapestEver.price ? ' · lowest price ever' : ''}` });
        }
      }
      // also catch giveaways of this game
      free.games.filter(i => normTitle(i.title) === normTitle(r.title)).forEach(i => matches.push({ key: 'free:' + i.id, item: i, title: `${r.title} is FREE`, body: `On ${PLATFORMS[i.platform]?.name || 'PC'} · ${endsText(i)}` }));
    }

    const seen = { ...(seenAll[r.id] || {}) };
    const fresh = matches.filter(m => !seen[m.key]);
    // On a store/free/discount rule's first run, record what already exists instead of flooding you.
    const shouldNotify = r.primed || r.type === 'game';
    if (shouldNotify && fresh.length) {
      if (fresh.length > 3) {
        notify({ title: `${fresh.length} new matches · ${describe(r).title}`, body: fresh.slice(0, 3).map(m => m.item.title).join(', ') + '…', item: fresh[0].item });
      } else fresh.forEach(m => notify({ title: m.title, body: m.body, item: m.item }));
      count += fresh.length;
    }
    newCount += fresh.length;
    fresh.forEach(m => { seen[m.key] = Date.now(); });
    seenAll[r.id] = seen;
    updatedRules.push({ ...r, primed: true, lastMatches: matches.length });
  }

  const merged = store.get().alerts.map(a => updatedRules.find(u => u.id === a.id) || a);
  store.set({ alerts: merged, seen: seenAll, lastCheck: new Date().toISOString() });
  window.loothub?.setStatus?.({ lastCheck: Date.now(), notified: count });
  return { notified: count, matched: newCount };
}

export function endsText(i) {
  if (!i.endsAt) return 'No end date';
  const ms = new Date(i.endsAt) - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return 'Ends in ' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`);
}

/* ---------------- scheduler ---------------- */
let timer;
export function startScheduler() {
  clearInterval(timer);
  const tick = () => {
    const { lastCheck, settings } = store.get();
    if (!lastCheck || Date.now() - new Date(lastCheck) >= settings.interval * 60e3) runCheck({ fresh: true }).catch(() => { });
  };
  setTimeout(tick, 15e3);           // shortly after launch
  timer = setInterval(tick, 60e3);  // then re-evaluate every minute
}
