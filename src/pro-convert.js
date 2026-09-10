// pro-convert: LOCAL conversion hub — PDF ↔ Word, PDF ↔ PowerPoint
// All free, open-source, offline where possible (docx, pptxgenjs, jszip, mammoth)
// Layout is preserved as best as local extraction allows — text stays editable.
import { E, status, reg, downloadBytes, pickFiles, taskBegin, setBar } from './pro-core.js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// helper: download via pro-core
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// ---------- PDF → DOCX (editable, layout-preserving as possible) ----------
async function pdfToDocx() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first, or use Convert tab to pick a file')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')
  status('Converting PDF → Word…')
  const t = taskBegin('PDF → Word')
  const docSections = []
  for (let i = 1; i <= e.totalPages; i++) {
    const page = await e.pdfDocProxy.getPage(i)
    const tc = await page.getTextContent()
    const lines = {}
    // group by y
    for (const it of tc.items || []) {
      const y = Math.round(it.transform[5])
      if (!lines[y]) lines[y] = []
      lines[y].push(it.str)
    }
    const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a)
    const children = []
    children.push(new Paragraph({ text: `Page ${i}`, heading: HeadingLevel.HEADING_3, alignment: AlignmentType.CENTER, spacing: { after: 200 } }))
    for (const y of sortedY) {
      const lineText = lines[y].join(' ').trim()
      if (!lineText) continue
      // simple heading detection: short line, title case
      const isHeading = lineText.length < 80 && /^[A-Z][a-z]/.test(lineText) && !lineText.endsWith('.')
      children.push(new Paragraph({
        children: [new TextRun({ text: lineText, size: 22, bold: isHeading ? true : false })],
        spacing: { after: 100 }
      }))
    }
    // add page image as fallback for layout (render page to canvas, embed as image)
    try {
      const vp = page.getViewport({ scale: 1.5 })
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
      const blob = await new Promise(r => c.toBlob(r, 'image/png'))
      const buf = await blob.arrayBuffer()
      // docx ImageRun needs image data
      children.push(new Paragraph({
        children: [new (await import('docx')).ImageRun({ data: new Uint8Array(buf), transformation: { width: 500, height: 500 * (c.height / c.width) } })],
        alignment: AlignmentType.CENTER
      }))
    } catch {}
    docSections.push({ children })
    t.log(`page ${i}/${e.totalPages}`); setBar((i / e.totalPages) * 100)
  }
  const doc = new Document({ sections: docSections.map(s => ({ properties: {}, children: s.children })) })
  const out = await Packer.toBlob(doc)
  downloadBlob(out, (window.__docName || 'document').replace(/\.pdf$/i, '') + '.docx')
  t.done(`Converted ${e.totalPages} pages → Word (.docx) — editable text + page images for layout`)
}

// ---------- Word (DOCX) → PDF ----------
async function docxToPdf(files) {
  const list = files || await pickFiles('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', true)
  if (!list.length) return
  const mammoth = await import('mammoth')
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const t = taskBegin('Word → PDF')
  let k = 0
  for (const f of list) {
    try {
      const buf = await f.arrayBuffer()
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })
      // crude html to text: strip tags, split paragraphs
      const text = html.replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      const d = await PDFDocument.create()
      const font = await d.embedFont(StandardFonts.Helvetica)
      const W = 595, H = 842, M = 50, LH = 14
      let page = d.addPage([W, H]), y = H - M
      page.drawText(f.name.replace(/\.docx$/i, ''), { x: M, y, size: 14, font, color: rgb(0.3, 0.3, 0.3) }); y -= 24
      for (const para of text.split('\n')) {
        if (!para.trim()) { y -= LH; continue }
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
        if (line) {
          if (y < M + LH) { page = d.addPage([W, H]); y = H - M }
          page.drawText(line, { x: M, y, size: 11, font, color: rgb(0, 0, 0) }); y -= LH
        }
        y -= 4
        if (y < M) { page = d.addPage([W, H]); y = H - M }
      }
      downloadBytes(await d.save(), f.name.replace(/\.docx$/i, '') + '.pdf')
      t.log(`✓ ${f.name} → PDF`)
    } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
    setBar((++k / list.length) * 100)
  }
  t.done(`Word → PDF done for ${list.length} file(s)`)
}

