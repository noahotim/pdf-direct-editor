// pro-convert: LOCAL conversion hub — PDF ↔ Word, PDF ↔ PowerPoint + Summary exports
// Free/open-source only (docx, pptxgenjs, jszip, mammoth). No paid API, no upload.
// Reading order (top→bottom, left→right, multi-column aware) is preserved so the
// wording and page order do NOT get disorganised.
import { E, status, reg, openDialog, downloadBytes, pickFiles, taskBegin, setBar } from './pro-core.js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { summarize, detectSections } from './brain-utils.js'

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// ================= reading-order text extraction (columns aware) =================
function groupIntoLines(items, tol) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    let ln = lines.find((l) => Math.abs(l.y - it.y) <= tol)
    if (!ln) { ln = { y: it.y, items: [] }; lines.push(ln) }
    ln.items.push(it)
    ln.y = (ln.y * (ln.items.length - 1) + it.y) / ln.items.length
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x)
    l.text = l.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
    l.size = Math.max(...l.items.map((i) => i.size || 10))
    l.x = Math.min(...l.items.map((i) => i.x))
  }
  lines.sort((a, b) => b.y - a.y)
  return lines
}
function detectGutter(items, width) {
  for (let g = width * 0.38; g <= width * 0.62; g += 4) {
    const crossing = items.filter((it) => it.x < g && it.x + it.w > g).length
    const left = items.filter((it) => it.x + it.w <= g).length
    const right = items.filter((it) => it.x >= g).length
    if (crossing === 0 && left >= 4 && right >= 4) return g
  }
  return null
}
async function extractOrderedPages(onLog) {
  const e = E()
  const pages = []
  for (let i = 1; i <= e.totalPages; i++) {
    const page = await e.pdfDocProxy.getPage(i)
    const { width } = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const items = (tc.items || []).map((it) => {
      const size = Math.hypot(it.transform[2] || 0, it.transform[3] || 0) || it.height || 10
      return { str: it.str || '', x: it.transform[4], y: it.transform[5], w: it.width || (it.str || '').length * size * 0.5, size }
    }).filter((it) => it.str.trim())
    const sizes = items.map((it) => it.size).sort((a, b) => a - b)
    const med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10
    const tol = Math.max(3, med * 0.5)
    const gutter = detectGutter(items, width)
    let lines
    if (gutter) {
      const left = groupIntoLines(items.filter((it) => it.x + it.w <= gutter), tol)
      const right = groupIntoLines(items.filter((it) => it.x >= gutter), tol)
      lines = [...left, ...right] // read left column fully, then right column (per page)
    } else {
      lines = groupIntoLines(items, tol)
    }
    const medLine = lines.length ? lines.map((l) => l.size).sort((a, b) => a - b)[Math.floor(lines.length / 2)] : med
    lines.forEach((l) => { l.big = l.size >= medLine * 1.2 })
    pages.push({ n: i, lines, text: lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim(), twoCol: !!gutter })
    if (onLog && i % 5 === 0) onLog(`extracted page ${i}/${e.totalPages}`)
  }
  return pages
}
async function getDocTitle(pages) {
  const e = E()
  try { const t = e.pdfLibDoc.getTitle(); if (t && t.trim()) return t.trim() } catch {}
  const first = pages[0]
  if (first) {
    const big = first.lines.filter((l) => l.big && l.text.length > 6 && l.text.length < 120)
    if (big.length) return big[0].text
    if (first.lines[0]) return first.lines[0].text.slice(0, 100)
  }
  return (window.__docName || 'Document').replace(/\.pdf$/i, '')
}

