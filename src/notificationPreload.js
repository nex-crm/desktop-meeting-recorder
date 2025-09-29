const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeNotification: () => ipcRenderer.send('close-notification'),
  sendNotificationAction: (action, data) => ipcRenderer.send('notification-action', action, data),
  openExternal: (url) => shell.openExternal(url)
});