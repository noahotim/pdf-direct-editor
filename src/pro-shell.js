// pro-shell: menubar, sidebar tabs, statusbar, theme, shortcuts, properties, recent/IDB/recovery, file ops
import { E, status, Actions, reg, openDialog, showInfo, downloadBytes, pickFiles, idbPut, idbGet, idbDel, idbAll } from './pro-core.js'

const $ = (s) => document.querySelector(s)

// ---- menubar ----
document.querySelectorAll('#menubar .menu').forEach((menu) => {
  const btn = menu.querySelector('.menu-btn')
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const was = menu.classList.contains('open')
    document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'))
    if (!was) menu.classList.add('open')
  })
})
document.addEventListener('click', () => document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open')))
document.querySelectorAll('#menubar [data-act]').forEach((b) => {
  b.title = b.textContent.trim()
  b.addEventListener('click', () => {
    document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'))
    const fn = Actions[b.dataset.act]
    if (fn) fn(); else status(`Coming online: ${b.dataset.act}`)
  })
})

// ---- sidebar tabs (generic â€” handles tools/pages/marks/search/intel/convert/feedback and any future tabs) ----
function initTabs() {
  const tabs = document.querySelectorAll('.side-tab')
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'))
      t.classList.add('active')
      document.querySelectorAll('[id^="tab-"]').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + t.dataset.tab))
      if (t.dataset.tab === 'pages' && Actions['pages-refresh']) Actions['pages-refresh']()
      if (t.dataset.tab === 'marks' && Actions['bm-load']) Actions['bm-load']()
    })
  })
}
initTabs()
// re-init when new tabs are injected (Convert, Feedback, Intel) â€” observe side-tabs
new MutationObserver(() => {
  document.querySelectorAll('.side-tab').forEach((t) => {
    if (t._botimWired) return
    t._botimWired = true
    t.addEventListener('click', () => {
      document.querySelectorAll('.side-tab').forEach((x) => x.classList.remove('active'))
      t.classList.add('active')
      document.querySelectorAll('[id^="tab-"]').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + t.dataset.tab))
      if (t.dataset.tab === 'pages' && Actions['pages-refresh']) Actions['pages-refresh']()
      if (t.dataset.tab === 'marks' && Actions['bm-load']) Actions['bm-load']()
    })
  })
}).observe(document.querySelector('.side-tabs'), { childList: true })
export function showTab(name) { document.querySelector(`.side-tab[data-tab="${name}"]`)?.click() }

// ---- theme ----
if (localStorage.getItem('pde-theme') === 'light') document.body.classList.add('light')
function toggleTheme() {
  document.body.classList.toggle('light')
  localStorage.setItem('pde-theme', document.body.classList.contains('light') ? 'light' : 'dark')
  status(document.body.classList.contains('light') ? 'Light theme' : 'Dark theme')
}

// ---- statusbar ----
setInterval(() => {
  try {
    const e = E()
    $('#sbFile').textContent = window.__docName || 'No document'
    $('#sbPage').textContent = e.totalPages ? `Page ${e.visiblePageIndex() + 1} / ${e.totalPages}` : 'â€”'
    $('#sbZoom').textContent = Math.round(e.currentZoom * 100) + '%'
    const n = e.edits.length
    $('#sbCount').textContent = `${e.totalPages} pg â€¢ ${n} edit${n === 1 ? '' : 's'}${e.pagesToDelete.size ? ` â€¢ ${e.pagesToDelete.size} del` : ''}`
  } catch { /* core not ready */ }
}, 1200)