// ================= PDF → Word (ordered, headings) =================
async function pdfToDocx() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } = await import('docx')
  const t = taskBegin('PDF → Word')
  try {
    t.log('Extracting text in reading order…')
    const pages = await extractOrderedPages((m) => t.log(m))
    const title = await getDocTitle(pages)
    const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 240 } })]
    pages.forEach((p, pi) => {
      if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(new Paragraph({ children: [new TextRun({ text: `— Page ${p.n} —`, italics: true, color: '94a3b8', size: 16 })], spacing: { after: 120 } }))
      if (!p.lines.length) { children.push(new Paragraph({ text: '(no text on this page — likely scanned)', italics: true })); return }
      for (const l of p.lines) {
        const isHeading = l.big && l.text.length < 90 && !/[.!?]$/.test(l.text)
        children.push(new Paragraph({
          children: [new TextRun({ text: l.text, bold: isHeading, size: isHeading ? 28 : 22 })],
          heading: isHeading ? HeadingLevel.HEADING_2 : undefined,
          spacing: { after: isHeading ? 160 : 80 }
        }))
      }
    })
    const doc = new Document({ creator: 'BOTIM DOCSHUB by Otim Noah', title, sections: [{ properties: {}, children }] })
    const out = await Packer.toBlob(doc)
    downloadBlob(out, (window.__docName || 'document').replace(/\.pdf$/i, '') + '.docx')
    t.done(`PDF → Word: ${pages.length} pages in correct order, fully editable`)
  } catch (err) { t.done('Failed: ' + err.message) }
}

// ================= PDF → PowerPoint (SUMMARISED slides) =================
async function pdfToPptx() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const mode = await openDialog('PDF → PowerPoint', [
    { key: 'mode', label: 'Slide style', type: 'select', value: 'summary', options: [{ value: 'summary', label: 'Summarised slides (recommended)' }, { value: 'full', label: 'Full text (one slide per page)' }] },
    { key: 'bullets', label: 'Bullets per slide (summary)', type: 'number', value: 6, min: 3, max: 10 }
  ], 'Convert')
  if (!mode) return
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'BOTIM DOCSHUB by Otim Noah'
  const t = taskBegin('PDF → PowerPoint')
  try {
    t.log('Extracting text in reading order…')
    const pages = await extractOrderedPages((m) => t.log(m))
    const title = await getDocTitle(pages)
    pptx.title = title
    if (mode.mode === 'full') {
      pages.forEach((p, i) => {
        const slide = pptx.addSlide()
        slide.addText(title, { x: 0.3, y: 0.15, w: 9.4, h: 0.4, fontSize: 11, color: '64748b', align: 'center' })
        slide.addText(`Page ${p.n}`, { x: 0.4, y: 0.6, w: 9.2, h: 0.4, fontSize: 13, bold: true, color: '1e293b' })
        slide.addText(p.text.slice(0, 4000) || '(no text)', { x: 0.4, y: 1.1, w: 9.2, h: 4.3, fontSize: 10, color: '0f172a', valign: 'top' })
        t.log(`slide ${i + 1}/${pages.length}`); setBar(((i + 1) / pages.length) * 100)
      })
    } else {
      // summarised: title slide + section slides + topics
      const sum = summarize(pages.map((p) => ({ text: p.text })), 30, 12)
      const secs = detectSections(pages)
      const s1 = pptx.addSlide()
      s1.background = { color: '0B1224' }
      s1.addText(title, { x: 0.5, y: 1.8, w: 9, h: 1.2, fontSize: 30, bold: true, color: 'FFFFFF', align: 'center' })
      s1.addText(`Local summary • ${pages.length} pages • BOTIM DOCSHUB`, { x: 0.5, y: 3.1, w: 9, h: 0.5, fontSize: 12, color: '93c5fd', align: 'center' })
      t.log('title slide'); setBar(10)
      const bullets = mode.bullets | 0 || 6
      if (secs.length >= 2) {
        for (let i = 0; i < secs.length; i++) {
          const start = secs[i].page
          const end = i + 1 < secs.length ? secs[i + 1].page : pages.length
          const rangePages = pages.filter((p) => p.n >= start && p.n <= end)
          const rs = summarize(rangePages.map((p) => ({ text: p.text })), bullets, 6)
          const slide = pptx.addSlide()
          slide.addText(secs[i].title.slice(0, 80), { x: 0.4, y: 0.3, w: 9.2, h: 0.7, fontSize: 20, bold: true, color: '1e3a8a' })
          const b = (rs.top.length ? rs.top : [rangePages.map((p) => p.text).join(' ').slice(0, 300)]).map((s) => ({ text: s.slice(0, 180), options: { bullet: true, fontSize: 12, color: '0f172a' } }))
          slide.addText(b, { x: 0.5, y: 1.1, w: 9, h: 4.2, valign: 'top', lineSpacingMultiple: 1.2 })
          t.log(`section slide ${i + 1}/${secs.length}`); setBar(10 + ((i + 1) / secs.length) * 80)
        }
      } else {
        const chunks = []
        for (let i = 0; i < sum.top.length; i += bullets) chunks.push(sum.top.slice(i, i + bullets))
        chunks.forEach((ch, i) => {
          const slide = pptx.addSlide()
          slide.addText(`Key Points (${i + 1}/${chunks.length})`, { x: 0.4, y: 0.3, w: 9.2, h: 0.7, fontSize: 20, bold: true, color: '1e3a8a' })
          slide.addText(ch.map((s) => ({ text: s.slice(0, 200), options: { bullet: true, fontSize: 12, color: '0f172a' } })), { x: 0.5, y: 1.1, w: 9, h: 4.2, valign: 'top', lineSpacingMultiple: 1.2 })
          t.log(`points slide ${i + 1}/${chunks.length}`); setBar(10 + ((i + 1) / chunks.length) * 80)
        })
      }
      const topics = pptx.addSlide()
      topics.addText('Key Topics', { x: 0.4, y: 0.3, w: 9.2, h: 0.7, fontSize: 20, bold: true, color: '1e3a8a' })
      topics.addText(sum.terms.map((k) => ({ text: k, options: { bullet: true, fontSize: 14, color: '0f172a' } })), { x: 0.5, y: 1.1, w: 9, h: 4.2, valign: 'top' })
      t.log('topics slide')
    }
    const out = await pptx.write({ outputType: 'blob' })
    downloadBlob(out, (window.__docName || 'document').replace(/\.pdf$/i, '') + '.pptx')
    t.done(mode.mode === 'full' ? 'PowerPoint: one editable slide per page (order preserved)' : 'PowerPoint: summarised slides created')
  } catch (err) { t.done('Failed: ' + err.message) }
}

