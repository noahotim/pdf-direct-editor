// pro-lab: metadata, export/print/converters, compress, compare, batch, OCR, redaction, security info
import { E, status, reg, openDialog, downloadBlob, downloadBytes, pickFiles, taskBegin, setBar, parseRange } from './pro-core.js'

// ---------- file info + metadata ----------
async function fileInfo() {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  let perms = '—'
  try { const p = await e.pdfDocProxy.getPermissions(); perms = JSON.stringify(p) } catch { /* ignore */ }
  await openDialog('File Information', [], 'Close')
  document.getElementById('actionBody').innerHTML = `<div style="font-size:12px;line-height:2;">
    <b>Name:</b> ${window.__docName || '—'}<br/><b>Pages:</b> ${e.totalPages}<br/>
    <b>Size:</b> ${((e.originalBytes?.length || 0) / 1024).toFixed(1)} KB<br/>
    <b>Title:</b> ${e.pdfLibDoc.getTitle() || '—'}<br/><b>Author:</b> ${e.pdfLibDoc.getAuthor() || '—'}<br/>
    <b>Producer:</b> ${e.pdfLibDoc.getProducer() || '—'}<br/><b>Permissions:</b> <small>${perms}</small></div>`
}
async function metadataEditor() {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  const d = e.pdfLibDoc
  const r = await openDialog('Document Metadata', [
    { key: 'title', label: 'Title', value: d.getTitle() || '' },
    { key: 'author', label: 'Author', value: d.getAuthor() || '' },
    { key: 'subject', label: 'Subject', value: d.getSubject() || '' },
    { key: 'keywords', label: 'Keywords', value: (d.getKeywords() || '').split ? d.getKeywords() : '' },
    { key: 'creator', label: 'Creator', value: d.getCreator() || '' }
  ], 'Apply')
  if (!r) return
  try {
    d.setTitle(r.title); d.setAuthor(r.author); d.setSubject(r.subject)
    d.setKeywords(r.keywords.split(',').map((s) => s.trim()).filter(Boolean))
    d.setCreator(r.creator)
    d.setModificationDate(new Date())
    status('Metadata updated — Save the PDF to keep it')
  } catch (err) { status('Metadata failed: ' + err.message) }
}

// ---------- export pages as images / text ----------
async function exportImages() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const r = await openDialog('Export Pages as Images', [
    { key: 'range', label: `Pages (1–${e.totalPages}), blank = visible page`, value: '' },
    { key: 'fmt', label: 'Format', type: 'select', value: 'png', options: ['png', 'jpeg'] },
    { key: 'scale', label: 'Scale (resolution)', type: 'number', value: 2, min: 0.5, max: 4 }
  ], 'Export')
  if (!r) return
  const idx = r.range.trim() ? parseRange(r.range, e.totalPages) : [e.visiblePageIndex()]
  if (!idx.length) return status('No pages selected')
  const t = taskBegin('Exporting images')
  let k = 0
  for (const i of idx) {
    const page = await e.pdfDocProxy.getPage(i + 1)
    const vp = page.getViewport({ scale: r.scale })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
    const blob = await new Promise((res) => c.toBlob(res, r.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92))
    downloadBlob(blob, `page-${i + 1}.${r.fmt === 'png' ? 'png' : 'jpg'}`)
    t.log(`page ${i + 1} exported`); setBar((++k / idx.length) * 100)
  }
  t.done(`Exported ${idx.length} image${idx.length > 1 ? 's' : ''}`)
}
async function exportText() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  status('Extracting text…')
  let out = ''
  for (let i = 1; i <= e.totalPages; i++) {
    const tc = await (await e.pdfDocProxy.getPage(i)).getTextContent()
    out += `\n----- Page ${i} -----\n` + (tc.items || []).map((it) => it.str || '').join(' ') + '\n'
  }
  downloadBlob(new Blob([out], { type: 'text/plain' }), (window.__docName || 'document').replace(/\.pdf$/i, '') + '.txt')
  status(`Text exported (${(out.length / 1024).toFixed(1)} KB)`)
}