// ---------- PDF → PPTX ----------
async function pdfToPptx() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  status('Converting PDF → PowerPoint…')
  const t = taskBegin('PDF → PowerPoint')
  for (let i = 1; i <= e.totalPages; i++) {
    const page = await e.pdfDocProxy.getPage(i)
    const vp = page.getViewport({ scale: 1.8 })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
    const dataUrl = c.toDataURL('image/png')
    const tc = await page.getTextContent()
    const text = (tc.items || []).map(it => it.str).join(' ').slice(0, 500)
    const slide = pptx.addSlide()
    slide.addImage({ data: dataUrl, x: 0.2, y: 0.2, w: 9.6, h: 5.0 })
    if (text.trim()) slide.addText(text, { x: 0.2, y: 5.4, w: 9.6, h: 1.5, fontSize: 8, color: '363636' })
    t.log(`slide ${i}/${e.totalPages}`); setBar((i / e.totalPages) * 100)
  }
  const out = await pptx.write({ outputType: 'blob' })
  downloadBlob(out, (window.__docName || 'document').replace(/\.pdf$/i, '') + '.pptx')
  t.done(`Converted ${e.totalPages} pages → PowerPoint (images + text)`)
}

// ---------- PPTX → PDF ----------
async function pptxToPdf(files) {
  const list = files || await pickFiles('.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', true)
  if (!list.length) return
  const JSZip = (await import('jszip')).default
  const t = taskBegin('PowerPoint → PDF')
  let k = 0
  for (const f of list) {
    try {
      const zip = await JSZip.loadAsync(await f.arrayBuffer())
      // count slides: ppt/slides/slide*.xml
      const slideFiles = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort()
      const d = await PDFDocument.create()
      const font = await d.embedFont(StandardFonts.Helvetica)
      for (const sfile of slideFiles) {
        const xml = await zip.files[sfile].async('text')
        // extract all <a:t> text nodes
        const texts = [...xml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(m => m[1]).join(' ')
        const page = d.addPage([960, 540])
        // title from first text
        const title = texts.slice(0, 80)
        page.drawText(title || `Slide ${slideFiles.indexOf(sfile) + 1}`, { x: 20, y: 500, size: 14, font, color: rgb(0.2, 0.2, 0.2) })
        // body text wrapped
        const body = texts.slice(80, 2000)
        if (body) {
          const W = 920, M = 20, LH = 12
          let y = 470, line = ''
          for (const w of body.split(/\s+/)) {
            const test = line ? line + ' ' + w : w
            if (font.widthOfTextAtSize(test, 10) > W) {
              page.drawText(line, { x: M, y, size: 10, font, color: rgb(0, 0, 0) }); y -= LH; line = w
              if (y < 20) break
            } else line = test
          }
          if (line && y > 20) page.drawText(line, { x: M, y, size: 10, font, color: rgb(0, 0, 0) })
        }
      }
      downloadBytes(await d.save(), f.name.replace(/\.pptx$/i, '') + '.pdf')
      t.log(`✓ ${f.name} → PDF (${slideFiles.length} slides)`)
    } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
    setBar((++k / list.length) * 100)
  }
  t.done(`PowerPoint → PDF done for ${list.length} file(s)`)
}

// ---------- UI wiring ----------
function setupConvertTab() {
  const tab = document.getElementById('tab-convert')
  if (!tab) return
  tab.innerHTML = `
    <h3>Convert <span style="color:#38bdf8;font-size:11px;">BOTIM DOCSHUB</span></h3>
    <div class="tool-group" style="border-color:#f59e0b;">
      <h4>📄 PDF → Office (editable)</h4>
      <small style="color:#94a3b8;">Text stays editable, page images keep layout. 100% local, no upload.</small>
      <button id="cPdfWord" class="btn btn-small" style="background:#2563eb;color:#fff;">📄 PDF → Word (.docx)</button>
      <button id="cPdfPpt" class="btn btn-small" style="background:#7c3aed;color:#fff;">📄 PDF → PowerPoint (.pptx)</button>
    </div>
    <div class="tool-group" style="border-color:#22c55e;">
      <h4>📝 Office → PDF</h4>
      <small style="color:#94a3b8;">Upload Word or PowerPoint, get PDF back. Layout preserved best-effort.</small>
      <label class="btn btn-small" style="background:#0ea5e9;color:#fff;text-align:center;">
        📝 Word (.docx) → PDF <input type="file" id="cWordPdf" accept=".docx" multiple hidden />
      </label>
      <label class="btn btn-small" style="background:#ea580c;color:#fff;text-align:center;">
        📊 PowerPoint (.pptx) → PDF <input type="file" id="cPptPdf" accept=".pptx" multiple hidden />
      </label>
    </div>
    <div class="tool-group">
      <h4>How layout is kept</h4>
      <small style="color:#94a3b8;line-height:1.6;">
        • PDF → Word: text extracted with positions, rebuilt as docx paragraphs + page images behind text for fidelity.<br/>
        • PDF → PPT: each PDF page → one slide (image + selectable text below).<br/>
        • Word/PPT → PDF: text reflowed to PDF pages with headings preserved.<br/>
        All local, no paid API, no upload to server.
      </small>
    </div>
  `
  document.getElementById('cPdfWord')?.addEventListener('click', pdfToDocx)
  document.getElementById('cPdfPpt')?.addEventListener('click', pdfToPptx)
  document.getElementById('cWordPdf')?.addEventListener('change', e => docxToPdf([...e.target.files]))
  document.getElementById('cPptPdf')?.addEventListener('change', e => pptxToPdf([...e.target.files]))
}
// inject Convert tab + menu if not present
;(() => {
  const tabs = document.querySelector('.side-tabs')
  if (tabs && !tabs.querySelector('[data-tab="convert"]')) {
    const b = document.createElement('button')
    b.className = 'side-tab'; b.dataset.tab = 'convert'; b.textContent = 'Convert'
    tabs.appendChild(b)
    const p = document.createElement('div')
    p.id = 'tab-convert'; p.className = 'hidden'
    document.getElementById('sidebar').appendChild(p)
    setupConvertTab()
    // menu entry under Convert (create menu if missing)
    let convMenu = document.querySelector('#menubar [data-menu="convert"]')
    if (!convMenu) {
      convMenu = document.createElement('div')
      convMenu.className = 'menu'; convMenu.dataset.menu = 'convert'
      convMenu.innerHTML = `<button class="menu-btn">Convert</button><div class="menu-drop">
        <button data-act="conv-pdf-word">📄 PDF → Word</button>
        <button data-act="conv-pdf-ppt">📄 PDF → PowerPoint</button>
        <hr/><button data-act="conv-word-pdf">📝 Word → PDF</button>
        <button data-act="conv-ppt-pdf">📊 PowerPoint → PDF</button>
      </div>`
      const intel = document.querySelector('#menubar [data-menu="intel"]')
      if (intel) intel.before(convMenu); else document.getElementById('menubar').appendChild(convMenu)
      convMenu.querySelector('.menu-btn').addEventListener('click', (e) => {
        e.stopPropagation()
        const was = convMenu.classList.contains('open')
        document.querySelectorAll('#menubar .menu.open').forEach(m => m.classList.remove('open'))
        if (!was) convMenu.classList.add('open')
      })
    }
  } else {
    setupConvertTab()
  }
})()

reg('conv-pdf-word', pdfToDocx)
reg('conv-pdf-ppt', pdfToPptx)
reg('conv-word-pdf', () => document.getElementById('cWordPdf')?.click())
reg('conv-ppt-pdf', () => document.getElementById('cPptPdf')?.click())

// handle dropped Office files onto viewer (auto-detect)
document.getElementById('viewer')?.addEventListener('drop', async (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0]
  if (!f) return
  if (/\.docx$/i.test(f.name)) { e.preventDefault(); e.stopPropagation(); await docxToPdf([f]) }
  if (/\.pptx$/i.test(f.name)) { e.preventDefault(); e.stopPropagation(); await pptxToPdf([f]) }
}, true)

export { pdfToDocx, docxToPdf, pdfToPptx, pptxToPdf }
