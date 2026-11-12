// Live data: GamerPower (free games & loot), Epic (weekly free games), CheapShark (deals across 15 stores).
import { CS_STORES, CS_EXTRA, PLATFORMS, detectPlatform } from './platforms.js';
import { cache } from './store.js';

const isDesktop = !!window.loothub;

export async function getJSON(url) {
  // In the desktop app requests go through the main process (no CORS, proper User-Agent).
  if (isDesktop) return window.loothub.fetchJSON(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const mem = new Map();
async function cached(key, ttlMs, loader) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  try {
    const data = await loader();
    mem.set(key, { ts: Date.now(), data });
    cache.write(key, data);
    return data;
  } catch (e) {
    const stale = cache.read(key);           // offline / API down -> last good copy
    if (stale) return stale.data;
    throw e;
  }
}
export const clearMemCache = () => mem.clear();

export const steamHeader = id => `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`;
const normTitle = t => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const cleanTitle = t => (t || '')
  .replace(/\s*(key\s*)?giveaway\s*$/i, '')
  .replace(/\s*\((steam|epic games( store)?|gog|itch\.io|ubisoft|ea app|origin|battle\.net|prime gaming|indiegala|microsoft store|xbox|pc|drm-free|amazon)\)\s*/gi, ' ')
  .replace(/\s+(on\s+)?(steam|epic games( store)?|gog|itch\.io|ubisoft|ea app|battle\.net|prime gaming|indiegala|microsoft store|xbox|pc)\s*$/i, '')
  .replace(/\s+/g, ' ').trim();
const gpDate = s => (!s || s === 'N/A') ? null : new Date(s.replace(' ', 'T') + 'Z').toISOString();
const money = v => (v == null || v === 'N/A') ? null : (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, '')) || null);

/* ---------------- GamerPower ---------------- */
function lootLabel(g, plat) {
  const s = (g.title + ' ' + g.description + ' ' + g.instructions).toLowerCase();
  if (plat === 'amz') return 'Prime Loot';
  if (s.includes('twitch')) return 'Twitch reward';
  if (/\b(drop|supply|cache|chest|crate)\b/.test(s)) return 'Drop';
  if (/\b(skin|outfit|item|pack|bundle|kit|mount|weapon)\b/.test(s)) return 'In-game item';
  if (g.type === 'Other') return 'Freebie';
  return 'Free DLC';
}
function mapGiveaway(g) {
  const platform = detectPlatform(g.title, g.platforms, g.description);
  const isGame = g.type === 'Game' || g.type === 'Early Access';
  const item = {
    id: 'gp-' + g.id, source: 'GamerPower',
    kind: isGame ? 'free' : 'loot',
    type: g.type === 'Early Access' ? 'Early access' : isGame ? 'Free to keep' : lootLabel(g, platform),
    title: cleanTitle(g.title), image: g.image, thumb: g.thumbnail, platform,
    old: money(g.worth), price: 0, endsAt: gpDate(g.end_date), startedAt: gpDate(g.published_date),
    desc: g.description, instructions: g.instructions, url: g.open_giveaway_url, users: g.users,
    platformsText: g.platforms,
  };
  if (platform === 'steam') item.appUrl = null; // GamerPower gives no Steam app id
  return item;
}
export function giveaways() {
  return cached('gp', 10 * 60e3, async () => {
    const list = await getJSON('https://www.gamerpower.com/api/giveaways?platform=pc&sort-by=date');
    return Array.isArray(list) ? list.map(mapGiveaway) : [];
  });
}

/* ---------------- Epic weekly free games ---------------- */
function epicSlug(e) {
  return e.offerMappings?.[0]?.pageSlug || e.catalogNs?.mappings?.[0]?.pageSlug || (e.productSlug || '').replace(/\/home$/, '') || null;
}
function epicImage(e) {
  const imgs = e.keyImages || [];
  return (imgs.find(i => i.type === 'OfferImageWide') || imgs.find(i => i.type === 'featuredMedia') || imgs.find(i => i.type === 'Thumbnail') || {}).url;
}
export function epicFree() {
  return cached('epic', 30 * 60e3, async () => {
    const d = await getJSON('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US');
    const els = d?.data?.Catalog?.searchStore?.elements || [];
    const now = Date.now(), out = [];
    for (const e of els) {
      const slug = epicSlug(e);
      const base = {
        source: 'Epic Games', platform: 'epic', title: e.title, image: epicImage(e), thumb: epicImage(e),
        old: (e.price?.totalPrice?.originalPrice || 0) / 100 || null, price: 0, desc: e.description,
        url: slug ? `https://store.epicgames.com/en-US/p/${slug}` : 'https://store.epicgames.com/en-US/free-games',
        appUrl: slug ? `com.epicgames.launcher://store/p/${slug}` : 'com.epicgames.launcher://store',
      };
      const cur = e.promotions?.promotionalOffers?.[0]?.promotionalOffers?.find(o => o.discountSetting?.discountPercentage === 0);
      const up = e.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.find(o => o.discountSetting?.discountPercentage === 0);
      if (cur && new Date(cur.startDate) <= now && new Date(cur.endDate) > now && e.price?.totalPrice?.discountPrice === 0)
        out.push({ ...base, id: 'epic-' + e.id, kind: 'free', type: 'Free to keep', endsAt: cur.endDate, startedAt: cur.startDate });
      else if (up)
        out.push({ ...base, id: 'epic-up-' + e.id, kind: 'upcoming', type: 'Free next', startsAt: up.startDate, endsAt: up.endDate });
    }
    return out;
  });
}