// ---------- print ----------
async function doPrint() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const r = await openDialog('Print', [
    { key: 'scope', label: 'Pages', type: 'select', value: 'all', options: ['All pages', 'Visible page'] },
    { key: 'scale', label: 'Render scale', type: 'number', value: 1.5, min: 0.5, max: 3 }
  ], 'Print')
  if (!r) return
  const idx = r.scope === 'All pages' ? [...Array(e.totalPages).keys()] : [e.visiblePageIndex()]
  const area = document.getElementById('printArea')
  area.innerHTML = ''
  status('Preparing print…')
  for (const i of idx) {
    const page = await e.pdfDocProxy.getPage(i + 1)
    const vp = page.getViewport({ scale: r.scale })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
    const img = document.createElement('img'); img.src = c.toDataURL('image/png')
    area.appendChild(img)
  }
  window.print()
  status('Print dialog opened')
}

// ---------- converters: images→PDF, text→PDF ----------
async function imagesToPdf() {
  const files = await pickFiles('image/*', true)
  if (!files.length) return
  const e = E()
  const { PDFDocument } = e.libs
  const d = await PDFDocument.create()
  const t = taskBegin('Images → PDF')
  let k = 0
  for (const f of files) {
    const url = await e.fileToDataUrl(f)
    const probe = new Image(); probe.src = url
    try { await probe.decode() } catch { t.log(`skip (unreadable): ${f.name}`); continue }
    const W = probe.naturalWidth || 800, H = probe.naturalHeight || 600
    const page = d.addPage([W * 0.75, H * 0.75])
    let bytes = await (await fetch(url)).arrayBuffer()
    let img
    try {
      img = /png/i.test(f.type) || url.startsWith('data:image/png') ? await d.embedPng(bytes) : await d.embedJpg(bytes)
    } catch { img = await d.embedPng(await e.rasterDataUrlToPngBytes(url)) }
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
    t.log(`added: ${f.name}`); setBar((++k / files.length) * 100)
  }
  d.setAuthor('Otim Noah'); d.setProducer('PDF Direct Editor by Otim Noah')
  window.__docName = 'images.pdf'
  await e.reloadFromBytes(await d.save())
  t.done(`Created PDF with ${e.totalPages} page${e.totalPages > 1 ? 's' : ''}`)
}
async function textToPdf() {
  const r = await openDialog('Text → PDF', [
    { key: 'title', label: 'Title', value: 'Untitled' },
    { key: 'body', label: 'Text content', type: 'textarea', value: '' }
  ], 'Create PDF')
  if (!r) return
  let body = r.body || ''
  if (!body.trim()) {
    const files = await pickFiles('.txt,.md,.csv,text/plain', false)
    if (!files.length) return
    body = await files[0].text()
  }
  const e = E()
  const { PDFDocument, StandardFonts, rgb } = e.libs
  const d = await PDFDocument.create()
  const font = await d.embedFont(StandardFonts.Helvetica)
  const W = 595, H = 842, M = 50, LH = 16
  const words = body.replace(/\r/g, '').split('\n')
  let page = d.addPage([W, H]), y = H - M
  page.drawText(r.title || 'Untitled', { x: M, y, size: 18, font })
  y -= 30
  for (const para of words) {
    let line = ''
    const tokens = para.split(/\s+/)
    if (!tokens.length || (tokens.length === 1 && !tokens[0])) { y -= LH; continue }
    for (const w of tokens) {
      const test = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(test, 11) > W - 2 * M) {
        if (y < M + LH) { page = d.addPage([W, H]); y = H - M }
        page.drawText(line, { x: M, y, size: 11, font, color: rgb(0, 0, 0) }); y -= LH
        line = w
      } else line = test
    }
    if (line) {
      if (y < M + LH) { page = d.addPage([W, H]); y = H - M }
      page.drawText(line, { x: M, y, size: 11, font, color: rgb(0, 0, 0) }); y -= LH
    }
  }
  d.setTitle(r.title || 'Untitled'); d.setAuthor('Otim Noah'); d.setProducer('PDF Direct Editor by Otim Noah')
  window.__docName = (r.title || 'text').replace(/[^\w\-]+/g, '-').slice(0, 40) + '.pdf'
  await e.reloadFromBytes(await d.save())
  status(`Created ${window.__docName} (${e.totalPages} pages)`)
}