// ================= Summary → Word (survey/summarise the PDF) =================
async function pdfSummaryToWord() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')
  const t = taskBegin('Summary → Word')
  try {
    t.log('Surveying the document…')
    const pages = await extractOrderedPages((m) => t.log(m))
    const title = await getDocTitle(pages)
    const sum = summarize(pages.map((p) => ({ text: p.text })), 14, 12)
    const secs = detectSections(pages)
    const children = [
      new Paragraph({ text: `${title}`, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: `Local summary — ${pages.length} pages, ${sum.stats.words} words. Generated by BOTIM DOCSHUB (offline, extractive).`, italics: true, color: '64748b', size: 18 })], spacing: { after: 240 } })
    ]
    if (secs.length) {
      children.push(new Paragraph({ text: 'Contents', heading: HeadingLevel.HEADING_1 }))
      secs.forEach((s, i) => children.push(new Paragraph({ text: `${i + 1}. ${s.title}  (page ${s.page})`, spacing: { after: 60 } })))
    }
    children.push(new Paragraph({ text: 'Key Points', heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }))
    sum.top.forEach((s) => children.push(new Paragraph({ children: [new TextRun({ text: s })], bullet: { level: 0 }, spacing: { after: 100 } })))
    children.push(new Paragraph({ text: 'Key Topics', heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }))
    children.push(new Paragraph({ children: [new TextRun({ text: sum.terms.join(' • '), color: '1e3a8a' })] }))
    const doc = new Document({ creator: 'BOTIM DOCSHUB by Otim Noah', title: `${title} — Summary`, sections: [{ properties: {}, children }] })
    downloadBlob(await Packer.toBlob(doc), (window.__docName || 'document').replace(/\.pdf$/i, '') + '-summary.docx')
    t.done('Summary Word document created (editable)')
  } catch (err) { t.done('Failed: ' + err.message) }
}

