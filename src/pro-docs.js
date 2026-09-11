// pro-docs: Docs Studio — create / open / edit / save Word (.docx) and PowerPoint (.pptx)
// Free/open-source only: mammoth (docx→html), docx (html→docx), jszip (pptx read),
// pptxgenjs (pptx write), pdf-lib (export PDF). No paid API, no cloud upload.
import { status, reg, downloadBlob, pickFiles } from './pro-core.js'

const state = { mode: 'word', slides: [{ title: 'Slide 1', body: '' }], wordName: 'document', pptName: 'presentation' }

function el(id) { return document.getElementById(id) }

// ---------- HTML <-> structured content (for Word) ----------
function htmlBlocks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = []
  const inlineRuns = (node) => {
    const runs = []
    const walk = (n, st) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (c.textContent) runs.push({ text: c.textContent, ...st }) }
        else if (c.nodeType === 1) {
          const tag = c.tagName.toLowerCase()
          const ns = { ...st }
          if (tag === 'b' || tag === 'strong') ns.bold = true
          if (tag === 'i' || tag === 'em') ns.italics = true
          if (tag === 'u') ns.underline = true
          if (tag === 'br') { runs.push({ text: '\n' }); continue }
          walk(c, ns)
        }
      }
    }
    walk(node, {})
    return runs
  }
  const visit = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue
      const tag = c.tagName.toLowerCase()
      if (['h1', 'h2', 'h3', 'h4'].includes(tag)) blocks.push({ type: 'heading', level: +tag[1], runs: inlineRuns(c) })
      else if (tag === 'li') blocks.push({ type: 'bullet', runs: inlineRuns(c) })
      else if (['p', 'div', 'blockquote'].includes(tag)) { const r = inlineRuns(c); if (r.length) blocks.push({ type: 'para', runs: r }); else if (c.querySelector('h1,h2,h3,h4,li,p')) visit(c) }
      else if (['ul', 'ol'].includes(tag)) visit(c)
      else { const r = inlineRuns(c); if (r.length) blocks.push({ type: 'para', runs: r }) }
    }
  }
  if (doc.body.children.length) visit(doc.body); else { const t = doc.body.textContent.trim(); if (t) blocks.push({ type: 'para', runs: [{ text: t }] }) }
  return blocks
}

// ---------- create / open ----------
function resetWord() {
  state.mode = 'word'; state.wordName = 'document'
  const c = el('docWordCanvas')
  c.innerHTML = `<h1>Untitled Document</h1><p>Start typing your Word document here…</p>`
  status('New Word document — type, then Save as Word/PDF')
}
async function openWord(file) {
  state.mode = 'word'
  const mammoth = await import('mammoth')
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  state.wordName = (file.name || 'document').replace(/\.docx$/i, '')
  el('docWordCanvas').innerHTML = html || '<p></p>'
  status(`Opened ${file.name} — edit, then Save as Word/PDF`)
}
function resetPpt() {
  state.mode = 'ppt'; state.pptName = 'presentation'
  state.slides = [{ title: 'Slide 1', body: 'Click to edit this slide' }]
  renderSlides()
  status('New PowerPoint — add slides, then Save as PowerPoint/PDF')
}
async function openPpt(file) {
  state.mode = 'ppt'
  state.pptName = (file.name || 'presentation').replace(/\.pptx$/i, '')
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => (+a.match(/(\d+)/)[1]) - (+b.match(/(\d+)/)[1]))
  const slides = []
  for (const sf of slideFiles) {
    const xml = await zip.files[sf].async('text')
    const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => x[1]).join('').trim()).filter(Boolean)
    slides.push({ title: paras[0] || `Slide ${slides.length + 1}`, body: paras.slice(1).join('\n') })
  }
  state.slides = slides.length ? slides : [{ title: 'Slide 1', body: '' }]
  renderSlides()
  status(`Opened ${file.name} — ${state.slides.length} slide(s), edit then Save`)
}

