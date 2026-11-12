import { BRAND_ICONS } from './brand-icons.js';

/**
 * Every store LootHub knows about.
 *  - logo: key in BRAND_ICONS (real logo) — missing => styled monogram
 *  - cs: CheapShark storeID (deals feed)
 *  - app: protocol that opens the store's desktop app (used to detect if it's installed)
 *  - match: keywords that identify the store in giveaway titles / platform strings
 */
export const PLATFORMS = {
  steam:  { name: 'Steam', short: 'ST', color: '#1b2838', fg: '#c7d5e0', logo: 'steam', cs: '1', app: 'steam://open/main', web: 'https://store.steampowered.com', match: ['steam'], major: true },
  epic:   { name: 'Epic Games', short: 'EG', color: '#2a2a2a', logo: 'epic', cs: '25', app: 'com.epicgames.launcher://store', web: 'https://store.epicgames.com', match: ['epic games'], major: true },
  gog:    { name: 'GOG', short: 'GOG', color: '#86328a', logo: 'gog', cs: '7', app: 'goggalaxy://openStoreUrl/www.gog.com', web: 'https://www.gog.com', match: ['gog'], major: true },
  ubi:    { name: 'Ubisoft Connect', short: 'UB', color: '#0070ff', logo: 'ubi', cs: '13', app: 'uplay://', web: 'https://store.ubisoft.com', match: ['ubisoft', 'uplay'], major: true },
  ea:     { name: 'EA app', short: 'EA', color: '#ff4747', logo: 'ea', app: 'origin2://', web: 'https://www.ea.com/games', match: ['ea app', 'origin', 'electronic arts', 'ea play'], major: true },
  bnet:   { name: 'Battle.net', short: 'BN', color: '#148eff', logo: 'bnet', app: 'battlenet://', web: 'https://shop.battle.net', match: ['battle.net', 'battlenet', 'blizzard'], major: true },
  ms:     { name: 'Microsoft Store', short: 'MS', color: '#0f6cbd', logo: 'ms', app: 'ms-windows-store://home', web: 'https://www.microsoft.com/store/games/windows', match: ['microsoft store', 'xbox pc', 'windows store'], major: true },
  itch:   { name: 'itch.io', short: 'IT', color: '#fa5c5c', logo: 'itch', app: 'itch://', web: 'https://itch.io', match: ['itch.io', 'itchio'], major: true },
  amz:    { name: 'Amazon Games', short: 'AG', color: '#ff9900', logo: 'amz', app: 'amazon-games://', web: 'https://gaming.amazon.com', match: ['prime gaming', 'amazon'], major: true },
  humble: { name: 'Humble Store', short: 'HB', color: '#cb272c', logo: 'humble', cs: '11', web: 'https://www.humblebundle.com/store', match: ['humble'], major: true },
  riot:   { name: 'Riot Client', short: 'RC', color: '#d13639', logo: 'riot', app: 'riotclient://', web: 'https://www.riotgames.com', match: ['riot', 'valorant', 'league of legends'] },
  rock:   { name: 'Rockstar Launcher', short: 'R★', color: '#fcaf17', fg: '#1a1a1a', logo: 'rock', app: 'rockstar://', web: 'https://store.rockstargames.com', match: ['rockstar'] },
  ig:     { name: 'IndieGala', short: 'IG', color: '#e4002b', cs: '30', web: 'https://www.indiegala.com', match: ['indiegala'] },
  fan:    { name: 'Fanatical', short: 'FN', color: '#ff6b00', cs: '15', web: 'https://www.fanatical.com', match: ['fanatical'] },
  gmg:    { name: 'Green Man Gaming', short: 'GM', color: '#00b25d', cs: '3', web: 'https://www.greenmangaming.com', match: ['green man gaming', 'greenmangaming'] },
  gj:     { name: 'Game Jolt', short: 'GJ', color: '#2f7f6f', logo: 'gj', web: 'https://gamejolt.com', match: ['game jolt', 'gamejolt'] },
  idb:    { name: 'Indie DB', short: 'ID', color: '#4e8fbe', web: 'https://www.indiedb.com', match: ['indie db', 'indiedb'] },
  mdb:    { name: 'Mod DB', short: 'MD', color: '#b31b1b', web: 'https://www.moddb.com', match: ['mod db', 'moddb'] },
  gg:     { name: 'GamersGate', short: 'GG', color: '#ec4c1c', cs: '2', web: 'https://www.gamersgate.com', match: ['gamersgate'] },
  gp:     { name: 'Gamesplanet', short: 'GP', color: '#0a6ad6', cs: '27', web: 'https://us.gamesplanet.com', match: ['gamesplanet'] },
  // extras (not stores you follow, used for badges)
  other:  { name: 'Other', short: '•', color: '#3f3f46', web: '', match: [], hidden: true },
  discord:{ name: 'Discord', short: 'DC', color: '#5865F2', logo: 'discord', app: 'discord://', web: 'https://discord.com', match: [], hidden: true },
  twitch: { name: 'Twitch', short: 'TW', color: '#9146FF', logo: 'twitch', web: 'https://www.twitch.tv', match: [], hidden: true },
  xbox:   { name: 'Xbox', short: 'XB', color: '#107c10', logo: 'xbox', web: 'https://www.xbox.com', match: [], hidden: true },
};

