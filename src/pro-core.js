// pro-core: shared bridge + dialogs + task panel + storage + download helpers
export function E() {
  if (!window.PDFE) throw new Error('Core not ready — open the app first (main.js failed to load?)')
  return window.PDFE
}
export const status = (t) => E().status(t)
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
export function downloadBytes(bytes, name) {
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name)
}
export function pickFiles(accept = '.pdf', multiple = false) {
  return new Promise((resolve) => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple
    inp.onchange = () => resolve([...(inp.files || [])])
    inp.click()
  })
}
// Generic modal dialog. fields: [{key,label,type:'text'|'number'|'select'|'check'|'textarea',value,options,min,max,placeholder,hint}]
export function openDialog(title, fields = [], okText = 'OK') {
  return new Promise((resolve) => {
    const m = document.getElementById('actionModal')
    document.getElementById('actionTitle').textContent = title
    const body = document.getElementById('actionBody')
    body.innerHTML = ''
    const inputs = {}
    for (const f of fields) {
      const wrap = document.createElement('label')
      wrap.style.cssText = 'font-size:12px;display:flex;flex-direction:column;gap:4px;'
      wrap.innerHTML = `<span>${f.label||f.key}</span>`
      let el
      if (f.type === 'select') {
        el = document.createElement('select')
        ;(f.options || []).forEach(o => {
          const op = document.createElement('option')
          op.value = Array.isArray(f.options) ? o : o.value; op.textContent = Array.isArray(f.options) ? o : (o.label || o.value)
          el.appendChild(op)
        })
        el.value = f.value ?? ''
      } else if (f.type === 'check') {
        el = document.createElement('input'); el.type = 'checkbox'; el.checked = !!f.value
        wrap.style.flexDirection = 'row'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px'
        wrap.prepend(el)
        const sp = document.createElement('span'); sp.textContent = f.label || f.key
        wrap.innerHTML = ''; wrap.append(el, sp)
      } else if (f.type === 'textarea') {
        el = document.createElement('textarea'); el.rows = f.rows || 4; el.value = f.value ?? ''
      } else {
        el = document.createElement('input'); el.type = f.type || 'text'
        if (f.value !== undefined) el.value = f.value
        if (f.min !== undefined) el.min = f.min
        if (f.max !== undefined) el.max = f.max
        if (f.placeholder) el.placeholder = f.placeholder
      }
      el.style.cssText = 'padding:7px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;'
      if (f.type !== 'check') wrap.appendChild(el)
      if (f.hint) { const h = document.createElement('small'); h.style.color = '#94a3b8'; h.textContent = f.hint; wrap.appendChild(h) }
      body.appendChild(wrap)
      inputs[f.key] = el
    }
    const ok = document.getElementById('actionOk'), cancel = document.getElementById('actionCancel')
    ok.textContent = okText
    let done = false
    const cleanup = (val) => { if (done) return; done = true; m.classList.add('hidden'); ok.onclick = null; cancel.onclick = null; m.onclick = null; resolve(val) }
    ok.onclick = () => {
      const out = {}
      for (const f of fields) {
        const el = inputs[f.key]
        out[f.key] = f.type === 'check' ? el.checked : (f.type === 'number' ? parseFloat(el.value) : el.value)
      }
      cleanup(out)
    }
    cancel.onclick = () => cleanup(null)
    m.onclick = (e) => { if (e.target === m) cleanup(null) }
    m.classList.remove('hidden')
  })
}
// Global action registry: menus/sidebar dispatch here; feature modules register handlers
export const Actions = {}
export function reg(name, fn) { Actions[name] = fn }
export function act(name) { const fn = Actions[name]; if (fn) return fn(); status(`No handler for: ${name}`) }

// Non-blocking task panel with progress + log (batch jobs, OCR, compression)
export function taskBegin(title) {
  const p = document.getElementById('taskPanel')
  document.getElementById('taskTitle').textContent = title
  document.getElementById('taskLog').textContent = ''
  setBar(0); p.classList.remove('hidden')
  return {
    setBar, log: (t) => { const l = document.getElementById('taskLog'); l.textContent += (l.textContent ? '\n' : '') + t },
    done: (t) => { if (t) taskBegin.log ? null : null; const l = document.getElementById('taskLog'); if (t) l.textContent += (l.textContent ? '\n' : '') + t; setBar(100) }
  }
}
export function setBar(pct) { document.getElementById('taskBar').style.width = Math.max(0, Math.min(100, pct)) + '%' }
document.getElementById('taskClose')?.addEventListener('click', () => document.getElementById('taskPanel').classList.add('hidden'))

// ---- Minimal IndexedDB store (recent docs with bytes + session recovery) ----
const DB = 'pdf-direct-editor', STORE = 'docs'
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
export async function idbPut(rec) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }) }
export async function idbGet(id) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(id); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) }) }
export async function idbDel(id) { const db = await idb(); return new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = () => res() }) }
export async function idbAll() { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error) }) }

export function parseRange(str, max) {
  // "1-3,5" (1-based) → sorted unique 0-based indices
  const out = new Set()
  for (const part of String(str || '').split(',')) {
    const p = part.trim(); if (!p) continue
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) { const a = Math.max(1, +m[1]), b = Math.min(max, +m[2]); for (let i = a; i <= b; i++) out.add(i - 1) }
    else { const n = +p; if (n >= 1 && n <= max) out.add(n - 1) }
  }
  return [...out].sort((a, b) => a - b)
}
