// LootHub desktop: window + system tray + native notifications + "open in store app" handling.
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, nativeImage, clipboard, net } = require('electron');
const path = require('path');

const APP_ID = 'com.loothub.app';
const ASSETS = path.join(__dirname, '..', 'app', 'assets');
const UA = `LootHub/${app.getVersion()} (desktop deals app)`;
const startHidden = process.argv.includes('--hidden');

// Hosts the app may fetch data from, and protocols it may hand to the OS.
const DATA_HOSTS = new Set(['www.gamerpower.com', 'www.cheapshark.com', 'store-site-backend-static.ak.epicgames.com']);
const APP_PROTOCOLS = new Set(['steam:', 'com.epicgames.launcher:', 'goggalaxy:', 'uplay:', 'origin2:', 'battlenet:', 'ms-windows-store:', 'itch:', 'amazon-games:', 'riotclient:', 'rockstar:', 'discord:']);
const TWITCH_HOSTS = /(^|\.)(twitch\.tv|twitchcdn\.net|ttvnw\.net|jtvnw\.net|twitchsvc\.net|passport\.twitch\.tv|id\.twitch\.tv)$/;

let win = null, tray = null, twitchWin = null, quitting = false, trayHintShown = false;
const settings = { closeToTray: true, notifications: true };
const status = { lastCheck: null, notified: 0 };
const liveNotifications = new Set(); // keep references so click handlers survive GC

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showWindow());

function icon(name) { return nativeImage.createFromPath(path.join(ASSETS, name)); }

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 560,
    backgroundColor: '#1A1A1A', title: 'LootHub', icon: icon('icon-512.png'),
    autoHideMenuBar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, // alert timers keep running while hidden in the tray
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });

  win.on('close', e => {
    if (quitting || !settings.closeToTray) return;
    e.preventDefault();
    win.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      showNotification({ title: 'LootHub is still running', body: 'Alerts keep working from the tray. Right-click the tray icon to quit.' });
    }
  });

  // Links never navigate the app window: web links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => { openWeb(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); openWeb(url); } });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
const send = (ch, ...a) => win && !win.isDestroyed() && win.webContents.send(ch, ...a);
const command = c => { showWindowIfNav(c); send('command', c); };
function showWindowIfNav(c) { if (c.startsWith('go:')) showWindow(); }

/* ---------------- tray ---------------- */
function createTray() {
  const img = icon(process.platform === 'darwin' ? 'tray-16.png' : 'tray-32.png');
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip('LootHub — free games & deals');
  tray.on('click', () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  tray.on('double-click', showWindow);
  updateTrayMenu();
}
function updateTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings();
  const last = status.lastCheck ? new Date(status.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'not yet';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open LootHub', click: showWindow },
    { type: 'separator' },
    { label: 'Free games', click: () => command('go:#free') },
    { label: 'Deals', click: () => command('go:#deals') },
    { label: 'Twitch Drops', click: () => command('go:#drops') },
    { label: 'My alerts', click: () => command('go:#alerts') },
    { type: 'separator' },
    { label: 'Check for loot now', click: () => command('check') },
    { label: `Last check: ${last}`, enabled: false },
    { type: 'separator' },
    { label: 'Notifications', type: 'checkbox', checked: settings.notifications, click: m => { settings.notifications = m.checked; send('command', `set:notifications:${m.checked}`); } },
    { label: process.platform === 'darwin' ? 'Open at login' : 'Start with Windows', type: 'checkbox', checked: login.openAtLogin, click: m => setLogin(m.checked) },
    { type: 'separator' },
    { label: 'Quit LootHub', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.setToolTip(`LootHub — ${settings.notifications ? 'alerts on' : 'alerts paused'} · last check ${last}`);
}
function setLogin(on) {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
  send('command', `set:startWithSystem:${on}`);
  updateTrayMenu();
}

/* ---------------- notifications ---------------- */
function showNotification({ title, body, id, silent }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: icon('icon-192.png'), silent: !!silent });
  liveNotifications.add(n);
  n.on('click', () => { showWindow(); if (id) send('notification-click', id); liveNotifications.delete(n); });
  n.on('close', () => liveNotifications.delete(n));
  n.show();
}

/* ---------------- opening links ---------------- */
function openWeb(url) {
  try { const u = new URL(url); if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(u.toString()); } catch { /* ignore bad URLs */ }
}
function appInstalled(appUrl) {
  try {
    const proto = new URL(appUrl).protocol;
    if (!APP_PROTOCOLS.has(proto)) return false;
    return !!app.getApplicationNameForProtocol(appUrl);
  } catch { return false; }
}

/* ---------------- Twitch Drops window ---------------- */
function openTwitch(url) {
  let u; try { u = new URL(url); } catch { return; }
  if (!TWITCH_HOSTS.test(u.hostname)) return;
  if (twitchWin && !twitchWin.isDestroyed()) { twitchWin.loadURL(u.toString()); twitchWin.show(); twitchWin.focus(); return; }
  twitchWin = new BrowserWindow({
    width: 1200, height: 820, title: 'Twitch Drops — LootHub', icon: icon('icon-512.png'), backgroundColor: '#0e0e10', autoHideMenuBar: true,
    webPreferences: { partition: 'persist:twitch', contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  twitchWin.loadURL(u.toString());
  // Stay on Twitch inside this window; anything else opens in the browser.
  twitchWin.webContents.setWindowOpenHandler(({ url: next }) => {
    try { if (TWITCH_HOSTS.test(new URL(next).hostname)) { twitchWin.loadURL(next); return { action: 'deny' }; } } catch { }
    openWeb(next); return { action: 'deny' };
  });
  twitchWin.webContents.on('will-navigate', (e, next) => {
    try { if (!TWITCH_HOSTS.test(new URL(next).hostname)) { e.preventDefault(); openWeb(next); } } catch { e.preventDefault(); }
  });
  twitchWin.on('closed', () => { twitchWin = null; });
}

/* ---------------- IPC ---------------- */
ipcMain.handle('fetch-json', async (_e, url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !DATA_HOSTS.has(u.hostname)) throw new Error('Host not allowed: ' + u.hostname);
  const r = await net.fetch(u.toString(), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});
ipcMain.handle('has-protocol', (_e, proto) => appInstalled(proto));
ipcMain.handle('open-smart', (_e, { appUrl, webUrl } = {}) => {
  if (appUrl && appInstalled(appUrl)) { shell.openExternal(appUrl); return 'app'; }
  if (webUrl) { openWeb(webUrl); return 'web'; }
  return null;
});
ipcMain.on('notify', (_e, n) => { if (settings.notifications) showNotification(n); });
ipcMain.on('set-setting', (_e, k, v) => {
  if (k === 'closeToTray' || k === 'notifications') settings[k] = !!v;
  if (k === 'startWithSystem') app.setLoginItemSettings({ openAtLogin: !!v, args: ['--hidden'] });
  updateTrayMenu();
});
ipcMain.on('set-status', (_e, s) => { Object.assign(status, s); updateTrayMenu(); });
ipcMain.on('copy', (_e, text) => clipboard.writeText(String(text).slice(0, 2000)));
ipcMain.on('open-twitch', (_e, url) => openTwitch(url));
ipcMain.on('show', () => showWindow());

/* ---------------- lifecycle ---------------- */
app.whenReady().then(() => {
  createWindow();
  createTray();
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay alive in the tray */ });
app.on('activate', () => showWindow());
