import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'
import fs from 'fs'
let autoUpdater = null
try { autoUpdater = (await import('electron-updater')).autoUpdater } catch { console.log('electron-updater not installed — manual download fallback only') }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

function createServer(root, port=0){
  return new Promise((resolve, reject)=>{
    const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'}
    const server = http.createServer((req,res)=>{
      let url = decodeURIComponent(req.url.split('?')[0])
      if(url==='/') url='/index.html'
      const filePath = path.join(root, url)
      if(!filePath.startsWith(root)) { res.writeHead(403); return res.end() }
      fs.readFile(filePath, (err,data)=>{
        if(err){ res.writeHead(404); return res.end('Not found: '+url) }
        const ext = path.extname(filePath).toLowerCase()
        res.writeHead(200, {'Content-Type': mime[ext] || 'application/octet-stream'})
        res.end(data)
      })
    })
    server.listen(port, '127.0.0.1', ()=> resolve(server))
    server.on('error', reject)
  })
}

async function createWindow(){
  const win = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { 
      preload: path.join(__dirname, 'preload.js'), 
      contextIsolation:true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'BOTIM DOCSHUB'
  })
  if(isDev){
    try { await win.loadURL('http://localhost:5173') }
    catch { 
      // fallback to dist if dev server not running
      const distRoot = path.join(__dirname, '../dist')
      const srv = await createServer(distRoot, 5174)
      const p = srv.address().port
      await win.loadURL(`http://127.0.0.1:${p}/`)
    }
  } else {
    // Serve dist via local http to avoid file:// ESM/CORS issues
    const distRoot = path.join(__dirname, '../dist')
    const srv = await createServer(distRoot, 0)
    const p = srv.address().port
    console.log('Serving dist on http://127.0.0.1:'+p)
    await win.loadURL(`http://127.0.0.1:${p}/`)
    // keep server alive
    app.on('before-quit', ()=> srv.close())
  }
  win.webContents.openDevTools({mode:'detach'})
  win.webContents.on('did-fail-load', (e, code, desc, url)=> console.error('load failed', code, desc, url))
  win.webContents.on('console-message', (e,lvl,msg)=> console.log('renderer:', msg))
  win.setMenuBarVisibility(false)
}

app.whenReady().then(async () => {
  await createWindow()
  setupAutoUpdater()
})
app.on('window-all-closed', ()=>{ if(process.platform!=='darwin') app.quit() })
app.on('activate', ()=>{ if(BrowserWindow.getAllWindows().length===0) createWindow() })

// ===== true auto-update (no reinstall) — uses GitHub Releases via electron-updater =====
function setupAutoUpdater(){
  if(!autoUpdater) return
  const win = BrowserWindow.getAllWindows()[0]
  const send = (payload) => { try{ win?.webContents.send('botim:updateStatus', payload) }catch{} }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  // GitHub provider is auto-detected from package.json repository + publish; no extra config needed for public repo
  autoUpdater.on('checking-for-update', ()=> send({ type:'checking' }))
  autoUpdater.on('update-available', (info)=> send({ type:'available', version: info.version }))
  autoUpdater.on('update-not-available', ()=> send({ type:'not-available' }))
  autoUpdater.on('error', (err)=> send({ type:'error', message: String(err.message||err) }))
  autoUpdater.on('download-progress', (p)=> send({ type:'progress', percent: Math.round(p.percent||0), bytesPerSecond: p.bytesPerSecond||0 }))
  autoUpdater.on('update-downloaded', (info)=> send({ type:'downloaded', version: info.version })
  )
  ipcMain.handle('botim:checkUpdate', async ()=>{
    if(!autoUpdater) return { supported:false }
    try{ const r = await autoUpdater.checkForUpdates(); return { supported:true, available: !!r?.updateInfo, version: r?.updateInfo?.version||null, current: app.getVersion() } }catch(e){ return { supported:true, error: String(e.message||e) } }
  })
  ipcMain.handle('botim:downloadUpdate', async ()=>{ try{ await autoUpdater.downloadUpdate(); return { ok:true } }catch(e){ return { ok:false, error: String(e.message||e) } } })
  ipcMain.handle('botim:quitAndInstall', ()=>{ try{ autoUpdater.quitAndInstall(false, true) }catch(e){ app.relaunch(); app.exit(0) } })
}