// ---- doc name tracking + recent docs (IDB with bytes) + autosave ----
async function recordRecent(file, bytes) {
  try {
    window.__docName = file.name
    $('#sbFile').textContent = file.name
    const all = await idbAll()
    const recents = all.filter((r) => r.id.startsWith('recent-')).sort((a, b) => b.mtime - a.mtime)
    for (const r of recents.slice(7)) await idbDel(r.id)
    await idbPut({ id: 'recent-' + Date.now(), name: file.name, size: file.size || bytes.length, mtime: Date.now(), bytes })
    await idbPut({ id: 'autosave', name: file.name, mtime: Date.now(), bytes, edits: [] })
  } catch (err) { console.warn('recent store failed', err) }
}
async function snapshotAutosave() {
  try {
    const e = E()
    if (!e.originalBytes || !window.__docName) return
    await idbPut({ id: 'autosave', name: window.__docName, mtime: Date.now(), bytes: e.originalBytes, edits: JSON.parse(JSON.stringify(e.edits)) })
  } catch { /* quota or size â€” skip */ }
}
setInterval(() => { const e = window.PDFE; if (e && e.edits.length) snapshotAutosave() }, 60000)
window.addEventListener('load', async () => {
  try {
    const auto = await idbGet('autosave')
    if (auto && auto.bytes && auto.bytes.length) {
      const bar = document.getElementById('recoverBar')
      bar.classList.remove('hidden')
      document.getElementById('recoverYes').onclick = async () => {
        bar.classList.add('hidden')
        const e = E()
        window.__docName = auto.name || 'recovered.pdf'
        await e.reloadFromBytes(new Uint8Array(auto.bytes))
        if (auto.edits && auto.edits.length) { e.edits = auto.edits; e.refreshOverlays() }
        status(`Recovered ${window.__docName}`)
      }
      document.getElementById('recoverNo').onclick = async () => { bar.classList.add('hidden'); await idbDel('autosave') }
    }
  } catch { /* no IDB */ }
})

