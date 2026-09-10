// pro-annot: underline/strike/shapes/arrow/callout/stamp tools + comments panel + ProRenderEdit
import { E, status, reg } from './pro-core.js'

const TOOLS = [
  ['uann', '⬇ Underline'],
  ['sann', '➖ Strikeout'],
  ['shape-rect', '▭ Rectangle'],
  ['shape-ellipse', '⬯ Ellipse'],
  ['arrow', '➤ Arrow'],
  ['callout', '💬 Callout'],
  ['stamp', '✔ Stamp'],
]
// inject tool buttons into first tool group
;(() => {
  const g = document.querySelector('#tab-tools .tool-group')
  if (!g || document.querySelector('[data-tool="uann"]')) return
  TOOLS.forEach(([name, label]) => {
    const b = document.createElement('button')
    b.className = 'tool'; b.dataset.tool = name; b.title = label; b.textContent = label
    b.addEventListener('click', () => {
      document.querySelectorAll('.tool').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      E().tool = name
      if (E().setEraseCursor) E().setEraseCursor()
      document.querySelectorAll('.draw-canvas').forEach((c) => { c.style.cursor = 'crosshair' })
      status(label + ' — ' + (name === 'stamp' || name === 'callout' ? 'click on page' : 'press + drag on page'))
    })
    g.appendChild(b)
  })
  // comments panel
  const c = document.createElement('div')
  c.className = 'tool-group'
  c.innerHTML = `<h4>💬 Comments</h4><div id="commentList" class="form-list">No comments yet</div><button id="commentRefresh" class="btn btn-small">↻ Refresh</button>`
  document.getElementById('tab-tools').appendChild(c)
  document.getElementById('commentRefresh').onclick = renderComments
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#pdfContainer')) setTimeout(renderComments, 80)
  }, true)
})()

function col() { return document.getElementById('colorPicker')?.value || '#000000' }
function newEd(base) { return { id: Date.now() + Math.random(), ...base } }

