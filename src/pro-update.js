// pro-update: update channel — prompts users to update whenever you publish a new version.
// How it works: on launch the app fetches version.json from your update server
// (default: https://parj.africa/downloads/pdf-editor/version.json). If the
// server version is newer than APP_VERSION below, a banner prompts the user to
// download + install. Works in the installed desktop app, PWA and browser.
import { status, reg, openDialog } from './pro-core.js'

export const APP_VERSION = '1.2.0'
// Update channel: version.json is attached to every GitHub release, fetched
// through the stable "latest" URL (no server to maintain).
// To move hosts, point this at any HTTPS URL serving version.json and republish.
export const UPDATE_JSON_URL = 'https://github.com/noahotim/pdf-direct-editor/releases/latest/download/version.json'

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
  // Primary: direct version.json asset via GitHub Releases (fast, stable URL)
  // Fallback: GitHub API latest release (handles CDN/redirect/CORS edge cases)
  const url = `${UPDATE_JSON_URL}?t=${Date.now()}`
  try {
    const res = await fetch(url, { cache: 'no-store', signal, redirect: 'follow' })
    if (!res.ok) throw new Error('server replied ' + res.status)
    const j = await res.json()
    if (j && j.version) return j
    throw new Error('no version in response')
  } catch (e) {
    // Fallback to GitHub API (works when primary redirect/CORS fails)
    if (signal && signal.aborted) throw e
    console.warn('primary update fetch failed, trying API fallback', e.message)
    const api = await fetch('https://api.github.com/repos/noahotim/pdf-direct-editor/releases/latest', { cache: 'no-store', signal, headers: { Accept: 'application/vnd.github.v3+json' } })
    if (!api.ok) throw e
    const rel = await api.json()
    const tag = (rel.tag_name || '').replace(/^v/, '')
    // Try to fetch version.json asset content via raw asset URL if available
    const asset = (rel.assets || []).find(a => a.name === 'version.json')
    if (asset && asset.browser_download_url) {
      const r2 = await fetch(asset.browser_download_url + '?t=' + Date.now(), { cache: 'no-store', signal, redirect: 'follow' })
      if (r2.ok) {
        const j2 = await r2.json()
        if (j2 && j2.version) return j2
      }
    }
    // Last resort: synthesize from tag
    if (tag) return { version: tag, url: rel.html_url, notes: rel.body ? rel.body.slice(0, 200) : '' }
    throw e
  }
}

function showBanner(info) {
  if (document.getElementById('updateBanner')) return
  const bar = document.createElement('div')
  bar.id = 'updateBanner'
  bar.innerHTML = `<span>🎉 <b>Update available: v${info.version}</b> (you have v${APP_VERSION})${info.notes ? ` — ${info.notes}` : ''}</span>
    <button id="updNow" class="btn btn-small" style="width:auto;background:#16a34a;border-color:#16a34a;color:#fff;">⬇️ Download Update</button>
    <button id="updLater" class="btn btn-small" style="width:auto;">Later</button>`
  const nav = document.getElementById('menubar')
  nav.after(bar)
  document.getElementById('updNow').onclick = () => {
    if (info.url) window.open(info.url, '_blank')
    status('Downloading update — run the Setup file when it finishes to upgrade')
  }
  document.getElementById('updLater').onclick = () => {
    bar.remove()
    try { localStorage.setItem('pde-update-dismissed', info.version) } catch { /* ignore */ }
  }
}

export async function checkForUpdates(manual = false) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
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
      const body = showInfo('Update Available', `<div style="font-size:12px;line-height:1.8;">A new version is ready:<br/><b>v${info.version}</b> (installed: v${APP_VERSION})<br/>${info.notes || ''}</div>`)
      const ok = document.getElementById('actionOk')
      ok.textContent = 'Download'
      ok.onclick = () => { document.getElementById('actionModal').classList.add('hidden'); if (info.url) window.open(info.url, '_blank') }
    }
  })
  drop.appendChild(b)
  const v = document.createElement('div')
  v.style.cssText = 'font-size:11px;color:#94a3b8;padding:4px 10px;'
  v.textContent = `Installed version: v${APP_VERSION}`
  drop.appendChild(v)
})()

reg('upd-check', () => checkForUpdates(true))