// ---- properties panel (right) ----
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function refreshProps() {
  const panel = document.getElementById('propsPanel')
  const box = document.getElementById('propsContent')
  const e = E()
  const ed = e.selectedEl ? e.getEditForEl(e.selectedEl) : null
  panel.classList.remove('hidden')
  if (!ed) {
    box.innerHTML = `<small style="color:#94a3b8">Click any object on the page to edit its properties here.</small>
      <div class="props-row"><label>Document</label><span>${esc(window.__docName || 'â€”')}</span></div>
      <div class="props-row"><label>Pages</label><span>${e.totalPages}</span></div>
      <div class="props-row"><label>Edits</label><span>${e.edits.length}</span></div>
      <button id="propsMeta" class="btn btn-small">Ã°Å¸ÂÂ·Ã¯Â¸Â Document Metadataâ€¦</button>`
    document.getElementById('propsMeta').onclick = () => { const fn = Actions['metadata']; if (fn) fn() }
    return
  }
  const num = (k, v, step = 1) => `<div class="props-row"><label>${k}</label><input data-k="${k}" type="number" step="${step}" value="${Math.round((v ?? 0) * 10) / 10}" /></div>`
  let h = `<div class="props-row"><label>Type</label><b>${esc(ed.type)}${ed.shape ? ' / ' + esc(ed.shape) : ''}${ed.field ? ' / ' + esc(ed.field) : ''}</b></div>`
  h += `<div class="props-row"><label>Page</label><span>${ed.pageIndex + 1}</span></div>`
  if (ed.x !== undefined) h += num('x', ed.x) + num('y', ed.y)
  if (ed.w !== undefined) h += num('w', ed.w) + (ed.h !== undefined ? num('h', ed.h) : '')
  if (ed.type === 'text' || ed.type === 'callout') {
    h += num('fontSize', ed.fontSize || 14)
    h += `<div class="props-row"><label>Color</label><input data-k="color" type="color" value="${esc(ed.color || '#000000')}" /></div>`
    h += `<div class="props-row"><label>Font</label><select data-k="fontFamily"><option${ed.fontFamily === 'Helvetica' ? ' selected' : ''}>Helvetica</option><option${ed.fontFamily === 'Times' ? ' selected' : ''}>Times</option><option${ed.fontFamily === 'Courier' ? ' selected' : ''}>Courier</option></select></div>`
    h += `<div class="props-row"><label>Bold</label><input data-k="bold" type="checkbox" ${ed.bold ? 'checked' : ''} /></div>`
    h += `<div class="props-row"><label>Italic</label><input data-k="italic" type="checkbox" ${ed.italic ? 'checked' : ''} /></div>`
    h += `<div class="props-row"><label>Underline</label><input data-k="underline" type="checkbox" ${ed.underline ? 'checked' : ''} /></div>`
  }
  if (ed.type === 'image' || ed.type === 'text' || ed.type === 'shape') {
    h += num('rotation', ed.rotation || 0)
    h += `<div class="props-row"><label>Opacity</label><input data-k="opacity" type="number" min="0" max="1" step="0.1" value="${ed.opacity === undefined ? 1 : ed.opacity}" /></div>`
  }
  if (ed.type === 'shape' || ed.type === 'arrow' || ed.type === 'uann' || ed.type === 'sann' || ed.type === 'line') {
    h += `<div class="props-row"><label>Line color</label><input data-k="linecolor" type="color" value="${esc(ed.color || ed.borderColor || '#000000')}" /></div>`
    h += num('width', ed.width || ed.borderWidth || 2, 0.5)
  }
  if (ed.type === 'shape' && ed.shape !== 'ellipse') {
    h += `<div class="props-row"><label>Fill</label><input data-k="fill" type="color" value="${esc(ed.fill || '#ffffff')}" /></div>`
    h += `<div class="props-row"><label>Fill on</label><input data-k="fillon" type="checkbox" ${ed.fill ? 'checked' : ''} /></div>`
  }
  if (ed.type === 'note' || ed.type === 'callout' || ed.type === 'stamp' || ed.type === 'headerFooter') {
    h += `<div class="props-row"><label>Text</label><input data-k="text" type="text" value="${esc(ed.text || '')}" style="width:150px" /></div>`
  }
  if (ed.type === 'image') {
    h += `<div class="props-row"><label>Locked</label><input data-k="locked" type="checkbox" ${ed.locked ? 'checked' : ''} /></div>`
  }
  h += `<div style="display:flex;gap:4px;margin-top:6px;"><button id="propsApply" class="btn btn-small btn-primary" style="flex:1">Apply</button><button id="propsFwd" class="btn btn-small" style="flex:1" title="Bring forward">Ã¢â€“Â²</button><button id="propsBwd" class="btn btn-small" style="flex:1" title="Send backward">Ã¢â€“Â¼</button><button id="propsDel" class="btn btn-small btn-danger" style="flex:1">Del</button></div>`
  box.innerHTML = h
  const get = (k) => box.querySelector(`[data-k="${k}"]`)
  document.getElementById('propsApply').onclick = () => {
    E().pushUndo()
    const gv = (k) => get(k) ? get(k).value : undefined
    const gn = (k) => get(k) ? parseFloat(get(k).value) : undefined
    const gc = (k) => get(k) ? get(k).checked : undefined
    if (get('x')) { ed.x = gn('x'); ed.y = gn('y') }
    if (get('w')) { ed.w = Math.max(4, gn('w')); if (get('h')) ed.h = Math.max(4, gn('h')) }
    if (ed.type === 'text' || ed.type === 'callout') {
      if (get('fontSize')) ed.fontSize = Math.max(4, gn('fontSize'))
      if (get('color')) ed.color = gv('color')
      if (get('fontFamily')) ed.fontFamily = gv('fontFamily')
      if (get('bold')) ed.bold = gc('bold')
      if (get('italic')) ed.italic = gc('italic')
      if (get('underline')) ed.underline = gc('underline')
    }
    if (get('rotation')) ed.rotation = ((gn('rotation') % 360) + 360) % 360
    if (get('opacity')) ed.opacity = Math.max(0, Math.min(1, parseFloat(gv('opacity'))))
    if (get('linecolor')) { const c = gv('linecolor'); if (ed.type === 'shape') ed.borderColor = c; else ed.color = c }
    if (get('width')) { if (ed.type === 'shape') ed.borderWidth = Math.max(0.5, gn('width')); else ed.width = Math.max(0.5, gn('width')) }
    if (get('fillon')) { ed.fill = gc('fillon') ? gv('fill') : null }
    if (get('text')) ed.text = gv('text')
    if (get('locked')) ed.locked = gc('locked')
    E().refreshOverlays()
    syncVisual(ed)
    status('Properties applied')
  }
  document.getElementById('propsDel').onclick = () => { E().removeSelected(); box.innerHTML = 'Deleted.' }
  document.getElementById('propsFwd').onclick = () => zMove(ed, 1)
  document.getElementById('propsBwd').onclick = () => zMove(ed, -1)
}
function syncVisual(ed) {
  const e = E()
  if (!e.selectedEl || e.selectedEl.dataset.id != ed.id) return
  const el = e.selectedEl
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  if (ed.w !== undefined) el.style.width = ed.w + 'px'
  if (ed.h !== undefined && !el.classList.contains('editable-text')) el.style.height = ed.h + 'px'
  if (ed.rotation !== undefined && (ed.type === 'image' || ed.type === 'text' || ed.type === 'shape')) el.style.transform = ed.rotation ? `rotate(${ed.rotation}deg)` : ''
  if (ed.opacity !== undefined) el.style.opacity = ed.opacity
}
function zMove(ed, dir) {
  const e = E()
  e.pushUndo()
  const i = e.edits.indexOf(ed)
  const j = i + dir
  if (i < 0 || j < 0 || j >= e.edits.length) return status('Already at ' + (dir > 0 ? 'front' : 'back'))
  ;[e.edits[i], e.edits[j]] = [e.edits[j], e.edits[i]]
  e.refreshOverlays()
  status(dir > 0 ? 'Brought forward' : 'Sent backward')
}
// refresh props whenever selection may have changed (capture clicks in viewer)
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('#pdfContainer')) setTimeout(refreshProps, 60)
}, true)