// ---- creation ----
function createShapeEl(overlay, ed) {
  const el = document.createElement('div')
  el.className = 'editable-text shape-el'
  el.dataset.id = ed.id
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  el.style.width = ed.w + 'px'; el.style.height = ed.h + 'px'
  el.style.padding = '0'
  el.style.border = `${ed.borderWidth || 2}px solid ${ed.borderColor || '#000000'}`
  el.style.borderRadius = ed.shape === 'ellipse' ? '50%' : '2px'
  el.style.background = ed.fill ? ed.fill + '' : 'transparent'
  if (ed.fill) el.style.background = hexA(ed.fill, ed.fillOpacity === undefined ? 0.25 : ed.fillOpacity)
  el.style.opacity = ed.opacity === undefined ? 1 : ed.opacity
  if (ed.rotation) el.style.transform = `rotate(${ed.rotation}deg)`
  E().makeDraggable(el, ed, overlay)
  const rh = document.createElement('div'); rh.className = 'resize-handle'; rh.style.right = '-4px'; rh.style.bottom = '-4px'; el.appendChild(rh)
  E().makeResizable(el, ed, rh)
  el.addEventListener('click', (e) => { e.stopPropagation(); E().selectEl(el) })
  overlay.appendChild(el)
}
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
function createArrowEl(overlay, ed) {
  const el = document.createElement('div')
  el.className = 'editable-text arrow-el'
  el.dataset.id = ed.id
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  el.style.width = Math.max(ed.w, 8) + 'px'; el.style.height = Math.max(ed.h, 8) + 'px'
  el.style.padding = '0'; el.style.border = 'none'
  const c = ed.color || '#000000', w = ed.width || 2.5
  const W = Math.max(ed.w, 8), H = Math.max(ed.h, 8)
  el.innerHTML = `<svg width="${W}" height="${H}" style="overflow:visible;display:block">
    <line x1="2" y1="${H / 2}" x2="${W - 12}" y2="${H / 2}" stroke="${c}" stroke-width="${w}"/>
    <polygon points="${W - 12},${H / 2 - 6} ${W},${H / 2} ${W - 12},${H / 2 + 6}" fill="${c}"/></svg>`
  E().makeDraggable(el, ed, overlay)
  const rh = document.createElement('div'); rh.className = 'resize-handle'; rh.style.right = '-4px'; rh.style.bottom = '-4px'; el.appendChild(rh)
  E().makeResizable(el, ed, rh)
  el.addEventListener('click', (e) => { e.stopPropagation(); E().selectEl(el) })
  overlay.appendChild(el)
}
function createLineAnnEl(overlay, ed) {
  const el = document.createElement('div')
  el.className = 'editable-text'
  el.dataset.id = ed.id
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  el.style.width = ed.w + 'px'; el.style.height = Math.max(ed.h, 8) + 'px'
  el.style.padding = '0'; el.style.border = 'none'; el.style.background = 'transparent'
  const y = ed.type === 'uann' ? 'calc(100% - 2px)' : '50%'
  el.innerHTML = `<div style="position:absolute;left:0;right:0;top:${y};height:${ed.width || 1.5}px;background:${ed.color || '#000'};"></div>`
  E().makeDraggable(el, ed, overlay)
  const rh = document.createElement('div'); rh.className = 'resize-handle'; rh.style.right = '-4px'; rh.style.bottom = '-4px'; el.appendChild(rh)
  E().makeResizable(el, ed, rh)
  el.addEventListener('click', (e) => { e.stopPropagation(); E().selectEl(el) })
  overlay.appendChild(el)
}
function createStampEl(overlay, ed) {
  const el = document.createElement('div')
  el.className = 'editable-text'
  el.dataset.id = ed.id
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  el.style.width = ed.w + 'px'; el.style.height = ed.h + 'px'
  el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center'
  el.style.border = `2px solid ${ed.color || '#dc2626'}`; el.style.color = ed.color || '#dc2626'
  el.style.fontWeight = '800'; el.style.fontSize = '13px'; el.style.background = 'rgba(255,255,255,.65)'
  el.textContent = ed.text || 'APPROVED'
  E().makeDraggable(el, ed, overlay)
  const rh = document.createElement('div'); rh.className = 'resize-handle'; rh.style.right = '-4px'; rh.style.bottom = '-4px'; el.appendChild(rh)
  E().makeResizable(el, ed, rh)
  el.addEventListener('dblclick', async () => {
    const t = await E().showPrompt('Stamp', 'Stamp text:', ed.text)
    if (t !== null) { ed.text = t; el.textContent = t }
  })
  el.addEventListener('click', (e) => { e.stopPropagation(); E().selectEl(el) })
  overlay.appendChild(el)
}
function createCalloutEl(overlay, ed) {
  const el = document.createElement('div')
  el.className = 'editable-text'
  el.dataset.id = ed.id
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  el.style.width = ed.w + 'px'; el.style.minHeight = ed.h + 'px'
  el.style.background = '#fef9c3'; el.style.border = `1.5px solid ${ed.borderColor || '#f59e0b'}`
  el.style.fontSize = (ed.fontSize || 11) + 'px'; el.style.color = ed.color || '#000000'
  el.textContent = ed.text || ''
  E().makeDraggable(el, ed, overlay)
  const rh = document.createElement('div'); rh.className = 'resize-handle'; rh.style.right = '-4px'; rh.style.bottom = '-4px'; el.appendChild(rh)
  E().makeResizable(el, ed, rh)
  el.addEventListener('dblclick', async () => {
    const t = await E().showPrompt('Callout', 'Text:', ed.text)
    if (t !== null) { ed.text = t; el.textContent = t }
  })
  el.addEventListener('click', (e) => { e.stopPropagation(); E().selectEl(el) })
  overlay.appendChild(el)
}
function createRedactEl(overlay, ed) {
  const el = document.createElement('div')
  el.className = 'editable-text'
  el.dataset.id = ed.id
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  el.style.width = ed.w + 'px'; el.style.height = ed.h + 'px'
  el.style.background = '#000'; el.style.border = '1.5px dashed #ef4444'; el.style.padding = '0'
  el.title = 'Marked for redaction — apply via Tools → Apply Redactions'
  E().makeDraggable(el, ed, overlay)
  const rh = document.createElement('div'); rh.className = 'resize-handle'; rh.style.right = '-4px'; rh.style.bottom = '-4px'; rh.style.background = '#ef4444'; el.appendChild(rh)
  E().makeResizable(el, ed, rh)
  el.addEventListener('click', (e) => { e.stopPropagation(); E().selectEl(el) })
  overlay.appendChild(el)
}
function createFormCreateEl(overlay, ed) {
  const el = document.createElement('div')
  el.className = 'editable-text'
  el.dataset.id = ed.id
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  el.style.width = ed.w + 'px'; el.style.minHeight = ed.h + 'px'
  el.style.background = 'rgba(34,197,94,.12)'; el.style.border = '1.5px dashed #22c55e'
  el.style.fontSize = '11px'; el.style.color = '#052e16'
  el.textContent = `${ed.field === 'text' ? '📝' : ed.field === 'check' ? '☑' : ed.field === 'drop' ? '🔽' : '🔘'} ${ed.name}${ed.required ? ' *required' : ''}`
  el.title = 'Form field — created in the saved PDF on Save'
  E().makeDraggable(el, ed, overlay)
  const rh = document.createElement('div'); rh.className = 'resize-handle'; rh.style.right = '-4px'; rh.style.bottom = '-4px'; rh.style.background = '#22c55e'; el.appendChild(rh)
  E().makeResizable(el, ed, rh)
  el.addEventListener('click', (e) => { e.stopPropagation(); E().selectEl(el) })
  overlay.appendChild(el)
}
window.ProRenderEdit = (overlay, ed) => {
  if (ed.type === 'shape') createShapeEl(overlay, ed)
  else if (ed.type === 'arrow') createArrowEl(overlay, ed)
  else if (ed.type === 'uann' || ed.type === 'sann') createLineAnnEl(overlay, ed)
  else if (ed.type === 'stamp') createStampEl(overlay, ed)
  else if (ed.type === 'callout') createCalloutEl(overlay, ed)
  else if (ed.type === 'redact') createRedactEl(overlay, ed)
  else if (ed.type === 'formCreate') createFormCreateEl(overlay, ed)
}

