// pro-feedback: local Feedback tab + GitHub Issues bridge (free, no paid service)
import { status, reg } from './pro-core.js'

const KEY = 'botim-feedback-v1'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-100))) } catch {}
}

function setupFeedbackTab() {
  const tab = document.getElementById('tab-feedback')
  if (!tab) return
  tab.innerHTML = `
    <h3>Feedback</h3>
    <div class="tool-group" style="border-color:#38bdf8;">
      <h4>💬 Send Feedback</h4>
      <small style="color:#94a3b8;">Your message is saved locally and you can also open a GitHub Issue (free, public).</small>
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
      <button id="fbSend" class="btn btn-small" style="background:#2563eb;color:#fff;">Send Feedback</button>
      <button id="fbIssue" class="btn btn-small">Open GitHub Issue…</button>
      <small style="color:#94a3b8;font-size:10px;">Local copy kept on this device. GitHub Issue is public and free.</small>
    </div>
    <div class="tool-group">
      <h4>📋 Your past feedback (this device)</h4>
      <div id="fbList" class="form-list">No feedback yet</div>
    </div>
  `
  const list = () => {
    const box = document.getElementById('fbList')
    const items = load()
    if (!items.length) { box.textContent = 'No feedback yet'; return }
    box.innerHTML = ''
    items.slice(-10).reverse().forEach((it, idx) => {
      const d = document.createElement('div')
      d.className = 'form-item'
      d.innerHTML = `<b>${it.stars} — ${it.name || 'Anonymous'}</b> <small>${new Date(it.at).toLocaleString()}</small><br/><small>${it.msg.slice(0, 120)}</small>`
      const del = document.createElement('button')
      del.className = 'btn btn-small btn-danger'; del.textContent = 'Delete'; del.style.width = 'auto'
      del.onclick = () => { const all = load(); all.splice(all.length - 1 - idx, 1); save(all); list() }
      d.appendChild(del)
      box.appendChild(d)
    })
  }
  document.getElementById('fbSend').onclick = () => {
    const name = document.getElementById('fbName').value.trim()
    const email = document.getElementById('fbEmail').value.trim()
    const rate = document.getElementById('fbRate').value
    const msg = document.getElementById('fbMsg').value.trim()
    if (!msg) return status('Please write a message')
    const stars = '★'.repeat(+rate) + '☆'.repeat(5 - +rate)
    const rec = { name, email, rate: +rate, stars, msg, at: Date.now() }
    const all = load(); all.push(rec); save(all)
    document.getElementById('fbMsg').value = ''
    list()
    status('Thanks! Feedback saved locally ✓ — also consider opening a GitHub Issue so the dev sees it')
  }
  document.getElementById('fbIssue').onclick = () => {
    const name = document.getElementById('fbName').value.trim() || 'Anonymous'
    const msg = document.getElementById('fbMsg').value.trim() || '(no message)'
    const stars = document.getElementById('fbRate').value
    const body = encodeURIComponent(`**From:** ${name}\n**Rating:** ${stars}/5\n\n**Message:**\n${msg}\n\n— sent from BOTIM DOCSHUB v${window.APP_VERSION || '1.3.0'}`)
    const title = encodeURIComponent(`Feedback: ${msg.slice(0, 50)}`)
    window.open(`https://github.com/noahotim/pdf-direct-editor/issues/new?title=${title}&body=${body}`, '_blank')
  }
  list()
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