export const STORE_KEYS = Object.keys(PLATFORMS).filter(k => !PLATFORMS[k].hidden);

/** CheapShark storeID -> platform key (extra active CheapShark stores are mapped to 'other' with their own name) */
export const CS_STORES = Object.fromEntries(Object.entries(PLATFORMS).filter(([, p]) => p.cs).map(([k, p]) => [p.cs, k]));
export const CS_EXTRA = { '21': 'WinGameStore', '23': 'GameBillet', '35': 'DreamGame' };

/** Inline SVG logo, or monogram fallback, inside a colored rounded square. */
export function logo(key, size = 20) {
  const p = PLATFORMS[key] || PLATFORMS.other;
  const icon = p.logo && BRAND_ICONS[p.logo];
  const inner = icon
    ? `<svg viewBox="${icon.viewBox}" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" fill="currentColor" aria-hidden="true"><path d="${icon.d}"/></svg>`
    : `<span style="font-size:${Math.max(8, Math.round(size * 0.36))}px">${p.short}</span>`;
  return `<span class="pi" style="width:${size}px;height:${size}px;background:${p.color};color:${p.fg || '#fff'}" title="${p.name}">${inner}</span>`;
}

/** Bare brand glyph (for subscription cards etc.) */
export function brandSvg(logoKey, size = 22) {
  const icon = BRAND_ICONS[logoKey];
  if (!icon) return '';
  return `<svg viewBox="${icon.viewBox}" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${icon.d}"/></svg>`;
}

export const platTag = (key, label) => `<span class="plat">${logo(key)}${label || (PLATFORMS[key] || PLATFORMS.other).name}</span>`;

/** Best-guess store for a giveaway. Texts are checked in order (title first), whole words only. */
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ORDER = ['amz', 'ig', 'fan', 'gmg', 'gg', 'gp', 'humble', 'epic', 'gog', 'ubi', 'ea', 'bnet', 'riot', 'rock', 'itch', 'gj', 'idb', 'mdb', 'ms', 'steam'];
const RX = Object.fromEntries(ORDER.map(k => [k, new RegExp('(^|[^a-z0-9])(' + PLATFORMS[k].match.map(esc).join('|') + ')(?![a-z0-9])', 'i')]));
export function detectPlatform(...texts) {
  for (const t of texts) {
    if (!t) continue;
    for (const k of ORDER) if (RX[k].test(t)) return k;
  }
  return 'other';
}
