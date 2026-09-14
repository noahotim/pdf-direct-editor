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
// file-association bridge — OS double-click opens with BOTIM DOCSHUB
contextBridge.exposeInMainWorld('botimOpen', {
  onFile: (cb) => {
    const h = (_e, filePath) => cb(filePath)
    ipcRenderer.on('botim:openFile', h)
    return () => ipcRenderer.removeListener('botim:openFile', h)
  },
  ready: () => ipcRenderer.send('botim:rendererReady'),
  readFile: (filePath) => ipcRenderer.invoke('botim:readFile', filePath)
})