// ---------- compression (print-based rasterization; text becomes image) ----------
async function compressPdf() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const r = await openDialog('Compress PDF (print-based: pages become images)', [
    { key: 'q', label: 'Quality', type: 'select', value: 'balanced', options: [{ value: 'high', label: 'High Quality (larger)' }, { value: 'balanced', label: 'Balanced' }, { value: 'small', label: 'Small File (lower quality)' }] }
  ], 'Compress')
  if (!r) return
  const cfg = { high: { s: 2, q: 0.9 }, balanced: { s: 1.5, q: 0.75 }, small: { s: 1, q: 0.6 } }[r.q]
  const t = taskBegin('Compressing PDF')
  const { PDFDocument } = e.libs
  const nd = await PDFDocument.create()
  for (let i = 1; i <= e.totalPages; i++) {
    const page = await e.pdfDocProxy.getPage(i)
    const v0 = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: cfg.s })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: cx, viewport: vp }).promise
    const bytes = await new Promise((res) => c.toBlob(async (b) => res(await b.arrayBuffer()), 'image/jpeg', cfg.q))
    const img = await nd.embedJpg(bytes)
    const pg = nd.addPage([v0.width, v0.height])
    pg.drawImage(img, { x: 0, y: 0, width: v0.width, height: v0.height })
    t.log(`page ${i}/${e.totalPages}`); setBar((i / e.totalPages) * 100)
  }
  nd.setAuthor('Otim Noah'); nd.setProducer('PDF Direct Editor by Otim Noah (compressed)')
  const before = e.originalBytes.length
  await e.reloadFromBytes(await nd.save(), { keepEdits: true })
  const after = e.originalBytes.length
  t.done(`Done: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB. Note: pages are now images (text not selectable).`)
}

// ---------- comparison (line-based text diff) ----------
function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n')
  const setB = new Map(), setA = new Map()
  B.forEach((l) => setB.set(l, (setB.get(l) || 0) + 1))
  A.forEach((l) => setA.set(l, (setA.get(l) || 0) + 1))
  const removed = [], added = []
  const tmp = new Map(setB)
  for (const l of A) { if ((tmp.get(l) || 0) > 0) tmp.set(l, tmp.get(l) - 1); else if (l.trim()) removed.push(l) }
  const tmp2 = new Map(setA)
  for (const l of B) { if ((tmp2.get(l) || 0) > 0) tmp2.set(l, tmp2.get(l) - 1); else if (l.trim()) added.push(l) }
  return { removed, added }
}
async function comparePdfs() {
  const files = await pickFiles('.pdf', true)
  if (files.length < 2) return status('Pick 2 PDFs to compare')
  const { PDFDocument } = E().libs
  // use pdf.js for text (dynamic via bridge lib)
  const pdfjs = E().libs.pdfjsLib
  status('Extracting text from both PDFs…')
  const texts = []
  for (const f of files.slice(0, 2)) {
    const bytes = new Uint8Array(await f.arrayBuffer())
    const doc = await pdfjs.getDocument({ data: bytes }).promise
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent()
      pages.push((tc.items || []).map((it) => it.str || '').join(' '))
    }
    texts.push({ name: f.name, pages, count: doc.numPages })
    await doc.destroy()
  }
  const [A, B] = texts
  const maxP = Math.max(A.count, B.count)
  let html = `<div style="font-size:12px;"><b>${A.name}</b> (${A.count} pg) vs <b>${B.name}</b> (${B.count} pg)<br/>`
  if (A.count !== B.count) html += `📄 Page count differs: ${A.count} → ${B.count}<br/>`
  let totA = 0, totR = 0
  for (let i = 0; i < maxP; i++) {
    const ta = A.pages[i] || '', tb = B.pages[i] || ''
    if (ta === tb) continue
    if (!ta) { html += `<br/><b>Page ${i + 1}: added in B</b>`; totA++; continue }
    if (!tb) { html += `<br/><b>Page ${i + 1}: removed (was in A)</b>`; totR++; continue }
    const d = diffLines(ta.replace(/  +/g, ' '), tb.replace(/  +/g, ' '))
    totA += d.added.length; totR += d.removed.length
    html += `<br/><b>Page ${i + 1}</b> — +${d.added.length} / −${d.removed.length}<br/>`
    d.removed.slice(0, 3).forEach((l) => { html += `<span style="color:#f87171">− ${l.slice(0, 120)}</span><br/>` })
    d.added.slice(0, 3).forEach((l) => { html += `<span style="color:#4ade80">+ ${l.slice(0, 120)}</span><br/>` })
  }
  html += `<br/><b>Total: +${totA} added, −${totR} removed segments.</b> (Line-based text comparison; layout/images not diffed.)</div>`
  await openDialog('PDF Comparison Result', [], 'Close')
  document.getElementById('actionBody').innerHTML = html
}

