// Safe bridge between the LootHub UI and the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loothub', {
  platform: process.platform,
  fetchJSON: url => ipcRenderer.invoke('fetch-json', url),
  hasProtocol: proto => ipcRenderer.invoke('has-protocol', proto),
  openSmart: opts => ipcRenderer.invoke('open-smart', opts),
  notify: n => ipcRenderer.send('notify', n),
  setSetting: (k, v) => ipcRenderer.send('set-setting', k, v),
  setStatus: s => ipcRenderer.send('set-status', s),
  copy: text => ipcRenderer.send('copy', text),
  openTwitch: url => ipcRenderer.send('open-twitch', url),
  show: () => ipcRenderer.send('show'),
  onNotificationClick: fn => ipcRenderer.on('notification-click', (_e, id) => fn(id)),
  onCommand: fn => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
});
