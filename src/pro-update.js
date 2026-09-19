// pro-update: update channel — prompts users to update whenever you publish a new version.
// How it works: on launch the app fetches version.json from your update server
// (default: https://parj.africa/downloads/pdf-editor/version.json). If the
// server version is newer than APP_VERSION below, a banner prompts the user to
// download + install. Works in the installed desktop app, PWA and browser.
import { status, reg, openDialog } from './pro-core.js'

export const APP_VERSION = '1.8.9'
// Update channel: version.json is attached to every GitHub release, fetched
// through the stable "latest" URL (no server to maintain).
// To move hosts, point this at any HTTPS URL serving version.json and republish.
export const UPDATE_JSON_URL = 'https://github.com/noahotim/pdf-direct-editor/releases/latest/download/version.json'
export const RELEASES_PAGE = 'https://github.com/noahotim/pdf-direct-editor/releases/latest'

function cmp(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x) || 0)
  const pb = String(b).split('.').map((x) => parseInt(x) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

let remoteInfo = null

async function fetchRemote(signal) {
  const bust = Date.now()
  const tries = [
    `${UPDATE_JSON_URL}?t=${bust}`,
    `https://raw.githubusercontent.com/noahotim/pdf-direct-editor/main/deploy/version.json?t=${bust}`,
    `https://cdn.jsdelivr.net/gh/noahotim/pdf-direct-editor@main/deploy/version.json?t=${bust}`,
  ]
  let lastErr = null
  for (const url of tries) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal, redirect: 'follow' })
      if (!res.ok) throw new Error('server replied ' + res.status + ' for ' + url.split('?')[0])
      const j = await res.json()
      if (j && j.version) return j
      throw new Error('no version in response')
    } catch (e) {
      if (signal && signal.aborted) throw e
      lastErr = e
      console.warn('update fetch failed for', url.split('?')[0], e.message)
    }
  }
  // Final fallback: GitHub API — return the DIRECT .exe asset (never the page, never a tag-only record)
  try {
    const rel = await latestRelease(signal)
    const tag = (rel.tag_name || '').replace(/^v/, '')
    const vj = (rel.assets || []).find((a) => a.name === 'version.json')
    if (vj && vj.browser_download_url) {
      const r2 = await fetch(vj.browser_download_url + '?t=' + bust, { cache: 'no-store', signal, redirect: 'follow' })
      if (r2.ok) { const j2 = await r2.json(); if (j2 && j2.version) { if (!/\.exe/i.test(j2.url || '')) j2.url = exeFromRelease(rel); return j2 } }
    }
    const exe = exeFromRelease(rel)
    if (tag && exe) return { version: tag, url: exe, notes: rel.body ? rel.body.slice(0, 200) : '' }
  } catch (e) { lastErr = e }
  throw lastErr || new Error('all update sources failed')
}
// get the latest release object (with assets)
async function latestRelease(signal) {
  const api = await fetch('https://api.github.com/repos/noahotim/pdf-direct-editor/releases/latest', { cache: 'no-store', signal, headers: { Accept: 'application/vnd.github.v3+json' } })
  if (!api.ok) throw new Error('GitHub API ' + api.status)
  return api.json()
}
// pick the downloadable Setup .exe asset (direct file URL, not the release page)
function exeFromRelease(rel) {
  const assets = (rel && rel.assets) || []
  const a = assets.find((x) => /setup.*\.exe$/i.test(x.name)) || assets.find((x) => /\.exe$/i.test(x.name))
  return a ? a.browser_download_url : ''
}
// ensure we always have a real .exe download URL (fixes "opened a page instead of downloading")
async function resolveExeUrl(info) {
  if (info && info.url && /\.exe(\?|$)/i.test(info.url)) return info.url
  try { const rel = await latestRelease(new AbortController().signal); const u = exeFromRelease(rel); if (u) return u } catch {}
  return (info && info.url) || RELEASES_PAGE
}