// ================= Word (DOCX) → PDF =================
async function docxToPdf(files) {
  const list = files || await pickFiles('.docx', true)
  if (!list.length) return
  const mammoth = await import('mammoth')
  const t = taskBegin('Word → PDF')
  let k = 0
  for (const f of list) {
    try {
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() })
      const text = html.replace(/<\/(p|h[1-6]|li|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
      const d = await PDFDocument.create()
      const font = await d.embedFont(StandardFonts.Helvetica)
      const bold = await d.embedFont(StandardFonts.HelveticaBold)
      const W = 595, H = 842, M = 50, LH = 15
      let page = d.addPage([W, H]), y = H - M
      page.drawText(f.name.replace(/\.docx$/i, ''), { x: M, y, size: 13, font: bold, color: rgb(0.25, 0.25, 0.25) }); y -= 26
      for (const para of text.split('\n')) {
        if (!para.trim()) { y -= LH; if (y < M) { page = d.addPage([W, H]); y = H - M } continue }
        const words = para.split(/\s+/)
        let line = ''
        for (const w of words) {
          const test = line ? line + ' ' + w : w
          if (font.widthOfTextAtSize(test, 11) > W - 2 * M) {
            if (y < M + LH) { page = d.addPage([W, H]); y = H - M }
            page.drawText(line, { x: M, y, size: 11, font, color: rgb(0, 0, 0) }); y -= LH
            line = w
          } else line = test
        }
        if (line) { if (y < M + LH) { page = d.addPage([W, H]); y = H - M } page.drawText(line, { x: M, y, size: 11, font, color: rgb(0, 0, 0) }); y -= LH }
      }
      downloadBytes(await d.save(), f.name.replace(/\.docx$/i, '') + '.pdf')
      t.log(`✓ ${f.name} → PDF`)
    } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
    setBar((++k / list.length) * 100)
  }
  t.done(`Word → PDF done for ${list.length} file(s)`)
}

// ================= PPTX → PDF =================
async function pptxToPdf(files) {
  const list = files || await pickFiles('.pptx', true)
  if (!list.length) return
  const JSZip = (await import('jszip')).default
  const t = taskBegin('PowerPoint → PDF')
  let k = 0
  for (const f of list) {
    try {
      const zip = await JSZip.loadAsync(await f.arrayBuffer())
      const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)[1], 10), nb = parseInt(b.match(/(\d+)/)[1], 10); return na - nb
      })
      const d = await PDFDocument.create()
      const font = await d.embedFont(StandardFonts.Helvetica)
      for (let si = 0; si < slideFiles.length; si++) {
        const xml = await zip.files[slideFiles[si]].async('text')
        // preserve paragraph/line order: <a:p> blocks then <a:t> runs inside
        const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => x[1]).join('')).filter((s) => s.trim())
        const page = d.addPage([960, 540])
        let y = 500
        page.drawText(`Slide ${si + 1}`, { x: 20, y: 512, size: 9, font, color: rgb(0.6, 0.6, 0.6) })
        for (const p of paras) {
          if (y < 30) break
          let line = '', W = 920, M = 20, LH = 13
          for (const w of p.split(/\s+/)) {
            const test = line ? line + ' ' + w : w
            if (font.widthOfTextAtSize(test, 11) > W) { page.drawText(line, { x: M, y, size: 11, font, color: rgb(0, 0, 0) }); y -= LH; line = w }
            else line = test
          }
          if (line) { page.drawText(line, { x: 20, y, size: 11, font, color: rgb(0, 0, 0) }); y -= LH + 4 }
        }
      }
      downloadBytes(await d.save(), f.name.replace(/\.pptx$/i, '') + '.pdf')
      t.log(`✓ ${f.name} → PDF (${slideFiles.length} slides)`)
    } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
    setBar((++k / list.length) * 100)
  }
  t.done(`PowerPoint → PDF done for ${list.length} file(s)`)
}

