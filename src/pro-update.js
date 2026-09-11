// pro-update: update channel — prompts users to update whenever you publish a new version.
// How it works: on launch the app fetches version.json from your update server
// (default: https://parj.africa/downloads/pdf-editor/version.json). If the
// server version is newer than APP_VERSION below, a banner prompts the user to
// download + install. Works in the installed desktop app, PWA and browser.
import { status, reg, openDialog } from './pro-core.js'

export const APP_VERSION = '1.5.0'
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
  // Final fallback: GitHub API
  try {
    const api = await fetch('https://api.github.com/repos/noahotim/pdf-direct-editor/releases/latest', { cache: 'no-store', signal, headers: { Accept: 'application/vnd.github.v3+json' } })
    if (!api.ok) throw new Error('API ' + api.status)
    const rel = await api.json()
    const tag = (rel.tag_name || '').replace(/^v/, '')
    const asset = (rel.assets || []).find(a => a.name === 'version.json')
    if (asset && asset.browser_download_url) {
      const r2 = await fetch(asset.browser_download_url + '?t=' + bust, { cache: 'no-store', signal, redirect: 'follow' })
      if (r2.ok) { const j2 = await r2.json(); if (j2 && j2.version) return j2 }
    }
    if (tag) return { version: tag, url: rel.html_url, notes: rel.body ? rel.body.slice(0, 200) : '' }
  } catch (e) { lastErr = e }
  throw lastErr || new Error('all update sources failed')
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
    if (!info.url) { status('No download link available — opening releases page'); if (window.botimUpdater) window.botimUpdater.openUrl(RELEASES_PAGE); else window.open(RELEASES_PAGE, '_blank'); return }
    if (isDesktop) {
      updNow.textContent = 'Downloading…'
      updNow.disabled = true
      prog.style.display = 'inline'
      prog.textContent = 'Starting download…'
      try {
        const dl = await window.botimUpdater.download(info.url)   // downloads the REAL Setup.exe
        if (!dl || dl.ok === false) throw new Error((dl && dl.error) || 'download failed')
        // progress + downloaded events update the UI below
      } catch (e) {
        updNow.textContent = btnLabel
        updNow.disabled = false
        prog.textContent = 'Auto-download failed — opening browser download instead'
        status('Auto-update failed, opening real download: ' + e.message)
        window.botimUpdater.openUrl(info.url)
      }
    } else {
      // Web/PWA: trigger a real browser download of the Setup.exe (not localStorage)
      const a = document.createElement('a')
      a.href = info.url
      a.download = info.url.split('/').pop() || 'BOTIM-DOCSHUB-Setup.exe'
      a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      status('Downloading the real installer… run it when finished to update')
    }
  }
  document.getElementById('updLater').onclick = () => {
    bar.remove()
    try { localStorage.setItem('pde-update-dismissed', info.version) } catch { /* ignore */ }
  }
  // listen for real download progress / completion from Electron main process
  if (isDesktop && window.botimUpdater.onStatus) {
    window.botimUpdater.onStatus((p) => {
      if (p.type === 'progress') prog.textContent = `Downloading installer… ${p.percent}%${p.total ? ` (${(p.downloaded/1048576).toFixed(1)}/${(p.total/1048576).toFixed(1)} MB)` : ''}`
      if (p.type === 'downloaded') {
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
      if (!manual) status(`Update available: v${info.version} — see the banner on top`)
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
        if (!info.url) { if (window.botimUpdater) window.botimUpdater.openUrl(RELEASES_PAGE); else window.open(RELEASES_PAGE, '_blank'); return }
        if (isAuto) {
          try { const r = await window.botimUpdater.download(info.url); if (r && r.ok === false) throw new Error(r.error); status('Downloading the real installer in background… see the green banner for progress') }
          catch (e) { status('Auto-download failed, opening real download: ' + e.message); window.botimUpdater.openUrl(info.url) }
        } else {
          const a = document.createElement('a'); a.href = info.url; a.download = info.url.split('/').pop() || 'BOTIM-DOCSHUB-Setup.exe'; a.rel='noopener'
          document.body.appendChild(a); a.click(); a.remove()
          status('Downloading the real installer… run it when finished to update')
        }
      }
    }
  })
  drop.appendChild(b)
  const v = document.createElement('div')
  v.style.cssText = 'font-size:11px;color:#94a3b8;padding:4px 10px;'
  v.textContent = `Installed version: v${APP_VERSION}`
  drop.appendChild(v)
})()

reg('upd-check', () => checkForUpdates(true))

