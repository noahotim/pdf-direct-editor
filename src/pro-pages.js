// pro-pages: thumbnails, reorder, rotate, add/duplicate/insert/replace/extract/split/merge/reverse
import { E, status, reg, openDialog, downloadBytes, pickFiles, parseRange } from './pro-core.js'

const thumbSel = new Set()
const pageHist = [] // {bytes, edits} snapshots for page-op undo (size-capped)

function needDoc() {
  if (!E().pdfLibDoc) { status('Open a PDF first'); return null }
  return E().pdfLibDoc
}
function checkedOrVisible() {
  const e = E()
  if (thumbSel.size) return [...thumbSel].filter((i) => i < e.totalPages).sort((a, b) => a - b)
  return [e.visiblePageIndex()]
}
// rebuild document from ordered {doc,index} sources; remap main-doc edit indices via mapFn(oldIdx)->newIdx|-1
async function rebuild(sources, mapFn, label) {
  const e = E()
  const { PDFDocument } = e.libs
  const cur = e.pdfLibDoc
  if (cur && cur.getPageCount() * 200000 < 30 * 1024 * 1024) {
    try {
      const snap = await cur.save()
      pageHist.push({ bytes: snap, edits: JSON.parse(JSON.stringify(e.edits)) })
      if (pageHist.length > 5) pageHist.shift()
    } catch { /* skip snapshot */ }
  }
  e.pushUndo()
  const nd = await PDFDocument.create()
  for (const s of sources) {
    const [cp] = await nd.copyPages(s.doc, [s.index])
    nd.addPage(cp)
  }
  e.edits = e.edits.filter((ed) => {
    if (ed.pageIndex === undefined || ed.pageIndex < 0) return true
    const n = mapFn ? mapFn(ed.pageIndex) : ed.pageIndex
    if (n < 0 || n === undefined) return false
    ed.pageIndex = n
    return true
  })
  e.pagesToDelete.clear()
  const bytes = await nd.save()
  e.pdfLibDoc = nd
  e.originalBytes = bytes
  const task = e.libs.pdfjsLib.getDocument({ data: bytes })
  e.pdfDocProxy = await task.promise
  e.totalPages = e.pdfDocProxy.numPages
  thumbSel.clear()
  e.pdfContainer.innerHTML = ''
  await e.renderAll(); e.renderPageList(); await e.listFormFields()
  renderThumbs()
  status(label || `Pages rebuilt — ${e.totalPages} pages`)
}
function undoPageOp() {
  const s = pageHist.pop()
  if (!s) return status('No page operation to undo')
  const e = E()
  e.pdfLibDoc = null
  E().reloadFromBytes(new Uint8Array(s.bytes), { keepEdits: false }).then(() => {
    E().edits = s.edits; E().refreshOverlays(); renderThumbs()
    status('Page operation undone')
  })
}

// ---- thumbnails ----
async function renderThumbs() {
  const box = document.getElementById('thumbs')
  const e = E()
  if (!e.pdfDocProxy) { box.textContent = 'No PDF loaded'; return }
  box.innerHTML = ''
  document.getElementById('thumbCount').textContent = `(${e.totalPages})`
  for (let i = 0; i < e.totalPages; i++) {
    const row = document.createElement('div')
    row.className = 'thumb' + (thumbSel.has(i) ? ' sel' : '') + (e.pagesToDelete.has(i) ? ' sel' : '')
    row.draggable = true
    row.dataset.i = i
    const cb = document.createElement('input')
    cb.type = 'checkbox'; cb.checked = thumbSel.has(i)
    cb.onclick = (ev) => ev.stopPropagation()
    cb.onchange = () => { cb.checked ? thumbSel.add(i) : thumbSel.delete(i); row.classList.toggle('sel', cb.checked) }
    const cv = document.createElement('canvas')
    const meta = document.createElement('div')
    meta.className = 'tmeta'
    meta.innerHTML = `<div class="tnum">Page ${i + 1}${e.pagesToDelete.has(i) ? ' 🗑' : ''}</div><div>rendering…</div>`
    row.append(cb, cv, meta)
    row.onclick = () => document.querySelectorAll('.page-wrap')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row.ondragstart = (ev) => ev.dataTransfer.setData('text/pg', String(i))
    row.ondragover = (ev) => ev.preventDefault()
    row.ondrop = async (ev) => {
      ev.preventDefault()
      const from = +ev.dataTransfer.getData('text/pg')
      const to = i
      if (from === to || isNaN(from)) return
      const order = E().pdfLibDoc.getPageIndices()
      const [mv] = order.splice(from, 1)
      order.splice(to, 0, mv)
      const pos = {}
      order.forEach((oldIdx, newIdx) => { pos[oldIdx] = newIdx })
      await rebuild(order.map((o) => ({ doc: E().pdfLibDoc, index: o })), (old) => pos[old], `Moved page ${from + 1} → ${to + 1}`)
    }
    box.appendChild(row)
    ;(async (idx, canvas, metaEl) => {
      try {
        const page = await E().pdfDocProxy.getPage(idx + 1)
        const v0 = page.getViewport({ scale: 1 })
        const s = 110 / v0.width
        const vp = page.getViewport({ scale: s })
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height)
        canvas.style.height = 'auto'
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        const sz = E().pdfLibDoc.getPage(idx).getSize()
        metaEl.innerHTML = `<div class="tnum">Page ${idx + 1}${E().pagesToDelete.has(idx) ? ' 🗑' : ''}</div><div>${Math.round(sz.width)}×${Math.round(sz.height)} pt</div>`
      } catch { metaEl.textContent = 'Page ' + (idx + 1) }
    })(i, cv, meta)
  }
}

