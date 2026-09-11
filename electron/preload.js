import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', { isDesktop: true })
// auto-updater bridge — downloads the REAL Setup.exe and installs it (no localStorage)
contextBridge.exposeInMainWorld('botimUpdater', {
  check: () => ipcRenderer.invoke('botim:checkUpdate'),
  download: (url) => ipcRenderer.invoke('botim:download', url),
  install: () => ipcRenderer.invoke('botim:install'),
  openUrl: (url) => ipcRenderer.invoke('botim:openUrl', url),
  onStatus: (cb) => {
    const h = (_e, p) => cb(p)
    ipcRenderer.on('botim:updateStatus', h)
    return () => ipcRenderer.removeListener('botim:updateStatus', h)
  }
})