// ---------- PowerPoint slide UI ----------
function renderSlides() {
  const box = el('docSlides')
  if (!box) return
  box.innerHTML = ''
  state.slides.forEach((s, i) => {
    const card = document.createElement('div')
    card.className = 'tool-group'
    card.style.borderColor = '#7c3aed'
    card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><b>Slide ${i + 1}</b>
      <span><button class="btn btn-small" data-del="${i}" style="width:auto;">🗑</button></span></div>
      <input data-title="${i}" value="${(s.title || '').replace(/"/g, '&quot;')}" placeholder="Slide title" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;margin:4px 0;" />
      <textarea data-body="${i}" rows="4" placeholder="Slide bullet points (one per line)" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">${(s.body || '').replace(/</g, '&lt;')}</textarea>`
    box.appendChild(card)
  })
  box.querySelectorAll('[data-title]').forEach((inp) => inp.oninput = () => { state.slides[+inp.dataset.title].title = inp.value })
  box.querySelectorAll('[data-body]').forEach((ta) => ta.oninput = () => { state.slides[+ta.dataset.body].body = ta.value })
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { if (state.slides.length <= 1) return status('Keep at least one slide'); state.slides.splice(+b.dataset.del, 1); renderSlides() })
}
function addSlide() { state.slides.push({ title: `Slide ${state.slides.length + 1}`, body: '' }); renderSlides() }

// ---------- exports ----------
async function saveWord() {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const blocks = htmlBlocks(el('docWordCanvas').innerHTML)
  const children = blocks.map((b) => {
    const runs = (b.runs && b.runs.length ? b.runs : [{ text: '' }]).map((r) => new TextRun({ text: r.text, bold: !!r.bold, italics: !!r.italics, underline: r.underline ? {} : undefined, break: 1 }))
    if (b.type === 'heading') return new Paragraph({ children: runs, heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 })
    if (b.type === 'bullet') return new Paragraph({ children: runs, bullet: { level: 0 } })
    return new Paragraph({ children: runs, spacing: { after: 120 } })
  })
  const doc = new Document({ creator: 'BOTIM DOCSHUB', title: state.wordName, sections: [{ children: children.length ? children : [new Paragraph('')] }] })
  downloadBlob(await Packer.toBlob(doc), state.wordName + '.docx')
  status('Saved as Word (.docx)')
}
async function savePpt() {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'BOTIM DOCSHUB by Otim Noah'
  pptx.title = state.pptName
  state.slides.forEach((s) => {
    const slide = pptx.addSlide()
    slide.addText(s.title || '', { x: 0.4, y: 0.35, w: 9.2, h: 0.9, fontSize: 24, bold: true, color: '1e3a8a' })
    const lines = (s.body || '').split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length) slide.addText(lines.map((l) => ({ text: l.replace(/^[-•*]\s*/, ''), options: { bullet: true, fontSize: 14, color: '0f172a' } })), { x: 0.5, y: 1.4, w: 9, h: 3.9, valign: 'top', lineSpacingMultiple: 1.3 })
  })
  const out = await pptx.write({ outputType: 'blob' })
  downloadBlob(out, state.pptName + '.pptx')
  status('Saved as PowerPoint (.pptx)')
}
async function savePdfFromDoc() {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const d = await PDFDocument.create()
  const font = await d.embedFont(StandardFonts.Helvetica)
  const bold = await d.embedFont(StandardFonts.HelveticaBold)
  const W = 595, H = 842, M = 50
  let page = d.addPage([W, H]), y = H - M
  const newPage = () => { page = d.addPage([W, H]); y = H - M }
  const drawWrapped = (text, size, f, color, indent = 0) => {
    const maxW = W - 2 * M - indent
    let line = ''
    for (const w of String(text).split(/\s+/)) {
      const test = line ? line + ' ' + w : w
      if (f.widthOfTextAtSize(test, size) > maxW) { if (y < M + size) newPage(); page.drawText(line, { x: M + indent, y, size, font: f, color }); y -= size * 1.35; line = w }
      else line = test
    }
    if (line) { if (y < M + size) newPage(); page.drawText(line, { x: M + indent, y, size, font: f, color }); y -= size * 1.35 }
  }
  if (state.mode === 'ppt') {
    state.slides.forEach((s, i) => {
      if (i > 0) newPage()
      drawWrapped(s.title || `Slide ${i + 1}`, 18, bold, rgb(0.12, 0.23, 0.54))
      y -= 8
      const lines = (s.body || '').split('\n').map((l) => l.trim()).filter(Boolean)
      lines.forEach((l) => drawWrapped('• ' + l.replace(/^[-•*]\s*/, ''), 12, font, rgb(0, 0, 0), 12))
      y -= 6
    })
  } else {
    const blocks = htmlBlocks(el('docWordCanvas').innerHTML)
    for (const b of blocks) {
      const text = (b.runs || []).map((r) => r.text).join('')
      if (!text.trim()) continue
      if (b.type === 'heading') { y -= 6; drawWrapped(text, b.level === 1 ? 20 : b.level === 2 ? 16 : 14, bold, rgb(0.1, 0.1, 0.3)) }
      else if (b.type === 'bullet') drawWrapped('• ' + text, 12, font, rgb(0, 0, 0), 12)
      else drawWrapped(text, 12, font, rgb(0, 0, 0))
      y -= 4
    }
  }
  downloadBlob(new Blob([await d.save()], { type: 'application/pdf' }), state.wordName.replace(/\.(docx|pptx)$/i, '') + '.pdf')
  status('Exported PDF')
}