/* ---------------- CheapShark deals ---------------- */
export const CS_STORE_IDS = [...Object.keys(CS_STORES), ...Object.keys(CS_EXTRA)];
function mapDeal(d) {
  const platform = CS_STORES[d.storeID] || 'other';
  const sale = +d.salePrice, normal = +d.normalPrice;
  return {
    id: 'cs-' + d.dealID, source: 'CheapShark', kind: sale === 0 ? 'free' : 'deal',
    type: sale === 0 ? 'Free to keep' : null,
    title: d.title, platform, storeLabel: CS_EXTRA[d.storeID] || null,
    price: sale, old: normal, discount: Math.round(+d.savings),
    gameID: d.gameID, steamAppID: d.steamAppID || null,
    image: d.steamAppID ? steamHeader(d.steamAppID) : d.thumb, thumb: d.thumb,
    url: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
    appUrl: d.steamAppID && platform === 'steam' ? `steam://store/${d.steamAppID}` : null,
    rating: +d.steamRatingPercent || null, ratingText: d.steamRatingText || null,
    metacritic: +d.metacriticScore || null, changedAt: d.lastChange ? new Date(d.lastChange * 1000).toISOString() : null,
  };
}
/** opts: { stores:[platformKeys], sortBy, page, title, upperPrice, minDiscount, aaa } */
export function deals(opts = {}) {
  const ids = opts.stores?.length
    ? opts.stores.map(k => PLATFORMS[k]?.cs).filter(Boolean)
    : CS_STORE_IDS;
  const q = new URLSearchParams({ pageSize: '60', pageNumber: String(opts.page || 0), sortBy: opts.sortBy || 'Deal Rating', onSale: '1' });
  if (ids.length) q.set('storeID', ids.join(','));
  if (opts.title) q.set('title', opts.title);
  if (opts.upperPrice != null) q.set('upperPrice', String(opts.upperPrice));
  if (opts.aaa) q.set('AAA', '1');
  const url = 'https://www.cheapshark.com/api/1.0/deals?' + q;
  return cached(url, 15 * 60e3, async () => {
    const list = await getJSON(url);
    let out = (Array.isArray(list) ? list : []).map(mapDeal);
    if (opts.minDiscount) out = out.filter(d => d.discount >= opts.minDiscount);
    return out;
  });
}
/** 100%-off deals on the tracked stores (counted as free games). */
export const freeDeals = () => deals({ upperPrice: 0, sortBy: 'Recent' }).catch(() => []);

/** Search games by name (for game alerts). */
export function searchGames(title) {
  return getJSON('https://www.cheapshark.com/api/1.0/games?limit=20&title=' + encodeURIComponent(title)).then(list =>
    (list || []).map(g => ({ gameID: g.gameID, title: g.external, cheapest: +g.cheapest, steamAppID: g.steamAppID, thumb: g.thumb, image: g.steamAppID ? steamHeader(g.steamAppID) : g.thumb })));
}
/** Current best deals + lowest price ever for up to 25 games: { gameID: {...} } */
export async function gamesInfo(ids) {
  if (!ids.length) return {};
  const res = await getJSON('https://www.cheapshark.com/api/1.0/games?ids=' + ids.slice(0, 25).join(','));
  const out = {};
  for (const [id, g] of Object.entries(res || {})) {
    const best = (g.deals || []).map(d => ({ ...d, price: +d.price, retail: +d.retailPrice, savings: Math.round(+d.savings), platform: CS_STORES[d.storeID] || 'other', storeLabel: CS_EXTRA[d.storeID] }))
      .sort((a, b) => a.price - b.price);
    out[id] = { title: g.info?.title, steamAppID: g.info?.steamAppID, thumb: g.info?.thumb, deals: best, cheapestEver: g.cheapestPriceEver ? { price: +g.cheapestPriceEver.price, date: new Date(g.cheapestPriceEver.date * 1000).toISOString() } : null };
  }
  return out;
}

/* ---------------- Combined feeds ---------------- */
export async function allFree() {
  const [gp, ep, cs] = await Promise.allSettled([giveaways(), epicFree(), freeDeals()]);
  const val = r => r.status === 'fulfilled' ? r.value : [];
  const epic = val(ep);
  const seen = new Set(), games = [], loot = [], upcoming = epic.filter(e => e.kind === 'upcoming');
  // Epic first (it has app deep links), then GamerPower, then CheapShark 100%-off
  for (const it of [...epic.filter(e => e.kind === 'free'), ...val(gp), ...val(cs)]) {
    const k = it.kind + ':' + normTitle(it.title);
    if (seen.has(k)) continue;
    seen.add(k);
    (it.kind === 'loot' ? loot : games).push(it);
  }
  const failed = [gp, cs].filter(r => r.status === 'rejected').length + (isDesktop && ep.status === 'rejected' ? 1 : 0);
  return { games, loot, upcoming, failed };
}