// ---------- batch: watermark + export images ----------
async function batchWatermark() {
  const files = await pickFiles('.pdf', true)
  if (!files.length) return
  const r = await openDialog('Batch Watermark', [
    { key: 'text', label: 'Watermark text', value: 'CONFIDENTIAL' },
    { key: 'size', label: 'Font size', type: 'number', value: 48, min: 12, max: 200 },
    { key: 'opacity', label: 'Opacity (0–1)', type: 'number', value: 0.18, min: 0.05, max: 0.8 }
  ], 'Apply to all')
  if (!r || !r.text) return
  const { PDFDocument, StandardFonts, rgb, degrees } = E().libs
  const t = taskBegin('Batch watermark')
  let k = 0
  for (const f of files) {
    try {
      const d = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()))
      const font = await d.embedFont(StandardFonts.HelveticaBold)
      for (const p of d.getPages()) {
        const { width, height } = p.getSize()
        const size = r.size
        const w = font.widthOfTextAtSize(r.text, size)
        p.drawText(r.text, { x: (width - w) / 2, y: height / 2, size, font, color: rgb(0.5, 0.5, 0.5), opacity: r.opacity, rotate: degrees(-45) })
      }
      downloadBytes(await d.save(), 'wm-' + f.name)
      t.log(`✓ ${f.name}`)
    } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
    setBar((++k / files.length) * 100)
  }
  t.done(`Watermarked ${files.length} file${files.length > 1 ? 's' : ''}`)
}
async function batchExportImages() {
  const files = await pickFiles('.pdf', true)
  if (!files.length) return
  const r = await openDialog('Batch Export Images', [
    { key: 'fmt', label: 'Format', type: 'select', value: 'png', options: ['png', 'jpeg'] },
    { key: 'pages', label: 'Pages per file', type: 'select', value: 'first', options: ['First page only', 'All pages'] }
  ], 'Export')
  if (!r) return
  const pdfjs = E().libs.pdfjsLib
  const t = taskBegin('Batch export')
  let k = 0, n = 0
  for (const f of files) {
    try {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise
      const idx = r.pages === 'First page only' ? [1] : [...Array(doc.numPages).keys()].map((i) => i + 1)
      for (const i of idx) {
        const page = await doc.getPage(i)
        const vp = page.getViewport({ scale: 1.5 })
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
        const blob = await new Promise((res) => c.toBlob(res, r.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.9))
        downloadBlob(blob, `${f.name.replace(/\.pdf$/i, '')}-p${i}.${r.fmt === 'png' ? 'png' : 'jpg'}`)
        n++
      }
      await doc.destroy()
      t.log(`✓ ${f.name}`)
    } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
    setBar((++k / files.length) * 100)
  }
  t.done(`Exported ${n} image${n === 1 ? '' : 's'}`)
}

