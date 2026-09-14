import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'
import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

// Enable WebGPU so the on-device AI models (Llama/Phi via WebLLM) can run locally.
try {
  app.commandLine.appendSwitch('enable-unsafe-webgpu')
  app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU,SharedArrayBuffer')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
} catch { /* older electron */ }

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
  // DevTools only in development — removed from production (was showing Elements/Console/Sources/Network on launch)
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
    win.webContents.on('console-message', (e, lvl, msg) => console.log('renderer:', msg))
  }
  win.webContents.on('did-fail-load', (e, code, desc, url) => console.error('load failed', code, desc, url))
  win.setMenuBarVisibility(false)
}

app.whenReady().then(async () => {
  await createWindow()
  setupUpdater()
})
app.on('window-all-closed', ()=>{ if(process.platform!=='darwin') app.quit() })
app.on('activate', ()=>{ if(BrowserWindow.getAllWindows().length===0) createWindow() })

// ===== custom auto-update: downloads the REAL Setup.exe from GitHub and runs it (no localStorage) =====
function setupUpdater(){
  let installerPath = null

  // Download the given URL (follows GitHub redirects) to a temp .exe, streaming progress to the renderer.
  ipcMain.handle('botim:download', async (event, url) => {
    try {
      if (!url || !/^https?:\/\//i.test(url)) return { ok:false, error:'No valid download URL (version.json missing url)' }
      // Download into the app's own update cache (like opencode) — not the user's Downloads folder
      let dir = path.join(app.getPath('userData'), 'update')
      try { fs.mkdirSync(dir, { recursive: true }) } catch { dir = os.tmpdir() }
      const clean = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'BOTIM-DOCSHUB-Setup.exe')
      const file = path.join(dir, clean.toLowerCase().endsWith('.exe') ? clean : 'BOTIM-DOCSHUB-Setup.exe')
      try { fs.unlinkSync(file) } catch {}
      await new Promise((resolve, reject) => {
        const req = net.request({ method:'GET', url, redirect:'follow' })
        req.on('response', (res) => {
          if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode))
          const total = parseInt(res.headers['content-length'] || '0', 10)
          let got = 0
          const out = fs.createWriteStream(file)
          out.on('error', reject)
          res.on('data', (chunk) => {
            got += chunk.length
            out.write(chunk)
            const pct = total ? Math.round((got / total) * 100) : 0
            try { event.sender.send('botim:updateStatus', { type:'progress', percent: pct, downloaded: got, total }) } catch {}
          })
          res.on('end', () => out.end(() => resolve()))
          res.on('error', reject)
        })
        req.on('error', reject)
        req.end()
      })
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0
      if (size < 500000) return { ok:false, error:`Downloaded file too small (${size} bytes) — not an installer` }
      installerPath = file
      try { event.sender.send('botim:updateStatus', { type:'downloaded', path: file, size }) } catch {}
      return { ok:true, path:file, size }
    } catch (e) { return { ok:false, error:String(e && e.message || e) } }
  })

  // Run the downloaded installer silently, then exit so files unlock.
  // The installer (per-user, no UAC) replaces files and relaunches the app itself.
  ipcMain.handle('botim:install', async () => {
    try {
      if (!installerPath || !fs.existsSync(installerPath)) return { ok:false, error:'No downloaded installer found' }
      const child = spawn(installerPath, ['/S'], { detached:true, stdio:'ignore' })
      child.unref()
      // give the installer a moment, then force-exit so the .exe is unlocked
      setTimeout(() => { try { app.exit(0) } catch { app.quit() } }, 1200)
      return { ok:true }
    } catch (e) { return { ok:false, error:String(e && e.message || e) } }
  })

  // Fallback: open a URL in the system browser (real GitHub download page)
  ipcMain.handle('botim:openUrl', (e, url) => { try { shell.openExternal(url) } catch {} ; return { ok:true } })
}