// ---------- UI ----------
function setupDocsTab() {
  const tab = el('tab-docs')
  if (!tab) return
  tab.innerHTML = `
    <h3>Docs Studio <span style="color:#38bdf8;font-size:11px;">Word • PowerPoint</span></h3>
    <div class="tool-group" style="border-color:#2563eb;">
      <h4>Create / Open</h4>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button id="dNewWord" class="btn btn-small" style="flex:1;background:#2563eb;color:#fff;">📄 New Word</button>
        <button id="dNewPpt" class="btn btn-small" style="flex:1;background:#7c3aed;color:#fff;">📊 New PowerPoint</button>
      </div>
      <label class="btn btn-small" style="background:#0ea5e9;color:#fff;text-align:center;">📂 Open Word (.docx) <input type="file" id="dOpenWord" accept=".docx" hidden /></label>
      <label class="btn btn-small" style="background:#ea580c;color:#fff;text-align:center;">📂 Open PowerPoint (.pptx) <input type="file" id="dOpenPpt" accept=".pptx" hidden /></label>
    </div>
    <div class="tool-group" id="docWordTools">
      <h4>Word editing</h4>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button data-fmt="bold" class="btn btn-small" style="flex:1;font-weight:bold;">B</button>
        <button data-fmt="italic" class="btn btn-small" style="flex:1;font-style:italic;">I</button>
        <button data-fmt="underline" class="btn btn-small" style="flex:1;text-decoration:underline;">U</button>
      </div>
      <div style="display:flex;gap:4px;">
        <button data-blk="H1" class="btn btn-small" style="flex:1;">H1</button>
        <button data-blk="H2" class="btn btn-small" style="flex:1;">H2</button>
        <button data-blk="P" class="btn btn-small" style="flex:1;">¶</button>
        <button data-blk="UL" class="btn btn-small" style="flex:1;">• List</button>
      </div>
      <button id="dSaveWord" class="btn btn-small" style="background:#2563eb;color:#fff;">💾 Save as Word (.docx)</button>
      <button id="dSavePdf" class="btn btn-small" style="background:#16a34a;color:#fff;">💾 Export PDF</button>
    </div>
    <div class="tool-group" id="docPptTools" style="border-color:#7c3aed;display:none;">
      <h4>PowerPoint slides</h4>
      <button id="dAddSlide" class="btn btn-small">➕ Add Slide</button>
      <button id="dSavePpt" class="btn btn-small" style="background:#7c3aed;color:#fff;">💾 Save as PowerPoint (.pptx)</button>
      <button id="dSavePdf2" class="btn btn-small" style="background:#16a34a;color:#fff;">💾 Export PDF</button>
    </div>
  `
  // canvas lives in the viewer area
  let canvas = el('docCanvasWrap')
  if (!canvas) {
    canvas = document.createElement('div')
    canvas.id = 'docCanvasWrap'
    canvas.style.cssText = 'display:none;width:100%;max-width:820px;margin:10px auto;'
    canvas.innerHTML = `<div contenteditable="true" id="docWordCanvas" spellcheck="true" style="background:#fff;color:#111;min-height:70vh;padding:48px 56px;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:Georgia,serif;font-size:16px;line-height:1.55;outline:none;"></div><div id="docSlides" style="display:none;flex-direction:column;gap:10px;"></div>`
    el('viewer').appendChild(canvas)
  }
  const showMode = () => {
    const isWord = state.mode === 'word'
    el('docWordCanvas').style.display = isWord ? 'block' : 'none'
    el('docSlides').style.display = isWord ? 'none' : 'flex'
    el('docWordTools').style.display = isWord ? 'flex' : 'none'
    el('docPptTools').style.display = isWord ? 'none' : 'flex'
  }
  const show = () => { el('docCanvasWrap').style.display = 'block'; el('pdfContainer').style.display = 'none'; el('dropZone').style.display = 'none'; showMode() }
  const hide = () => { el('docCanvasWrap').style.display = 'none'; el('pdfContainer').style.display = '' }

  el('dNewWord').onclick = () => { resetWord(); show() }
  el('dNewPpt').onclick = () => { resetPpt(); show() }
  el('dOpenWord').onchange = async (e) => { if (e.target.files[0]) { await openWord(e.target.files[0]); show() } }
  el('dOpenPpt').onchange = async (e) => { if (e.target.files[0]) { await openPpt(e.target.files[0]); show() } }
  el('dAddSlide').onclick = addSlide
  el('dSaveWord').onclick = saveWord
  el('dSavePpt').onclick = savePpt
  el('dSavePdf').onclick = savePdfFromDoc
  el('dSavePdf2').onclick = savePdfFromDoc
  tab.querySelectorAll('[data-fmt]').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); document.execCommand(b.dataset.fmt) })
  tab.querySelectorAll('[data-blk]').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); const v = b.dataset.blk; document.execCommand('formatBlock', false, v === 'UL' ? 'UL' : v === 'P' ? 'P' : v) })
  // clicking the Docs tab hides the PDF canvas; other tabs restore it
  document.querySelector('.side-tabs')?.addEventListener('click', (ev) => {
    const t = ev.target.closest('.side-tab')
    if (!t) return
    if (t.dataset.tab === 'docs') { if (!el('docCanvasWrap').style.display || el('docCanvasWrap').style.display === 'none') { show() } }
    else hide()
  })
}

