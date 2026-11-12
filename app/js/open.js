// Opens an item in the store's desktop app when it's installed, else the website.
import { PLATFORMS } from './platforms.js';
import { store } from './store.js';

/** URL that opens this item inside the store app, if we know one. */
export function appLinkFor(item) {
  if (item.appUrl) return item.appUrl;
  if (item.platform === 'steam' && item.steamAppID) return `steam://store/${item.steamAppID}`;
  return null;
}

/** Desktop: ask the OS if the protocol is registered. Web: unknown (null). */
export async function isAppInstalled(platformKey) {
  const proto = PLATFORMS[platformKey]?.app;
  if (!proto || !window.loothub) return null;
  try { return await window.loothub.hasProtocol(proto); } catch { return null; }
}

export async function openItem(item, { forceWeb = false } = {}) {
  const app = appLinkFor(item);
  const useApp = !forceWeb && store.get().settings.openInApp && app;
  if (window.loothub) {
    // Main process checks the protocol handler and falls back to the website.
    return window.loothub.openSmart({ appUrl: useApp ? app : null, webUrl: item.url });
  }
  if (!useApp) return void window.open(item.url, '_blank', 'noopener');
  // Browser / phone: try the app link; if the page is still visible shortly after, open the website.
  let left = false;
  const onHide = () => { left = true; };
  document.addEventListener('visibilitychange', onHide, { once: true });
  window.addEventListener('blur', onHide, { once: true });
  location.href = app;
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', onHide);
    if (!left) window.open(item.url, '_blank', 'noopener');
  }, 1400);
}

/** Opens the store app's home (Platforms page), else the store website. */
export function openStore(key) {
  const p = PLATFORMS[key];
  if (window.loothub) return window.loothub.openSmart({ appUrl: p.app || null, webUrl: p.web });
  window.open(p.web, '_blank', 'noopener');
}

export async function share(item) {
  const text = item ? `${item.title} — ${item.kind === 'deal' ? `$${item.price.toFixed(2)} (${item.discount}% off)` : 'FREE'} · found with LootHub` : 'LootHub — every free game, deal, DLC and drop in one place';
  const url = item?.url || 'https://github.com/DG-925/LootHub';
  if (navigator.share) { try { await navigator.share({ title: item?.title || 'LootHub', text, url }); return 'shared'; } catch { return null; } }
  if (window.loothub) { window.loothub.copy(`${text}\n${url}`); return 'copied'; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); return 'copied'; } catch { return null; }
}