// ================= UI =================
function setupConvertTab() {
  const tab = document.getElementById('tab-convert')
  if (!tab) return
  tab.innerHTML = `
    <h3>Convert <span style="color:#38bdf8;font-size:11px;">BOTIM DOCSHUB</span></h3>
    <div class="tool-group" style="border-color:#f59e0b;">
      <h4>📄 PDF → Office (editable, order kept)</h4>
      <small style="color:#94a3b8;">Real editable text, reading order + page order preserved (multi-column aware). No images.</small>
      <button id="cPdfWord" class="btn btn-small" style="background:#2563eb;color:#fff;">📄 PDF → Word (.docx)</button>
      <button id="cPdfPpt" class="btn btn-small" style="background:#7c3aed;color:#fff;">📊 PDF → PowerPoint (summarised)</button>
    </div>
    <div class="tool-group" style="border-color:#a855f7;">
      <h4>🧾 Survey & Summarise</h4>
      <small style="color:#94a3b8;">Analyse the whole PDF and generate an editable Word summary (contents, key points, topics).</small>
      <button id="cSummaryWord" class="btn btn-small" style="background:#9333ea;color:#fff;">📝 PDF → Summary Word (.docx)</button>
      <button id="cSummaryPpt" class="btn btn-small" style="background:#7c3aed;color:#fff;">📊 PDF → Summary Slides (.pptx)</button>
    </div>
    <div class="tool-group" style="border-color:#22c55e;">
      <h4>📝 Office → PDF</h4>
      <label class="btn btn-small" style="background:#0ea5e9;color:#fff;text-align:center;">📝 Word (.docx) → PDF <input type="file" id="cWordPdf" accept=".docx" multiple hidden /></label>
      <label class="btn btn-small" style="background:#ea580c;color:#fff;text-align:center;">📊 PowerPoint (.pptx) → PDF <input type="file" id="cPptPdf" accept=".pptx" multiple hidden /></label>
    </div>`
  document.getElementById('cPdfWord')?.addEventListener('click', pdfToDocx)
  document.getElementById('cPdfPpt')?.addEventListener('click', pdfToPptx)
  document.getElementById('cSummaryWord')?.addEventListener('click', pdfSummaryToWord)
  document.getElementById('cSummaryPpt')?.addEventListener('click', pdfToPptx)
  document.getElementById('cWordPdf')?.addEventListener('change', (e) => docxToPdf([...e.target.files]))
  document.getElementById('cPptPdf')?.addEventListener('change', (e) => pptxToPdf([...e.target.files]))
}
;(() => {
  const tabs = document.querySelector('.side-tabs')
  if (tabs && !tabs.querySelector('[data-tab="convert"]')) {
    const b = document.createElement('button')
    b.className = 'side-tab'; b.dataset.tab = 'convert'; b.textContent = 'Convert'
    tabs.appendChild(b)
    const p = document.createElement('div'); p.id = 'tab-convert'; p.className = 'hidden'
    document.getElementById('sidebar').appendChild(p)
  }
  setupConvertTab()
  let convMenu = document.querySelector('#menubar [data-menu="convert"]')
  if (!convMenu) {
    convMenu = document.createElement('div')
    convMenu.className = 'menu'; convMenu.dataset.menu = 'convert'
    convMenu.innerHTML = `<button class="menu-btn">Convert</button><div class="menu-drop">
      <button data-act="conv-pdf-word">📄 PDF → Word</button>
      <button data-act="conv-pdf-ppt">📊 PDF → PowerPoint (summarised)</button>
      <button data-act="conv-summary-word">📝 PDF → Summary Word</button>
      <hr/><button data-act="conv-word-pdf">📝 Word → PDF</button>
      <button data-act="conv-ppt-pdf">📊 PowerPoint → PDF</button>
    </div>`
    const intel = document.querySelector('#menubar [data-menu="intel"]')
    if (intel) intel.before(convMenu); else document.getElementById('menubar').appendChild(convMenu)
    convMenu.querySelector('.menu-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      const was = convMenu.classList.contains('open')
      document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'))
      if (!was) convMenu.classList.add('open')
    })
    convMenu.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'))
      const map = { 'conv-pdf-word': pdfToDocx, 'conv-pdf-ppt': pdfToPptx, 'conv-summary-word': pdfSummaryToWord, 'conv-word-pdf': () => document.getElementById('cWordPdf')?.click(), 'conv-ppt-pdf': () => document.getElementById('cPptPdf')?.click() }
      ;(map[btn.dataset.act] || (() => {}))()
    }))
  }
})()

reg('conv-pdf-word', pdfToDocx)
reg('conv-pdf-ppt', pdfToPptx)
reg('conv-summary-word', pdfSummaryToWord)
reg('conv-word-pdf', () => document.getElementById('cWordPdf')?.click())
reg('conv-ppt-pdf', () => document.getElementById('cPptPdf')?.click())

document.getElementById('viewer')?.addEventListener('drop', async (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0]
  if (!f) return
  if (/\.docx$/i.test(f.name)) { e.preventDefault(); e.stopPropagation(); await docxToPdf([f]) }
  if (/\.pptx$/i.test(f.name)) { e.preventDefault(); e.stopPropagation(); await pptxToPdf([f]) }
}, true)

export { pdfToDocx, docxToPdf, pdfToPptx, pptxToPdf, pdfSummaryToWord }
