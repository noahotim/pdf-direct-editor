// pro-update.js — Seamless one-click update system
// Detects new GitHub release → shows Install Update button → downloads only to private cache → silent install + restart
// Never puts files in the user's Downloads folder.


import { status, reg } from './pro-core.js'


export const APP_VERSION = '1.9.4'
export const UPDATE_JSON_URL = 'https://github.com/noahotim/pdf-direct-editor/releases/latest/download/version.json'
export const RELEASES_PAGE = 'https://github.com/noahotim/pdf-direct-editor/releases/latest'


function cmp(a, b) {
  const pa = String(a).split('.').map(x => parseInt(x) || 0)
  const pb = String(b).split('.').map(x => parseInt(x) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}


let remoteInfo = null


async function latestRelease(signal) {
  const res = await fetch('https://api.github.com/repos/noahotim/pdf-direct-editor/releases/latest', {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/vnd.github.v3+json' }
  })
  if (!res.ok) throw new Error('GitHub API ' + res.status)
  return res.json()
}


function exeFromRelease(rel) {
  const assets = (rel && rel.assets) || []
  const a = assets.find(x => /setup.*\.exe$/i.test(x.name)) || assets.find(x => /\.exe$/i.test(x.name))
  return a ? a.browser_download_url : ''
}


async function fetchRemote(signal) {
  const bust = Date.now()
  const tries = [
    `${UPDATE_JSON_URL}?t=${bust}`,
    `https://raw.githubusercontent.com/noahotim/pdf-direct-editor/main/deploy/version.json?t=${bust}`,
    `https://cdn.jsdelivr.net/gh/noahotim/pdf-direct-editor@main/deploy/version.json?t=${bust}`
  ]


  let lastErr = null
  for (const url of tries) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal, redirect: 'follow' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const j = await res.json()
      if (j && j.version) {
        if (!/\.exe/i.test(j.url || '')) j.url = await resolveExeUrl(j)
        return j
      }
    } catch (e) {
      if (signal?.aborted) throw e
      lastErr = e
    }
  }


  try {
    const rel = await latestRelease(signal)
    const tag = (rel.tag_name || '').replace(/^v/, '')
    const exe = exeFromRelease(rel)
    if (tag && exe) return { version: tag, url: exe, notes: (rel.body || '').slice(0, 180) }
  } catch (e) { lastErr = e }


  throw lastErr || new Error('All update sources failed')
}


async function resolveExeUrl(info) {
  if (info?.url && /\.exe(\?|$)/i.test(info.url)) return info.url
  try {
    const rel = await latestRelease(new AbortController().signal)
    const u = exeFromRelease(rel)
    if (u) return u
  } catch {}
  return info?.url || RELEASES_PAGE
}


const AUTO_KEY = 'botim-auto-update'
function isAutoUpdate() {
  try { return localStorage.getItem(AUTO_KEY) !== 'off' } catch { return true }
}


async function performUpdate(info) {
  if (!window.botimUpdater) return false


  const prog = document.getElementById('updProg')
  const btn = document.getElementById('updNow')


  if (prog) { prog.style.display = 'inline'; prog.textContent = 'Preparing…' }
  if (btn) { btn.disabled = true; btn.textContent = 'Installing…' }


  try {
    const exeUrl = await resolveExeUrl(info)
    if (!exeUrl || !/^https?:/i.test(exeUrl)) throw new Error('No valid installer URL')


    if (prog) prog.textContent = 'Downloading update…'
    const dl = await window.botimUpdater.download(exeUrl)
    if (!dl || dl.ok === false) throw new Error(dl?.error || 'Download failed')


    if (prog) prog.textContent = 'Installing — app will restart…'
    status('Installing update — the application will restart automatically')


    const res = await window.botimUpdater.install()
    if (res && res.ok === false) throw new Error(res.error)


    return true
  } catch (e) {
    if (prog) prog.textContent = 'Update failed: ' + e.message
    if (btn) {
      btn.disabled = false
      btn.textContent = '🔄 Retry Install'
    }
    status('Update failed: ' + e.message)
    return false
  }
}


function showBanner(info) {
  if (document.getElementById('updateBanner')) return


  const bar = document.createElement('div')
  bar.id = 'updateBanner'
  bar.innerHTML = `
    <span>🎉 <b>Update available: v${info.version}</b> (you have v${APP_VERSION})${info.notes ? ' — ' + info.notes : ''}</span>
    <span id="updProg" style="font-size:11px;color:#bbf7d0;display:none;margin-left:8px;"></span>
    <button id="updNow" class="btn btn-small" style="width:auto;background:#16a34a;border-color:#16a34a;color:#fff;margin-left:12px;">
      🔄 Install Update
    </button>
    <button id="updLater" class="btn btn-small" style="width:auto;margin-left:6px;">Later</button>
  `


  const nav = document.getElementById('menubar')
  if (nav) nav.after(bar)
  else document.body.prepend(bar)


  document.getElementById('updNow').onclick = () => performUpdate(info)
  document.getElementById('updLater').onclick = () => {
    bar.remove()
    try { localStorage.setItem('pde-update-dismissed', info.version) } catch {}
  }


  if (window.botimUpdater?.onStatus) {
    window.botimUpdater.onStatus(p => {
      const prog = document.getElementById('updProg')
      if (!prog) return
      if (p.type === 'progress') {
        prog.style.display = 'inline'
        prog.textContent = `Downloading… ${p.percent}%${p.total ? ` (${(p.downloaded/1048576).toFixed(1)}/${(p.total/1048576).toFixed(1)} MB)` : ''}`
      }
      if (p.type === 'downloaded') prog.textContent = 'Ready — installing…'
      if (p.type === 'error') prog.textContent = 'Error: ' + p.message
    })
  }
}


export async function checkForUpdates(manual = false) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 18000)


  try {
    const info = await fetchRemote(ctrl.signal)
    clearTimeout(timer)


    if (!info?.version) {
      if (manual) status('Could not get version information')
      return null
    }


    remoteInfo = info
    const result = cmp(info.version, APP_VERSION)


    if (result > 0) {
      let dismissed = null
      try { dismissed = localStorage.getItem('pde-update-dismissed') } catch {}
      if (dismissed !== info.version || manual) showBanner(info)


      if (!manual && window.botimUpdater && isAutoUpdate()) {
        status(`Auto-updating to v${info.version}…`)
        setTimeout(() => performUpdate(info), 1200)
      } else if (!manual) {
        status(`Update available: v${info.version}`)
      }
      return info
    }


    if (manual) {
      if (result < 0) status(`You are on a newer version (v${APP_VERSION})`)
      else status(`You are on the latest version (v${APP_VERSION}) ✓`)
    }
    return null
  } catch (err) {
    clearTimeout(timer)
    if (manual) status('Update check failed: ' + (err.name === 'AbortError' ? 'timeout' : err.message))
    return null
  }
}


window.addEventListener('load', () => setTimeout(() => checkForUpdates(false), 3500))


;(() => {
  const drop = document.querySelector('#menubar [data-menu="help"] .menu-drop')
  if (!drop || drop.querySelector('[data-act="upd-check"]')) return


  const b = document.createElement('button')
  b.dataset.act = 'upd-check'
  b.textContent = '🔄 Check for Updates…'
  b.addEventListener('click', async () => {
    document.querySelectorAll('#menubar .menu.open').forEach(m => m.classList.remove('open'))
    status('Checking for updates…')
    await checkForUpdates(true)
  })
  drop.appendChild(b)
})()


reg('upd-check', () => checkForUpdates(true))