// ---------- OCR (Tesseract.js, requires internet for engine + language data) ----------
async function ocrPage() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const r = await openDialog('OCR Page (English, needs internet once)', [
    { key: 'page', label: `Page (1–${e.totalPages})`, type: 'number', value: e.visiblePageIndex() + 1, min: 1, max: e.totalPages },
    { key: 'min', label: 'Min word confidence (0–100)', type: 'number', value: 50, min: 0, max: 100 }
  ], 'Run OCR')
  if (!r) return
  const t = taskBegin('OCR (Tesseract.js)')
  try {
    t.log('Loading OCR engine… (downloads once, needs internet)')
    const T = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js')
    const worker = await T.createWorker('eng', undefined, { logger: (m) => { if (m.status === 'recognizing text') setBar((m.progress || 0) * 100) } })
    const i = Math.max(1, Math.min(e.totalPages, r.page | 0))
    const page = await e.pdfDocProxy.getPage(i)
    const S = 2
    const vp = page.getViewport({ scale: S })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: cx, viewport: vp }).promise
    t.log(`Recognizing page ${i}…`)
    const { data } = await worker.recognize(c)
    await worker.terminate()
    const ov = document.querySelectorAll('.overlay')[i - 1]
    const ovW = ov ? ov.clientWidth : vp.width / S * e.currentZoom
    const k = ovW / vp.width
    let n = 0
    e.pushUndo()
    for (const w of data.words || []) {
      if ((w.confidence || 0) < r.min || !w.text.trim()) continue
      const x = w.bbox.x0 * k, y = w.bbox.y0 * k, ww = (w.bbox.x1 - w.bbox.x0) * k, hh = (w.bbox.y1 - w.bbox.y0) * k
      const ed = { id: Date.now() + Math.random() + n, pageIndex: i - 1, type: 'text', x, y, w: Math.max(ww, 12), h: Math.max(hh, 8), text: w.text, fontSize: Math.max(6, hh * 0.9), color: '#000000', fontFamily: 'Helvetica' }
      e.edits.push(ed); e.createTextEl(ov, ed); n++
    }
    t.done(`OCR done: ${n} searchable words placed on page ${i} (selectable + searchable + saved)`)
  } catch (err) {
    t.done('OCR failed: ' + err.message + ' (needs internet for engine download)')
  }
}

// ---------- redaction workflow (opaque burn-in; see report for true-redaction limits) ----------
function redactDragSetup() {
  if (window.__redactWired) return
  window.__redactWired = true
  let d = null
  document.addEventListener('mousedown', (e) => {
    if (E().tool !== 'redact') return
    const ov = e.target.closest && e.target.closest('.overlay')
    if (!ov) return
    if (e.target !== ov && !(e.target.classList && e.target.classList.contains('draw-canvas'))) return
    const wraps = [...document.querySelectorAll('.overlay')]
    const r = ov.getBoundingClientRect()
    d = { ov, pageIndex: wraps.indexOf(ov), sx: e.clientX - r.left, sy: e.clientY - r.top, g: null }
    const g = document.createElement('div')
    g.style.cssText = 'position:absolute;pointer-events:none;z-index:5;background:rgba(0,0,0,.85);border:1.5px dashed #ef4444;'
    ov.appendChild(g); d.g = g
    e.preventDefault()
  }, true)
  document.addEventListener('mousemove', (e) => {
    if (!d) return
    const r = d.ov.getBoundingClientRect()
    const cx = e.clientX - r.left, cy = e.clientY - r.top
    d.g.style.left = Math.min(d.sx, cx) + 'px'; d.g.style.top = Math.min(d.sy, cy) + 'px'
    d.g.style.width = Math.abs(cx - d.sx) + 'px'; d.g.style.height = Math.max(Math.abs(cy - d.sy), 8) + 'px'
  })
  document.addEventListener('mouseup', () => {
    if (!d) return
    const cur = d; d = null
    const w = parseFloat(cur.g.style.width) || 0, h = parseFloat(cur.g.style.height) || 0
    const x = parseFloat(cur.g.style.left) || 0, y = parseFloat(cur.g.style.top) || 0
    cur.g.remove()
    if (w < 8 || h < 8) return
    E().pushUndo()
    const ed = { id: Date.now() + Math.random(), pageIndex: cur.pageIndex, type: 'redact', x, y, w, h }
    E().edits.push(ed)
    window.ProRenderEdit(cur.ov, ed)
    status(`Marked redaction on page ${cur.pageIndex + 1} — Apply via Tools → Apply Redactions`)
  })
}
redactDragSetup()
async function redactSearch() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const r = await openDialog('Search & Mark Redactions', [{ key: 'q', label: 'Text to redact (every match on every page)', value: '' }], 'Mark All')
  if (!r || !r.q.trim()) return
  const q = r.q.trim().toLowerCase()
  let n = 0
  e.pushUndo()
  for (let i = 1; i <= e.totalPages && n < 200; i++) {
    const page = await e.pdfDocProxy.getPage(i)
    const tc = await page.getTextContent()
    const vp = page.getViewport({ scale: e.currentZoom })
    const ov = document.querySelectorAll('.overlay')[i - 1]
    const U = e.libs.pdfjsLib.Util
    for (const it of tc.items || []) {
      if (n >= 200) break
      if (!it.str || !it.str.toLowerCase().includes(q)) continue
      try {
        const tx = U.transform(vp.transform, it.transform)
        const fs = Math.hypot(tx[2], tx[3]) || 10
        const w = (it.width || it.str.length * fs * 0.55) * e.currentZoom
        const h = fs * e.currentZoom * 1.15
        const ed = { id: Date.now() + Math.random() + n, pageIndex: i - 1, type: 'redact', x: tx[4], y: tx[5] - h * 0.85, w: Math.max(w, 8), h }
        e.edits.push(ed)
        if (ov) window.ProRenderEdit(ov, ed)
        n++
      } catch { /* skip */ }
    }
  }
  status(n ? `Marked ${n} redaction${n > 1 ? 's' : ''} for "${r.q}" — review black boxes, then Apply` : `No matches for "${r.q}"`)
}
async function redactApply() {
  const e = E()
  const marks = e.edits.filter((x) => x.type === 'redact')
  if (!marks.length) return status('No redactions marked — use Mark Redaction Area first')
  const r = await openDialog('Apply Redactions', [
    { key: 'ok', label: `Burn ${marks.length} black redaction${marks.length > 1 ? 's' : ''} into the PDF on Save?`, type: 'check', value: true }
  ], 'Apply + Save')
  if (!r || !r.ok) return
  await openDialog('Redaction Notice', [], 'Understood')
  document.getElementById('actionBody').innerHTML = `<div style="font-size:12px;line-height:1.8;">Burn-in covers the area opaquely in the saved file. <b>Limitation:</b> underlying text glyphs in the original content stream may technically remain extractable — for court-grade redaction use a server engine (e.g. qpdf/OCRmyPDF). See final audit report §12.</div>`
  e.saveBtn.click()
}