// ---- clipboard: copy / paste / duplicate ----
let clipboard = null
function copySel() {
  const e = E()
  const ed = e.selectedEl ? e.getEditForEl(e.selectedEl) : null
  if (!ed) return status('Nothing selected to copy')
  clipboard = JSON.parse(JSON.stringify(ed))
  status(`Copied ${ed.type} (page ${ed.pageIndex + 1})`)
}
function pasteClip() {
  const e = E()
  if (!clipboard) return status('Clipboard empty â€” copy something first')
  e.pushUndo()
  const c = JSON.parse(JSON.stringify(clipboard))
  c.id = Date.now() + Math.random()
  c.x = (c.x || 40) + 24; c.y = (c.y || 40) + 24
  e.edits.push(c)
  e.refreshOverlays()
  status(`Pasted ${c.type} on page ${c.pageIndex + 1}`)
}

// ---- file ops ----
async function newBlank() {
  const r = await openDialog('New Blank PDF', [
    { key: 'pages', label: 'Pages', type: 'number', value: 1, min: 1, max: 200 },
    { key: 'size', label: 'Page size', type: 'select', value: 'A4', options: ['A4', 'Letter', 'Legal'] }
  ], 'Create')
  if (!r) return
  const e = E()
  const sizes = { A4: [595, 842], Letter: [612, 792], Legal: [612, 1008] }
  const { PDFDocument } = e.libs
  const d = await PDFDocument.create()
  const [w, h] = sizes[r.size] || sizes.A4
  for (let i = 0; i < Math.min(200, Math.max(1, r.pages | 0)); i++) d.addPage([w, h])
  d.setTitle('Untitled'); d.setAuthor('Otim Noah'); d.setProducer('BOTIM DOCSHUB by Otim Noah')
  window.__docName = 'untitled.pdf'
  await e.reloadFromBytes(await d.save())
  recordRecent({ name: 'untitled.pdf', size: 0 }, e.originalBytes)
  status(`New ${r.size} document (${r.pages} page${r.pages > 1 ? 's' : ''})`)
}
async function closeDoc() {
  const e = E()
  if (e.edits.length) {
    const r = await openDialog('Close Document', [{ key: 'ok', label: 'Discard unsaved edits and close?', type: 'check', value: false }], 'Close')
    if (!r || !r.ok) return
  }
  e.edits = []; e.pdfLibDoc = null; e.pdfDocProxy = null; e.originalBytes = null; e.totalPages = 0
  e.pdfContainer.innerHTML = ''
  document.getElementById('dropZone').style.display = ''
  e.saveBtn.disabled = true
  e.renderPageList(); window.__docName = null
  status('Document closed')
}
async function saveAs() {
  const r = await openDialog('Save As', [{ key: 'name', label: 'File name (.pdf)', value: (window.__docName || 'edited').replace(/\.pdf$/i, '') + '-edited.pdf' }], 'Save')
  if (!r || !r.name) return
  let n = r.name.trim(); if (!/\.pdf$/i.test(n)) n += '.pdf'
  window.__saveAsName = n
  E().saveBtn.click()
}
async function showRecent() {
  const all = (await idbAll()).filter((r) => r.id.startsWith('recent-')).sort((a, b) => b.mtime - a.mtime)
  if (!all.length) return status('No recent documents yet')
  const r = await openDialog('Recent Documents', [{ key: 'pick', label: `Pick (${all.length})`, type: 'select', value: all[0].id, options: all.map((x) => ({ value: x.id, label: `${x.name} â€” ${(x.size / 1024).toFixed(0)} KB â€” ${new Date(x.mtime).toLocaleString()}` })) }], 'Open')
  if (!r) return
  const rec = await idbGet(r.pick)
  if (!rec || !rec.bytes) return status('Recent file data missing')
  window.__docName = rec.name
  await E().reloadFromBytes(new Uint8Array(rec.bytes))
  status(`Reopened ${rec.name}`)
}

