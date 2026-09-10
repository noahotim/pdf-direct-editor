// preload - expose safe APIs if needed
import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('desktop', { isDesktop: true })