// ---------- flatten ----------
async function flattenDoc() {
  const r = await openDialog('Flatten PDF', [{ key: 'ok', label: 'Burn all edits + form fields into page content on next Save?', type: 'check', value: true }], 'Flatten + Save')
  if (!r || !r.ok) return
  window.__flattenOnSave = true
  E().saveBtn.click()
}

// ---------- injected File-menu extras ----------
;(() => {
  const drop = document.querySelector('#menubar [data-menu="file"] .menu-drop')
  if (!drop || document.querySelector('[data-act="fileinfo"]')) return
  const mk = (act, label) => { const b = document.createElement('button'); b.dataset.act = act; b.textContent = label; b.addEventListener('click', () => { document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open')); const fn = { fileinfo: fileInfo, secinfo: secInfo }[act]; if (fn) fn() }); return b }
  drop.appendChild(mk('fileinfo', 'ℹ️ File Info…'))
  drop.appendChild(mk('secinfo', '🔐 Permissions / Security…'))
})()
async function secInfo() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  let p = {}
  try { p = await e.pdfDocProxy.getPermissions() } catch { p = {} }
  await openDialog('Permissions / Security', [], 'Close')
  document.getElementById('actionBody').innerHTML = `<div style="font-size:12px;line-height:1.9;">
    <b>Raw permissions:</b> <small>${JSON.stringify(p)}</small><br/>
    Password-protected PDFs can be <b>viewed</b> with their password only through a server workflow — this offline build cannot decrypt or encrypt (pdf-lib has no crypto engine). Saving a password on export requires an external service (see report §11).</div>`
}

// ---- registrations ----
reg('metadata', metadataEditor)
reg('expimg', exportImages)
reg('exptext', exportText)
reg('print', doPrint)
reg('img2pdf', imagesToPdf)
reg('txt2pdf', textToPdf)
reg('compress', compressPdf)
reg('compare', comparePdfs)
reg('batchmark', batchWatermark)
reg('batchexp', batchExportImages)
reg('ocr', ocrPage)
reg('red-mark', () => { E().tool = 'redact'; status('Redaction mode: press + drag black areas, then Tools → Apply Redactions') })
reg('red-search', redactSearch)
reg('red-apply', redactApply)
reg('flatten', flattenDoc)