// ---- ops ----
async function opAddBlank() {
  const doc = needDoc(); if (!doc) return
  const e = E()
  const s0 = doc.getPage(0).getSize()
  const { PDFDocument } = e.libs
  const tmp = await PDFDocument.create()
  tmp.addPage([s0.width, s0.height])
  const at = e.visiblePageIndex() + 1
  const order = doc.getPageIndices()
  const sources = []
  order.forEach((o, ni) => { if (ni === at) sources.push({ doc: tmp, index: 0 }); sources.push({ doc, index: o }) })
  if (at >= order.length) sources.push({ doc: tmp, index: 0 })
  const pos = {}
  let n = 0
  sources.forEach((s) => { if (s.doc === doc) pos[s.index] = n; n++ })
  await rebuild(sources, (old) => pos[old], `Blank page inserted at ${at + 1}`)
}
async function opDuplicate() {
  const doc = needDoc(); if (!doc) return
  const picks = checkedOrVisible()
  const e = E()
  const sources = []
  const pos = {}
  let n = 0
  doc.getPageIndices().forEach((o) => {
    sources.push({ doc, index: o }); pos[o] = n; n++
    if (picks.includes(o)) { sources.push({ doc, index: o }); n++ }
  })
  await rebuild(sources, (old) => pos[old], `Duplicated ${picks.length} page${picks.length > 1 ? 's' : ''}`)
}
async function opRotate(delta) {
  const doc = needDoc(); if (!doc) return
  const picks = checkedOrVisible()
  const e = E()
  const { degrees } = e.libs
  for (const i of picks) {
    const p = doc.getPage(i)
    const cur = p.getRotation().angle
    p.setRotation(degrees((cur + delta + 360) % 360))
  }
  const bytes = await doc.save()
  e.originalBytes = bytes
  const task = e.libs.pdfjsLib.getDocument({ data: bytes })
  e.pdfDocProxy = await task.promise
  e.pdfContainer.innerHTML = ''
  await e.renderAll(); renderThumbs()
  status(`Rotated ${picks.length} page${picks.length > 1 ? 's' : ''} ${delta > 0 ? '+90°' : '−90°'}`)
}
async function opMove(dir) {
  const doc = needDoc(); if (!doc) return
  const picks = checkedOrVisible()
  if (picks.length !== 1) return status('Select exactly one page to move (checkbox)')
  const i = picks[0], j = i + dir
  if (j < 0 || j >= doc.getPageCount()) return status('Already at the ' + (dir < 0 ? 'top' : 'bottom'))
  const order = doc.getPageIndices()
  ;[order[i], order[j]] = [order[j], order[i]]
  const pos = {}
  order.forEach((o, ni) => { pos[o] = ni })
  await rebuild(order.map((o) => ({ doc, index: o })), (old) => pos[old], `Moved page ${i + 1} ${dir < 0 ? 'up' : 'down'}`)
}
async function opReverse() {
  const doc = needDoc(); if (!doc) return
  const order = doc.getPageIndices().reverse()
  const pos = {}
  order.forEach((o, ni) => { pos[o] = ni })
  await rebuild(order.map((o) => ({ doc, index: o })), (old) => pos[old], 'Page order reversed')
}
async function opInsert() {
  const doc = needDoc(); if (!doc) return
  const files = await pickFiles('.pdf', false)
  if (!files.length) return
  const { PDFDocument } = E().libs
  const src = await PDFDocument.load(new Uint8Array(await files[0].arrayBuffer()))
  const r = await openDialog('Insert Pages from PDF', [
    { key: 'range', label: `Source pages (1–${src.getPageCount()}, e.g. 1-3,5)`, value: `1-${src.getPageCount()}` },
    { key: 'at', label: `Insert after page (0 = start, max ${doc.getPageCount()})`, type: 'number', value: E().visiblePageIndex() + 1, min: 0, max: doc.getPageCount() }
  ], 'Insert')
  if (!r) return
  const idx = parseRange(r.range, src.getPageCount())
  if (!idx.length) return status('No valid source pages')
  const at = Math.max(0, Math.min(doc.getPageCount(), r.at | 0))
  const order = doc.getPageIndices()
  const sources = []
  order.forEach((o, ni) => { if (ni === at) idx.forEach((s) => sources.push({ doc: src, index: s })); sources.push({ doc, index: o }) })
  if (at >= order.length) idx.forEach((s) => sources.push({ doc: src, index: s }))
  const pos = {}
  let n = 0
  sources.forEach((s) => { if (s.doc === doc) { pos[s.index] = n } n++ })
  await rebuild(sources, (old) => pos[old], `Inserted ${idx.length} page${idx.length > 1 ? 's' : ''} from ${files[0].name}`)
}
async function opReplace() {
  const doc = needDoc(); if (!doc) return
  const target = checkedOrVisible()[0]
  const files = await pickFiles('.pdf', false)
  if (!files.length) return
  const { PDFDocument } = E().libs
  const src = await PDFDocument.load(new Uint8Array(await files[0].arrayBuffer()))
  const r = await openDialog('Replace Page', [
    { key: 'sp', label: `Source page from ${files[0].name} (1–${src.getPageCount()})`, type: 'number', value: 1, min: 1, max: src.getPageCount() }
  ], 'Replace')
  if (!r) return
  const order = doc.getPageIndices()
  const pos = {}
  order.forEach((o, ni) => { pos[o] = o === target ? -2 : ni }) // placeholder, fixed below
  const sources = order.map((o) => (o === target ? { doc: src, index: Math.min(src.getPageCount() - 1, Math.max(0, (r.sp | 0) - 1)) } : { doc, index: o }))
  let n = 0
  const map = {}
  order.forEach((o) => { map[o] = n; n++ })
  await rebuild(sources, (old) => map[old], `Replaced page ${target + 1} (old content dropped with its edits)`)
}
async function opExtract() {
  const doc = needDoc(); if (!doc) return
  const e = E()
  const picks = thumbSel.size ? [...thumbSel].sort((a, b) => a - b) : null
  let idx = picks
  if (!idx) {
    const r = await openDialog('Extract Pages', [{ key: 'range', label: `Pages (1–${doc.getPageCount()}), blank = visible page`, value: '' }], 'Extract')
    if (!r) return
    idx = r.range.trim() ? parseRange(r.range, doc.getPageCount()) : [e.visiblePageIndex()]
  }
  if (!idx.length) return status('Nothing selected')
  const { PDFDocument } = e.libs
  const nd = await PDFDocument.create()
  const cp = await nd.copyPages(doc, idx)
  cp.forEach((p) => nd.addPage(p))
  downloadBytes(await nd.save(), 'extracted-pages.pdf')
  status(`Extracted ${idx.length} page${idx.length > 1 ? 's' : ''} → extracted-pages.pdf`)
}
async function opSplit() {
  const doc = needDoc(); if (!doc) return
  const e = E()
  const n = doc.getPageCount()
  const r = await openDialog('Split PDF', [
    { key: 'mode', label: 'Mode', type: 'select', value: 'ranges', options: ['Page ranges', 'Every page', 'Equal sections', 'Checked pages'] },
    { key: 'spec', label: 'Ranges (e.g. 1-3,4-6) / Sections (number)', value: `1-${Math.min(n, 3)},${Math.min(n, 4)}-${n}` }
  ], 'Split')
  if (!r) return
  const { PDFDocument } = e.libs
  let groups = []
  if (r.mode === 'Every page') groups = doc.getPageIndices().map((i) => [i])
  else if (r.mode === 'Checked pages') { groups = thumbSel.size ? [[...thumbSel].sort((a, b) => a - b)] : [[e.visiblePageIndex()]] }
  else if (r.mode === 'Equal sections') {
    const k = Math.max(1, parseInt(r.spec) || 2)
    const per = Math.ceil(n / k)
    for (let s = 0; s < k; s++) { const g = []; for (let i = s * per; i < Math.min(n, (s + 1) * per); i++) g.push(i); if (g.length) groups.push(g) }
  } else {
    for (const part of String(r.spec).split(',')) {
      const g = parseRange(part, n)
      if (g.length) groups.push(g)
    }
  }
  if (!groups.length) return status('Nothing to split')
  let k = 0
  for (const g of groups) {
    const nd = await PDFDocument.create()
    const cp = await nd.copyPages(doc, g)
    cp.forEach((p) => nd.addPage(p))
    downloadBytes(await nd.save(), `split-part-${++k}.pdf`)
  }
  status(`Split into ${groups.length} file${groups.length > 1 ? 's' : ''}`)
}
async function opMerge() {
  const files = await pickFiles('.pdf', true)
  if (!files.length) return
  if (files.length < 2 && !E().pdfLibDoc) return status('Pick at least 2 PDFs (or open one first to append)')
  const e = E()
  const { PDFDocument } = e.libs
  const docs = []
  for (const f of files) docs.push(await PDFDocument.load(new Uint8Array(await f.arrayBuffer())))
  const r = await openDialog('Merge PDFs', [
    { key: 'mode', label: 'Merge into', type: 'select', value: e.pdfLibDoc ? 'append' : 'new', options: e.pdfLibDoc ? ['Append to current document', 'New document from files'] : ['New document from files'] }
  ], 'Merge')
  if (!r) return
  if (r.mode.startsWith('Append')) {
    const doc = e.pdfLibDoc
    const order = doc.getPageIndices()
    const sources = order.map((o) => ({ doc, index: o }))
    docs.forEach((d) => d.getPageIndices().forEach((i) => sources.push({ doc: d, index: i })))
    const pos = {}
    order.forEach((o, ni) => { pos[o] = ni })
    await rebuild(sources, (old) => pos[old], `Merged ${files.length} file${files.length > 1 ? 's' : ''} appended`)
  } else {
    const nd = await PDFDocument.create()
    for (const d of docs) (await nd.copyPages(d, d.getPageIndices())).forEach((p) => nd.addPage(p))
    window.__docName = 'merged.pdf'
    await e.reloadFromBytes(await nd.save())
    renderThumbs()
    status(`Merged ${files.length} files → merged.pdf (${e.totalPages} pages)`)
  }
}
// Delete pages IMMEDIATELY (rebuilds the document right away, not on Save)
async function deletePagesNow(indices) {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  const drop = new Set(indices)
  if (!drop.size) return status('No pages selected')
  if (drop.size >= e.totalPages) return status('Cannot delete all pages — keep at least one')
  const order = e.pdfLibDoc.getPageIndices().filter((i) => !drop.has(i))
  const pos = {}
  order.forEach((o, ni) => { pos[o] = ni })
  await rebuild(order.map((o) => ({ doc: e.pdfLibDoc, index: o })), (old) => (drop.has(old) ? -1 : pos[old]), `Deleted ${drop.size} page${drop.size > 1 ? 's' : ''} — gone now (undo available)`)
}
window.bxDeletePagesNow = deletePagesNow
function opDeleteChecked() {
  const picks = [...thumbSel].sort((a, b) => a - b)
  if (!picks.length) return status('Check pages in the thumbnails first (or use Pages → Delete panel)')
  deletePagesNow(picks)
}

