import { contextBridge, ipcRenderer } from 'electron'


contextBridge.exposeInMainWorld('desktop', { isDesktop: true })


contextBridge.exposeInMainWorld('botimUpdater', {
  download: (url) => ipcRenderer.invoke('botim:download', url),
  install: () => ipcRenderer.invoke('botim:install'),
  openUrl: (url) => ipcRenderer.invoke('botim:openUrl', url),
  onStatus: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('botim:updateStatus', handler)
    return () => ipcRenderer.removeListener('botim:updateStatus', handler)
  }
})


contextBridge.exposeInMainWorld('botimOpen', {
  onFile: (cb) => {
    const handler = (_e, filePath) => cb(filePath)
    ipcRenderer.on('botim:openFile', handler)
    return () => ipcRenderer.removeListener('botim:openFile', handler)
  },
  ready: () => ipcRenderer.send('botim:rendererReady'),
  readFile: (filePath) => ipcRenderer.invoke('botim:readFile', filePath)
})