;(() => {
  const tabs = document.querySelector('.side-tabs')
  if (tabs && !tabs.querySelector('[data-tab="docs"]')) {
    const b = document.createElement('button')
    b.className = 'side-tab'; b.dataset.tab = 'docs'; b.textContent = 'Docs'
    const conv = tabs.querySelector('[data-tab="convert"]')
    if (conv) conv.after(b); else tabs.appendChild(b)
    const p = document.createElement('div'); p.id = 'tab-docs'; p.className = 'hidden'
    el('sidebar').appendChild(p)
  }
  setupDocsTab()
  // Docs menu
  let m = document.querySelector('#menubar [data-menu="docs"]')
  if (!m) {
    m = document.createElement('div'); m.className = 'menu'; m.dataset.menu = 'docs'
    m.innerHTML = `<button class="menu-btn">Docs</button><div class="menu-drop">
      <button data-act="docs-new-word">📄 New Word Document</button>
      <button data-act="docs-new-ppt">📊 New PowerPoint</button>
      <button data-act="docs-open-word">📂 Open Word (.docx)…</button>
      <button data-act="docs-open-ppt">📂 Open PowerPoint (.pptx)…</button>
    </div>`
    const conv = document.querySelector('#menubar [data-menu="convert"]')
    if (conv) conv.before(m); else document.getElementById('menubar').appendChild(m)
    m.querySelector('.menu-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      const was = m.classList.contains('open')
      document.querySelectorAll('#menubar .menu.open').forEach((x) => x.classList.remove('open'))
      if (!was) m.classList.add('open')
    })
    m.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      document.querySelectorAll('#menubar .menu.open').forEach((x) => x.classList.remove('open'))
      document.querySelector('.side-tab[data-tab="docs"]')?.click()
      const map = { 'docs-new-word': 'dNewWord', 'docs-new-ppt': 'dNewPpt' }
      if (map[btn.dataset.act]) el(map[btn.dataset.act])?.click()
      else if (btn.dataset.act === 'docs-open-word') el('dOpenWord')?.click()
      else if (btn.dataset.act === 'docs-open-ppt') el('dOpenPpt')?.click()
    }))
  }
})()

reg('docs-new-word', () => { document.querySelector('.side-tab[data-tab="docs"]')?.click(); el('dNewWord')?.click() })
reg('docs-new-ppt', () => { document.querySelector('.side-tab[data-tab="docs"]')?.click(); el('dNewPpt')?.click() })
reg('docs-open-word', () => el('dOpenWord')?.click())
reg('docs-open-ppt', () => el('dOpenPpt')?.click())

export { openWord, openPpt, resetWord, resetPpt }