// wire tab buttons + menu actions
const W = (id, fn) => document.getElementById(id)?.addEventListener('click', fn)
W('pgAddBtn', opAddBlank); W('pgDupBtn', opDuplicate)
W('pgRotLBtn', () => opRotate(-90)); W('pgRotRBtn', () => opRotate(90))
W('pgUpBtn', () => opMove(-1)); W('pgDownBtn', () => opMove(1))
W('pgInsertBtn', opInsert); W('pgReplaceBtn', opReplace)
W('pgExtractBtn', opExtract); W('pgSplitBtn', opSplit)
W('pgMergeBtn', opMerge); W('pgRevBtn', opReverse)
W('pgDelSelBtn', opDeleteChecked)
;(() => {
  const g = document.querySelector('#tab-pages .tool-group')
  if (g) {
    const b = document.createElement('button')
    b.className = 'btn btn-small'; b.textContent = '↩ Undo Page Op'
    b.onclick = undoPageOp
    g.appendChild(b)
  }
})()
reg('pages-refresh', renderThumbs)
reg('pg-add', opAddBlank); reg('pg-dup', opDuplicate)
reg('pg-rotl', () => opRotate(-90)); reg('pg-rotr', () => opRotate(90))
reg('pg-rev', opReverse)
reg('pg-insert', opInsert); reg('pg-replace', opReplace)
reg('pg-extract', opExtract); reg('pg-split', opSplit); reg('pg-merge', opMerge)
reg('pg-del', () => { document.querySelector('.side-tab[data-tab="pages"]')?.click(); status('Check pages below, then Delete Checked Pages') })
reg('cover', () => { document.getElementById('coverInput')?.click() })

export { renderThumbs, rebuild }
