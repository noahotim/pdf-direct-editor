import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', { isDesktop: true })
// auto-updater bridge — renderer can check/download/restart without reinstall
contextBridge.exposeInMainWorld('botimUpdater', {
  check: () => ipcRenderer.invoke('botim:checkUpdate'),
  download: () => ipcRenderer.invoke('botim:downloadUpdate'),
  quitAndInstall: () => ipcRenderer.invoke('botim:quitAndInstall'),
  onStatus: (cb) => {
    const h = (_e, p) => cb(p)
    ipcRenderer.on('botim:updateStatus', h)
    return () => ipcRenderer.removeListener('botim:updateStatus', h)
  }
})