// ---- drag-to-create for shape/arrow/line-ann tools ----
let drag = null
document.addEventListener('mousedown', (e) => {
  const t = E().tool
  const drawTools = ['uann', 'sann', 'shape-rect', 'shape-ellipse', 'arrow']
  if (!drawTools.includes(t)) return
  const ov = e.target.closest && e.target.closest('.overlay')
  if (!ov) return
  if (e.target !== ov && !(e.target.classList && e.target.classList.contains('draw-canvas'))) return
  const wraps = [...document.querySelectorAll('.overlay')]
  const pageIndex = wraps.indexOf(ov)
  const r = ov.getBoundingClientRect()
  drag = { ov, pageIndex, sx: e.clientX - r.left, sy: e.clientY - r.top, ghost: null, tool: t }
  const g = document.createElement('div')
  g.style.cssText = 'position:absolute;pointer-events:none;z-index:5;border:2px dashed #3b82f6;background:rgba(59,130,246,.12);'
  if (t === 'uann' || t === 'sann') { g.style.border = 'none'; g.style.background = 'transparent'; g.style.borderTop = `2px solid ${col()}` }
  ov.appendChild(g)
  drag.ghost = g
  e.preventDefault()
}, true)
document.addEventListener('mousemove', (e) => {
  if (!drag) return
  const r = drag.ov.getBoundingClientRect()
  const cx = e.clientX - r.left, cy = e.clientY - r.top
  const x = Math.min(drag.sx, cx), y = Math.min(drag.sy, cy)
  drag.ghost.style.left = x + 'px'; drag.ghost.style.top = y + 'px'
  drag.ghost.style.width = Math.abs(cx - drag.sx) + 'px'
  drag.ghost.style.height = Math.max(Math.abs(cy - drag.sy), drag.tool === 'uann' || drag.tool === 'sann' ? 8 : 2) + 'px'
})
document.addEventListener('mouseup', () => {
  if (!drag) return
  const d = drag; drag = null
  const gw = parseFloat(d.ghost.style.width) || 0, gh = parseFloat(d.ghost.style.height) || 0
  const gx = parseFloat(d.ghost.style.left) || 0, gy = parseFloat(d.ghost.style.top) || 0
  d.ghost.remove()
  if (gw < 8 && gh < 8) return
  const e = E()
  e.pushUndo()
  const c = col()
  let ed
  if (d.tool === 'uann' || d.tool === 'sann') ed = newEd({ pageIndex: d.pageIndex, type: d.tool, x: gx, y: gy, w: gw, h: Math.max(gh, 10), color: c, width: 2 })
  else if (d.tool === 'arrow') ed = newEd({ pageIndex: d.pageIndex, type: 'arrow', x: gx, y: gy, w: gw, h: Math.max(gh, 10), color: c, width: 2.5 })
  else ed = newEd({ pageIndex: d.pageIndex, type: 'shape', shape: d.tool === 'shape-ellipse' ? 'ellipse' : 'rect', x: gx, y: gy, w: gw, h: Math.max(gh, 10), borderColor: c, borderWidth: 2, fill: null })
  e.edits.push(ed)
  window.ProRenderEdit(d.ov, ed)
  status(`${d.tool === 'uann' ? 'Underline' : d.tool === 'sann' ? 'Strikeout' : d.tool === 'arrow' ? 'Arrow' : 'Shape'} added on page ${d.pageIndex + 1}`)
})
// click-to-place stamp + callout
document.addEventListener('click', async (e) => {
  const t = E().tool
  if (t !== 'stamp' && t !== 'callout') return
  const ov = e.target.closest && e.target.closest('.overlay')
  if (!ov) return
  if (e.target !== ov && !(e.target.classList && e.target.classList.contains('draw-canvas'))) return
  const wraps = [...document.querySelectorAll('.overlay')]
  const pageIndex = wraps.indexOf(ov)
  const r = ov.getBoundingClientRect()
  const x = e.clientX - r.left, y = e.clientY - r.top
  const text = await E().showPrompt(t === 'stamp' ? 'Stamp' : 'Callout', 'Text:', t === 'stamp' ? 'APPROVED' : 'Note')
  if (text === null) return
  const ed = t === 'stamp'
    ? newEd({ pageIndex, type: 'stamp', x: x - 70, y: y - 18, w: 140, h: 36, text: text || 'APPROVED', color: '#dc2626' })
    : newEd({ pageIndex, type: 'callout', x: x - 90, y: y - 30, w: 180, h: 60, text: text || '', fontSize: 11, color: '#000000', borderColor: '#f59e0b' })
  E().pushUndo()
  E().edits.push(ed)
  window.ProRenderEdit(ov, ed)
  renderComments()
  status(`${t === 'stamp' ? 'Stamp' : 'Callout'} placed on page ${pageIndex + 1}`)
}, true)

