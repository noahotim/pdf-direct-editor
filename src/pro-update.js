// pro-update: update channel â€” prompts users to update whenever you publish a new version.
// How it works: on launch the app fetches version.json from your update server
// (default: https://parj.africa/downloads/pdf-editor/version.json). If the
// server version is newer than APP_VERSION below, a banner prompts the user to
// download + install. Works in the installed desktop app, PWA and browser.
import { status, reg, openDialog } from './pro-core.js'

export const APP_VERSION = '1.1.0'
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
  const url = `${UPDATE_JSON_URL}?t=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store', signal })
  if (!res.ok) throw new Error('server replied ' + res.status)
  return res.json()
}

function showBanner(info) {
  if (document.getElementById('updateBanner')) return
  const bar = document.createElement('div')
  bar.id = 'updateBanner'
  bar.innerHTML = `<span>ðŸŽ‰ <b>Update available: v${info.version}</b> (you have v${APP_VERSION})${info.notes ? ` â€” ${info.notes}` : ''}</span>
    <button id="updNow" class="btn btn-small" style="width:auto;background:#16a34a;border-color:#16a34a;color:#fff;">â¬‡ï¸ Download Update</button>
    <button id="updLater" class="btn btn-small" style="width:auto;">Later</button>`
  const nav = document.getElementById('menubar')
  nav.after(bar)
  document.getElementById('updNow').onclick = () => {
    if (info.url) window.open(info.url, '_blank')
    status('Downloading update â€” run the Setup file when it finishes to upgrade')
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
      if (manual) status('Update server gave no version')
      return null
    }
    remoteInfo = info
    if (cmp(info.version, APP_VERSION) > 0) {
      let dismissed = null
      try { dismissed = localStorage.getItem('pde-update-dismissed') } catch { /* ignore */ }
      if (dismissed !== info.version || manual) showBanner(info)
      if (!manual) status(`Update available: v${info.version} â€” see the banner on top`)
      return info
    }
    try { localStorage.removeItem('pde-update-dismissed') } catch { /* ignore */ }
    if (manual) status(`You are on the latest version (v${APP_VERSION})`)
    return null
  } catch (err) {
    clearTimeout(timer)
    if (manual) status('Update check failed (offline or server unreachable): ' + err.message)
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
  b.textContent = 'ðŸ”„ Check for Updatesâ€¦'
  b.addEventListener('click', async () => {
    document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'))
    status('Checking for updatesâ€¦')
    const info = await checkForUpdates(true)
    if (info) {
      const r = await openDialog('Update Available', [], 'Download')
      document.getElementById('actionBody').innerHTML =
        `<div style="font-size:12px;line-height:1.8;">A new version is ready:<br/><b>v${info.version}</b> (installed: v${APP_VERSION})<br/>${info.notes || ''}<br/>Press Download, then run the Setup file to upgrade. Your files are untouched.</div>`
      if (r && info.url) window.open(info.url, '_blank')
    }
  })
  drop.appendChild(b)
  const v = document.createElement('div')
  v.style.cssText = 'font-size:11px;color:#94a3b8;padding:4px 10px;'
  v.textContent = `Installed version: v${APP_VERSION}`
  drop.appendChild(v)
})()

reg('upd-check', () => checkForUpdates(true))