// ---- automatic update preference (default ON): download + install + relaunch, no manual steps ----
const AUTO_KEY = 'botim-auto-update'
function isAutoUpdate() { try { return localStorage.getItem(AUTO_KEY) !== 'off' } catch { return true } }
function setAutoUpdate(on) { try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off') } catch {} ; status('Automatic updates ' + (on ? 'ON — updates install themselves' : 'OFF — you will be asked')) }

// Download the real installer and run it immediately (in place), then the app restarts on the new version.
async function autoUpdateNow(info) {
  if (!window.botimUpdater || !info) return false
  const bar = document.getElementById('updateBanner')
  const prog = document.getElementById('updProg')
  const updNow = document.getElementById('updNow')
  if (prog) { prog.style.display = 'inline'; prog.textContent = 'Auto-updating: resolving download…' }
  if (updNow) { updNow.disabled = true; updNow.textContent = 'Updating…' }
  try {
    const exeUrl = await resolveExeUrl(info)
    if (!exeUrl || !/^https?:/i.test(exeUrl)) throw new Error('no installer URL')
    if (prog) prog.textContent = 'Auto-updating: downloading…'
    const dl = await window.botimUpdater.download(exeUrl)
    if (!dl || dl.ok === false) throw new Error((dl && dl.error) || 'download failed')
    if (prog) prog.textContent = 'Installing update — the app will restart automatically…'
    await window.botimUpdater.install()   // runs the installer silently and quits → restarts updated
    return true
  } catch (e) {
    if (prog) prog.textContent = 'Auto-update failed: ' + e.message
    if (updNow) { updNow.disabled = false; updNow.textContent = '⬇️ Update Now' }
    if (bar) bar.dataset.failed = '1'
    status('Auto-update failed — click Update Now to try again')
    return false
  }
}

function showBanner(info) {
  if (document.getElementById('updateBanner')) return
  const bar = document.createElement('div')
  bar.id = 'updateBanner'
  const isDesktop = !!(window.botimUpdater && window.desktop?.isDesktop)
  const btnLabel = isDesktop ? '⬇️ Update Now' : '⬇️ Download Update'
  bar.innerHTML = `<span>🎉 <b>Update available: v${info.version}</b> (you have v${APP_VERSION})${info.notes ? ` — ${info.notes}` : ''}</span>
    <span id="updProg" style="font-size:11px;color:#bbf7d0;display:none;"></span>
    <button id="updNow" class="btn btn-small" style="width:auto;background:#16a34a;border-color:#16a34a;color:#fff;">${btnLabel}</button>
    <button id="updLater" class="btn btn-small" style="width:auto;">Later</button>`
  const nav = document.getElementById('menubar')
  nav.after(bar)
  const updNow = document.getElementById('updNow')
  const prog = document.getElementById('updProg')
  updNow.onclick = async () => {
    updNow.disabled = true
    prog.style.display = 'inline'
    prog.textContent = 'Resolving download…'
    const exeUrl = await resolveExeUrl(info)   // always the direct .exe
    if (isDesktop) {
      // Direct install — no manual Downloads folder step. Downloads to hidden app cache and runs silently.
      updNow.textContent = 'Updating…'
      prog.textContent = 'Downloading update directly…'
      try {
        const ok = await autoUpdateNow(info)
        if (!ok) throw new Error('auto-update failed')
      } catch (e) {
        updNow.disabled = false
        updNow.textContent = btnLabel
        prog.textContent = 'Opening download in browser instead…'
        status('Direct update failed, opening download: ' + e.message)
        window.botimUpdater.openUrl(exeUrl)
      }
    } else {
      // Web/PWA: one click = immediate download of the installer file (no localStorage, no page)
      const a = document.createElement('a')
      a.href = exeUrl
      a.download = exeUrl.split('/').pop() || 'BOTIM-DOCSHUB-Setup.exe'
      a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      updNow.disabled = false
      prog.textContent = 'Download started — check your Downloads folder'
      status('Downloading the installer… it saves to your Downloads folder')
    }
  }
  document.getElementById('updLater').onclick = () => {
    bar.remove()
    try { localStorage.setItem('pde-update-dismissed', info.version) } catch { /* ignore */ }
  }
  // listen for real download progress / completion from Electron main process
  if (isDesktop && window.botimUpdater.onStatus) {
    window.botimUpdater.onStatus(async (p) => {
      if (p.type === 'progress') prog.textContent = `Updating directly… ${p.percent}%${p.total ? ` (${(p.downloaded/1048576).toFixed(1)}/${(p.total/1048576).toFixed(1)} MB)` : ''}`
      if (p.type === 'downloaded') {
        // Direct install — no second click needed when auto-update is ON
        if (isAutoUpdate()) {
          prog.textContent = `Downloaded (${(p.size/1048576).toFixed(1)} MB) — installing directly…`
          updNow.textContent = 'Installing…'
          updNow.disabled = true
          status('Installing update directly — app will restart…')
          try {
            const r = await window.botimUpdater.install()
            if (r && r.ok === false) throw new Error(r.error)
          } catch (e) { prog.textContent = 'Install failed: ' + e.message; updNow.disabled = false; updNow.textContent = '🔄 Retry Update' }
          return
        }
        prog.textContent = `Downloaded installer (${(p.size/1048576).toFixed(1)} MB) — ready to update`
        updNow.textContent = '🔄 Restart & Update'
        updNow.disabled = false
        updNow.onclick = async () => {
          status('Installing update — the app will close and reopen…')
          const r = await window.botimUpdater.install()
          if (r && r.ok === false) status('Install failed: ' + r.error)
        }
        status('Update downloaded — click "Restart & Update" to install')
      }
      if (p.type === 'error') prog.textContent = 'Update error: ' + p.message
    })
  }
}

export async function checkForUpdates(manual = false) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const info = await fetchRemote(ctrl.signal)
    clearTimeout(timer)
    if (!info || !info.version) {
      if (manual) status('Update server gave no version — try again later')
      return null
    }
    remoteInfo = info
    const cmpRes = cmp(info.version, APP_VERSION)
    if (cmpRes > 0) {
      let dismissed = null
      try { dismissed = localStorage.getItem('pde-update-dismissed') } catch { /* ignore */ }
      if (dismissed !== info.version || manual) showBanner(info)
      // fully automatic: download + install + relaunch in place, no manual steps
      const isDesktop = !!(window.botimUpdater && window.desktop?.isDesktop)
      if (!manual && isDesktop && isAutoUpdate() && info.url) {
        status(`Auto-updating to v${info.version}…`)
        autoUpdateNow(info)
      } else if (!manual) {
        status(`Update available: v${info.version} — see the banner on top`)
      }
      return info
    }
    if (cmpRes < 0) {
      try { localStorage.removeItem('pde-update-dismissed') } catch { /* ignore */ }
      if (manual) status(`You are on v${APP_VERSION} (newer than published v${info.version}) — no update needed`)
      return null
    }
    try { localStorage.removeItem('pde-update-dismissed') } catch { /* ignore */ }
    if (manual) status(`You are on the latest version (v${APP_VERSION}) — up to date ✓`)
    return null
  } catch (err) {
    clearTimeout(timer)
    const msg = err.name === 'AbortError' ? 'timed out (server slow)' : err.message
    if (manual) status('Update check failed: ' + msg + ' — check internet or try again')
    console.warn('update check failed', err)
    return null
  }
}