// ---- comments list (notes + callouts) ----
function renderComments() {
  const box = document.getElementById('commentList')
  if (!box) return
  const items = E().edits.filter((x) => x.type === 'note' || x.type === 'callout')
  if (!items.length) { box.textContent = 'No comments yet'; return }
  box.innerHTML = ''
  items.forEach((ed) => {
    const d = document.createElement('div')
    d.className = 'form-item'
    d.innerHTML = `<b>${ed.type === 'note' ? '📌 Note' : '💬 Callout'} · p${ed.pageIndex + 1}</b><br/><small>${String(ed.text || '').slice(0, 80)}</small>`
    d.style.cursor = 'pointer'
    d.onclick = () => document.querySelectorAll('.page-wrap')[ed.pageIndex]?.scrollIntoView({ block: 'center' })
    const del = document.createElement('button')
    del.className = 'btn btn-small btn-danger'; del.textContent = 'Delete'
    del.onclick = (ev) => { ev.stopPropagation(); E().pushUndo(); E().edits = E().edits.filter((x) => x !== ed); E().refreshOverlays(); renderComments() }
    d.appendChild(del)
    box.appendChild(d)
  })
}
reg('erase', () => document.querySelector('[data-tool="deleteWord"]')?.click())
reg('replace', () => document.querySelector('[data-tool="replace"]')?.click())
reg('ins-text', () => document.getElementById('addTextBtn')?.click())
reg('ins-styled', () => document.getElementById('addStyledTextBtn')?.click())
reg('ins-image', () => document.getElementById('imageInput')?.click())
reg('ins-table', () => document.getElementById('insertTableBtn')?.click())
reg('ins-header', () => document.getElementById('insertHeaderBtn')?.click())
reg('ins-footer', () => document.getElementById('insertFooterBtn')?.click())
reg('ins-pagenum', () => document.getElementById('pageNumberBtn')?.click())
reg('ins-line', () => document.getElementById('insertLineBtn')?.click())
reg('ins-sign-draw', () => { status('Draw in the Signature Pad (left panel), then Add to PDF'); document.getElementById('sigPad')?.scrollIntoView({ block: 'center' }) })
