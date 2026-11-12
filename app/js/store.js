// Tiny persistent state (localStorage) with safe fallbacks.
const KEY = 'loothub:v1';

const DEFAULTS = {
  followed: ['steam', 'epic', 'gog', 'ubi', 'ea', 'bnet', 'ms', 'itch', 'amz', 'humble', 'riot', 'rock', 'ig', 'fan', 'gmg', 'gj', 'idb', 'mdb', 'gg', 'gp'],
  saved: {},          // id -> item snapshot
  alerts: [],         // alert rules (see alerts.js)
  seen: {},           // ruleId -> { itemKey: timestamp }
  history: [],        // recent notifications [{ts, title, body, item}]
  settings: {
    notifications: true,
    interval: 30,          // minutes between checks
    openInApp: true,
    closeToTray: true,
    startWithSystem: false,
    showMature: false,
    sound: true,
  },
  lastCheck: null,
};

let state;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    state = { ...structuredClone(DEFAULTS), ...parsed, settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) } };
  } catch { state = structuredClone(DEFAULTS); }
}
load();

const listeners = new Set();
export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full / blocked — keep in memory */ }
    listeners.forEach(fn => fn(state));
  },
  setting(k, v) { this.set({ settings: { ...state.settings, [k]: v } }); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// Short-lived cache of feed responses so startup is instant and offline still shows something.
export const cache = {
  read(k) { try { return JSON.parse(localStorage.getItem('loothub:cache:' + k)); } catch { return null; } },
  write(k, data) { try { localStorage.setItem('loothub:cache:' + k, JSON.stringify({ ts: Date.now(), data })); } catch { } },
};