// auto-check shortly after launch (non-blocking; silent when offline)
window.addEventListener('load', () => setTimeout(() => checkForUpdates(false), 4000))

// Help-menu entry (injected like the other extras)
;(() => {
  const drop = document.querySelector('#menubar [data-menu="help"] .menu-drop')
  if (!drop || drop.querySelector('[data-act="upd-check"]')) return
  const b = document.createElement('button')
  b.dataset.act = 'upd-check'
  b.textContent = '🔄 Check for Updates…'
  b.addEventListener('click', async () => {
    document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'))
    status('Checking for updates…')
    const info = await checkForUpdates(true)
    if (info) {
      const { showInfo } = await import('./pro-core.js')
      const isAuto = !!(window.botimUpdater && window.desktop?.isDesktop)
      const body = showInfo('Update Available', `<div style="font-size:12px;line-height:1.8;">A new version is ready:<br/><b>v${info.version}</b> (installed: v${APP_VERSION})<br/>${info.notes || ''}<br/><small style="color:#94a3b8;">${isAuto ? 'Click Update Now — downloads in background, then Restart (no reinstall).' : 'Click Download, then run the Setup file to upgrade.'}</small></div>`)
      const ok = document.getElementById('actionOk')
      ok.textContent = isAuto ? '⬇️ Update Now' : '⬇️ Download'
      ok.onclick = async () => {
        document.getElementById('actionModal').classList.add('hidden')
        status('Resolving download…')
        const exeUrl = await resolveExeUrl(info)
        if (isAuto) {
          try { const r = await window.botimUpdater.download(exeUrl); if (r && r.ok === false) throw new Error(r.error); status('Downloading installer to your Downloads folder… see the green banner') }
          catch (e) { status('Auto-download failed, opening real download: ' + e.message); window.botimUpdater.openUrl(exeUrl) }
        } else {
          const a = document.createElement('a'); a.href = exeUrl; a.download = exeUrl.split('/').pop() || 'BOTIM-DOCSHUB-Setup.exe'; a.rel='noopener'
          document.body.appendChild(a); a.click(); a.remove()
          status('Downloading the installer… it saves to your Downloads folder')
        }
      }
    }
  })
  drop.appendChild(b)
  // auto-update toggle
  const t = document.createElement('button')
  t.dataset.act = 'upd-auto'
  t.textContent = `⚙ Automatic updates: ${isAutoUpdate() ? 'ON' : 'OFF'}`
  t.addEventListener('click', () => {
    const now = !isAutoUpdate()
    setAutoUpdate(now)
    t.textContent = `⚙ Automatic updates: ${now ? 'ON' : 'OFF'}`
    document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'))
    if (now && window.botimUpdater && window.desktop?.isDesktop) checkForUpdates(false)
  })
  drop.appendChild(t)
  const v = document.createElement('div')
  v.style.cssText = 'font-size:11px;color:#94a3b8;padding:4px 10px;'
  v.textContent = `Installed version: v${APP_VERSION}`
  drop.appendChild(v)
})()

reg('upd-check', () => checkForUpdates(true))

