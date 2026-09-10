// pro-feedback: LIVE shared feedback via GitHub Issues (free, no paid service) + local draft
import { status, reg } from './pro-core.js'

const KEY = 'botim-feedback-v1'
const GH_ISSUES_API = 'https://api.github.com/repos/noahotim/pdf-direct-editor/issues?state=open&per_page=20'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-100))) } catch {}
}
async function fetchLive() {
  try {
    const r = await fetch(GH_ISSUES_API, { headers: { Accept: 'application/vnd.github.v3+json' }, cache: 'no-store' })
    if (!r.ok) throw new Error('GitHub ' + r.status)
    const j = await r.json()
    return Array.isArray(j) ? j : []
  } catch (e) { console.warn('live feedback fetch failed', e.message); return null }
}

function setupFeedbackTab() {
  const tab = document.getElementById('tab-feedback')
  if (!tab) return
  tab.innerHTML = `
    <h3>Feedback — Live (shared via GitHub)</h3>
    <div class="tool-group" style="border-color:#38bdf8;">
      <h4>💬 Send Feedback</h4>
      <small style="color:#94a3b8;">Saved to GitHub Issues — visible to all users (public, free). Also kept locally as draft.</small>
      <label style="font-size:12px;">Name <input id="fbName" placeholder="Your name" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;" /></label>
      <label style="font-size:12px;">Email (optional) <input id="fbEmail" placeholder="you@example.com" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;" /></label>
      <label style="font-size:12px;">Rating
        <select id="fbRate" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">
          <option value="5">★★★★★ Excellent</option>
          <option value="4">★★★★ Good</option>
          <option value="3">★★★ Okay</option>
          <option value="2">★★ Needs work</option>
          <option value="1">★ Poor</option>
        </select>
      </label>
      <label style="font-size:12px;">Message <textarea id="fbMsg" rows="4" placeholder="What did you like? What can improve?" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;"></textarea></label>
      <button id="fbSend" class="btn btn-small" style="background:#2563eb;color:#fff;">Send to GitHub (live)</button>
      <small style="color:#94a3b8;font-size:10px;">Opens GitHub — sign in if asked, then Submit. Your feedback becomes visible to everyone.</small>
    </div>
    <div class="tool-group">
      <h4>🌐 Live feedback (all users — GitHub Issues)</h4>
      <div id="fbLive" class="form-list">Loading live feedback…</div>
      <button id="fbRefreshLive" class="btn btn-small">↻ Refresh live</button>
    </div>
    <div class="tool-group">
      <h4>📋 Your drafts (this device only)</h4>
      <div id="fbList" class="form-list">No drafts yet</div>
    </div>
  `
  const renderLocal = () => {
    const box = document.getElementById('fbList')
    const items = load()
    if (!items.length) { box.textContent = 'No drafts yet'; return }
    box.innerHTML = ''
    items.slice(-10).reverse().forEach((it, idx) => {
      const d = document.createElement('div')
      d.className = 'form-item'
      d.innerHTML = `<b>${it.stars} — ${it.name || 'Anonymous'}</b> <small>${new Date(it.at).toLocaleString()}</small><br/><small>${it.msg.slice(0, 120)}</small>`
      const del = document.createElement('button')
      del.className = 'btn btn-small btn-danger'; del.textContent = 'Delete'; del.style.width = 'auto'
      del.onclick = () => { const all = load(); all.splice(all.length - 1 - idx, 1); save(all); renderLocal() }
      d.appendChild(del)
      box.appendChild(d)
    })
  }
  const renderLive = async () => {
    const box = document.getElementById('fbLive')
    box.textContent = 'Loading…'
    const issues = await fetchLive()
    if (issues === null) { box.textContent = 'Could not load live feedback (offline or GitHub rate-limit). Your local drafts are still below.'; return }
    if (!issues.length) { box.innerHTML = '<small>No public feedback yet — be the first!</small>'; return }
    box.innerHTML = ''
    issues.slice(0, 12).forEach((iss) => {
      const d = document.createElement('div')
      d.className = 'form-item'; d.style.cursor = 'pointer'
      d.innerHTML = `<b>#${iss.number} ${iss.title.slice(0, 60)}</b> <small>by ${iss.user?.login || '?'} • ${new Date(iss.created_at).toLocaleDateString()}</small><br/><small>${(iss.body || '').slice(0, 120).replace(/</g, '&lt;')}</small>`
      d.onclick = () => window.open(iss.html_url, '_blank')
      box.appendChild(d)
    })
  }
  document.getElementById('fbSend').onclick = () => {
    const name = document.getElementById('fbName').value.trim() || 'Anonymous'
    const msg = document.getElementById('fbMsg').value.trim()
    const stars = document.getElementById('fbRate').value
    if (!msg) return status('Please write a message')
    const all = load(); all.push({ name, stars: '★'.repeat(+stars) + '☆'.repeat(5 - +stars), msg, at: Date.now() }); save(all); renderLocal()
    const body = encodeURIComponent(`**From:** ${name}\n**Rating:** ${stars}/5\n\n**Message:**\n${msg}\n\n— sent from BOTIM DOCSHUB v${window.APP_VERSION || '1.3.1'}`)
    const title = encodeURIComponent(`Feedback: ${msg.slice(0, 50)}`)
    window.open(`https://github.com/noahotim/pdf-direct-editor/issues/new?title=${title}&body=${body}`, '_blank')
    status('Opening GitHub — please click Submit there to make it live for everyone ✓')
  }
  document.getElementById('fbRefreshLive').onclick = renderLive
  renderLocal(); renderLive()
}

;(() => {
  const tabs = document.querySelector('.side-tabs')
  if (tabs && !tabs.querySelector('[data-tab="feedback"]')) {
    const b = document.createElement('button')
    b.className = 'side-tab'; b.dataset.tab = 'feedback'; b.textContent = 'Feedback'
    tabs.appendChild(b)
    const p = document.createElement('div')
    p.id = 'tab-feedback'; p.className = 'hidden'
    document.getElementById('sidebar').appendChild(p)
    setupFeedbackTab()
  } else {
    setupFeedbackTab()
  }
  // Help menu entry
  const help = document.querySelector('#menubar [data-menu="help"]')
  if (help && !help.querySelector('[data-act="feedback"]')) {
    const drop = help.querySelector('.menu-drop')
    const b = document.createElement('button')
    b.dataset.act = 'feedback'; b.textContent = '💬 Feedback…'
    b.addEventListener('click', () => {
      document.querySelectorAll('#menubar .menu.open').forEach(m => m.classList.remove('open'))
      document.querySelector('.side-tab[data-tab="feedback"]')?.click()
    })
    drop.appendChild(b)
  }
})()

reg('feedback', () => document.querySelector('.side-tab[data-tab="feedback"]')?.click())