// ---- help ----
function showShortcuts() {
  showInfo('Keyboard Shortcuts', `<div style="font-size:12px;line-height:1.9;">
    <b>Ctrl+S</b> Save &bull; <b>Ctrl+F</b> Find &bull; <b>Ctrl+P</b> Print &bull; <b>Ctrl+Z</b> Undo &bull; <b>Ctrl+Y</b> Redo<br/>
    <b>Ctrl+C / V / D</b> Copy / Paste / Duplicate &bull; <b>Del</b> Delete selected &bull; <b>Arrows</b> Nudge selected<br/>
    Press <b>Esc</b> to close dialogs.</div>`)
}
function showAbout() {
  showInfo('About', `<div style="font-size:12px;line-height:1.8;">
    <b>BOTIM DOCSHUB v1.3.1</b><br/>Developed by <b>Otim Noah</b><br/>
    Direct PDF editing &mdash; text, images, annotations, signatures, forms, pages, cover merge &mdash; saved as PDF without Word conversion.<br/>
    Rendering: pdf.js &bull; Writing: pdf-lib &bull; OCR: Tesseract.js (online) &bull; Runs 100% locally otherwise.</div>`)
}

// ---- register file/edit/view actions (pages/tools/document actions live in their modules) ----
reg('open', () => E().fileInput.click())
reg('new', newBlank)
reg('close', closeDoc)
reg('save', () => E().saveBtn.click())
reg('saveas', saveAs)
reg('download', () => E().saveBtn.click())
reg('recent', showRecent)
reg('undo', () => E().undo())
reg('redo', () => E().redo())
reg('copy', copySel)
reg('paste', pasteClip)
reg('duplicate', () => { copySel(); pasteClip() })
reg('delsel', () => { if (!E().removeSelected()) status('Nothing selected') })
reg('find', () => document.getElementById('findModal').classList.remove('hidden'))
reg('theme', toggleTheme)
reg('shortcuts', showShortcuts)
reg('about', showAbout)
reg('pages-tab', () => showTab('pages'))
reg('gotopage', () => { const fn = Actions['goto-page']; if (fn) fn() })

// ---- global shortcuts (Ctrl+Z/Y/F already handled in main.js â€” do NOT duplicate) ----
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase()
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable
  if (e.key === 'Escape') { document.querySelectorAll('.modal:not(.hidden)').forEach((m) => m.classList.add('hidden')); return }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
    const k = e.key.toLowerCase()
    if (k === 's') { e.preventDefault(); E().saveBtn.click() }
    else if (k === 'p') { e.preventDefault(); const fn = Actions['print']; if (fn) fn() }
    else if (!typing && k === 'c') { e.preventDefault(); copySel() }
    else if (!typing && k === 'v') { e.preventDefault(); pasteClip() }
    else if (!typing && k === 'd') { e.preventDefault(); copySel(); pasteClip() }
  } else if (!typing) {
    if (e.key === 'Delete' || e.key === 'Backspace') { if (E().removeSelected()) { e.preventDefault(); status('Deleted selection') } }
    else if (e.key.startsWith('Arrow') && E().selectedEl) {
      const ed = E().getEditForEl(E().selectedEl)
      if (ed && ed.x !== undefined) {
        e.preventDefault()
        const s = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') ed.x = Math.max(0, ed.x - s)
        if (e.key === 'ArrowRight') ed.x += s
        if (e.key === 'ArrowUp') ed.y = Math.max(0, ed.y - s)
        if (e.key === 'ArrowDown') ed.y += s
        E().selectedEl.style.left = ed.x + 'px'; E().selectedEl.style.top = ed.y + 'px'
      }
    }
  }
})

// track opened file names + record recent (main.js loads via same input)
E().fileInput.addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return
  try { recordRecent(f, new Uint8Array(await f.arrayBuffer())) } catch { window.__docName = f.name }
})
// hook drag-drop too (main.js handles the load; we record)
E().viewer.addEventListener('drop', async (ev) => {
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0]
  if (f && /pdf$/i.test(f.type || f.name)) {
    try { recordRecent(f, new Uint8Array(await f.arrayBuffer())) } catch { window.__docName = f.name }
  }
}, true)

// lock support: prevent dragging locked objects (wrap selectEl? patch makeDraggable via blocker)
document.addEventListener('mousedown', (e) => {
  const t = e.target.closest && e.target.closest('.editable-text,.editable-image,.table-wrap')
  if (!t || !t.dataset.id) return
  try {
    const ed = E().getEditForEl(t)
    if (ed && ed.locked && !e.target.classList.contains('del-x')) { e.stopPropagation(); e.preventDefault(); status('Object is locked (unlock in Properties)') }
  } catch { /* ignore */ }
}, true)

export { refreshProps }

