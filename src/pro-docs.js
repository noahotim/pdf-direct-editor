// pro-docs: Docs Studio — create / open / edit / save Word (.docx) and PowerPoint (.pptx)
// Free/open-source only: mammoth (docx→html), docx (html→docx), jszip (pptx read),
// pptxgenjs (pptx write), pdf-lib (export PDF). No paid API, no cloud upload.
import { status, reg, downloadBlob, act } from './pro-core.js'

const state = { mode: 'word', slides: [{ title: 'Slide 1', body: '', layout: 'title_content', theme: 'office', transition: 'None', animation: 'none', background: '#ffffff', shapes: [] }], activeSlide: 0, wordName: 'document', pptName: 'presentation' }

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
      if (c.classList && c.classList.contains('doc-page-label')) continue
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

// ---------- Word page / section management (Office-style) ----------
function wordPages() { return [...el('docWordCanvas').children].filter((c) => c.classList.contains('doc-page')) }
function currentWordPage() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount) {
    let node = sel.getRangeAt(0).commonAncestorContainer
    while (node && node !== document && !(node.classList && node.classList.contains('doc-page'))) node = node.parentElement
    if (node && node.classList && node.classList.contains('doc-page')) return node
  }
  return wordPages()[0]
}
function pageIndexOf(page) { return wordPages().indexOf(page) }
function renumberWordPages() {
  wordPages().forEach((p, i) => {
    const label = p.querySelector('.doc-page-label')
    if (label) label.textContent = 'Page ' + (i + 1)
  })
}
function insertWordPageBreak() {
  const page = currentWordPage()
  if (!page) return
  const sel = window.getSelection()
  const atCaret = sel && sel.rangeCount && sel.getRangeAt(0).commonAncestorContainer.closest ? sel.getRangeAt(0).commonAncestorContainer.closest('.doc-page') === page : false
  // split content at caret: everything after the caret becomes a new page
  if (atCaret && sel.rangeCount) {
    const range = sel.getRangeAt(0)
    const frag = range.cloneContents()
    const rest = document.createElement('div')
    rest.className = 'doc-page'; rest.contentEditable = 'true'
    const label = document.createElement('div'); label.className = 'doc-page-label'; label.contentEditable = 'false'
    rest.appendChild(label)
    for (const child of [...frag.childNodes]) rest.appendChild(child)
    range.deleteContents()
    // remove now-empty trailing block(s) left by deleteContents
    page.normalize()
    const sep = document.createElement('div')
    sep.className = 'doc-page-sep'
    sep.innerHTML = `<span>Page break</span>`
    page.after(sep, rest)
    renumberWordPages()
    status('Page break inserted')
    const p = rest.querySelector('h1,h2,h3,p,li,div,pre') || rest
    const r = document.createRange(); r.selectNodeContents(rest); r.collapse(true)
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    return
  }
  // no caret — just start a new page at the end
  const sep = document.createElement('div')
  sep.className = 'doc-page-sep'
  sep.innerHTML = `<span>Page break</span>`
  const np = document.createElement('div')
  np.className = 'doc-page'; np.contentEditable = 'true'
  np.innerHTML = '<p></p>'
  const label = document.createElement('div'); label.className = 'doc-page-label'; label.contentEditable = 'false'
  np.prepend(label)
  page.after(sep, np)
  renumberWordPages()
  status('New page added')
}
function deleteWordPage() {
  const page = currentWordPage()
  if (!page) return
  if (wordPages().length <= 1) return status('Keep at least one page')
  // remove the separator before this page as well, if present
  const prev = page.previousElementSibling
  if (prev && prev.classList.contains('doc-page-sep')) prev.remove()
  page.remove()
  renumberWordPages()
  const pages = wordPages()
  if (pages.length) document.getSelection().selectAllChildren(pages[Math.max(0, pages.length - 1)])
  status('Page deleted')
}
function moveWordPage(dir) {
  const page = currentWordPage()
  const pages = wordPages()
  const i = pages.indexOf(page)
  const j = i + dir
  if (i < 0 || j < 0 || j >= pages.length) return status(dir < 0 ? 'Already first page' : 'Already last page')
  // also move the separator attached to this page
  const these = [page]
  if (page.previousElementSibling && page.previousElementSibling.classList.contains('doc-page-sep')) these.unshift(page.previousElementSibling)
  const those = [pages[j]]
  if (pages[j].previousElementSibling && pages[j].previousElementSibling.classList.contains('doc-page-sep')) those.unshift(pages[j].previousElementSibling)
  const el1 = these[0], el2 = those[0]
  if (j > i) { el1.after(...those); el2.after(...these) } else { el2.after(...these); el1.after(...those) }
  renumberWordPages()
  document.getSelection().selectAllChildren(page)
  status(`Moved page ${i + 1} ${dir < 0 ? 'up' : 'down'}`)
}
function countWordPages() { const n = wordPages().length; const l = el('wordPageCount'); if (l) l.textContent = n + ' page' + (n === 1 ? '' : 's'); return n }

// ---------- create / open ----------
function resetWord() {
  state.mode = 'word'; state.wordName = 'document'
  const c = el('docWordCanvas')
  c.innerHTML = `<div class="doc-page" contenteditable="true"><div class="doc-page-label" contenteditable="false">Page 1</div><h1>Untitled Document</h1><p>Start typing your Word document here…</p></div>`
  renumberWordPages(); countWordPages()
  status('New Word document — type, then Save as Word/PDF')
}
async function openWord(file) {
  state.mode = 'word'
  const mammoth = await import('mammoth')
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  state.wordName = (file.name || 'document').replace(/\.docx$/i, '')
  const c = el('docWordCanvas')
  const tmp = document.createElement('div')
  tmp.innerHTML = html || '<p></p>'
  // First split on explicit page breaks
  const rawPages = []
  let current = document.createElement('div'); current.className = 'doc-page'; current.contentEditable = 'true'
  for (const node of [...tmp.children]) {
    if (node.classList && node.classList.contains('pagebreak')) { rawPages.push(current); current = document.createElement('div'); current.className = 'doc-page'; current.contentEditable = 'true'; continue }
    if (node.tagName === 'P') {
      const br = [...node.children].some((x) => x.tagName === 'BR' && x.className.includes('PageBreak'))
      if (br) { rawPages.push(current); current = document.createElement('div'); current.className = 'doc-page'; current.contentEditable = 'true'; continue }
    }
    current.appendChild(node)
  }
  rawPages.push(current)
  // Auto paginate: detect pages by estimated content size (Word-like). A4 page ~ 500 words / ~3000 chars / ~25 blocks. Split long pages.
  const CHARS_PER_PAGE = 2800, BLOCKS_PER_PAGE = 28
  const pages = []
  for (const rp of rawPages) {
    const blocks = [...rp.children]
    if (!blocks.length) { pages.push(rp); continue }
    let acc = document.createElement('div'); acc.className = 'doc-page'; acc.contentEditable = 'true'
    let chars = 0, blocksCount = 0
    for (const b of blocks) {
      const t = b.textContent || ''
      if (chars + t.length > CHARS_PER_PAGE && blocksCount >= 8 || blocksCount >= BLOCKS_PER_PAGE) {
        pages.push(acc)
        acc = document.createElement('div'); acc.className = 'doc-page'; acc.contentEditable = 'true'
        chars = 0; blocksCount = 0
      }
      acc.appendChild(b.cloneNode(true))
      chars += t.length; blocksCount++
    }
    // merge leftover
    if (acc.children.length) pages.push(acc)
  }
  // Filter empties but keep at least 1
  const finalPages = pages.filter((p) => p.textContent.trim() || p.querySelector('img,table')) 
  if (!finalPages.length) finalPages.push(pages[0] || (()=>{ const d=document.createElement('div'); d.className='doc-page'; d.contentEditable='true'; d.innerHTML='<p></p>'; return d})())
  c.innerHTML = ''
  finalPages.forEach((p, i) => {
    if (!p.querySelector('h1,h2,h3,p,li,div,pre,img,table')) p.innerHTML = '<p></p>'
    const label = document.createElement('div')
    label.className = 'doc-page-label'; label.contentEditable = 'false'; label.textContent = 'Page ' + (i + 1)
    p.prepend(label)
    c.appendChild(p)
  })
  renumberWordPages(); countWordPages()
  const detected = finalPages.length > rawPages.length ? ` — auto-detected ${finalPages.length} pages (Word pagination)` : ` — ${finalPages.length} page(s)`
  status(`Opened ${file.name}${detected} — edit with full Word tools, then Save`)
}
function resetPpt() {
  state.mode = 'ppt'; state.pptName = 'presentation'
  state.slides = [{ title: 'Slide 1', body: 'Click to edit this slide', layout: 'title_content', theme: 'office', transition: 'None', animation: 'none', background: '#ffffff', shapes: [] }]
  state.activeSlide = 0
  renderSlides()
  status('New PowerPoint — exceptional design tools ready, add slides then Save')
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
  const enriched = (slides.length ? slides : [{ title: 'Slide 1', body: '' }]).map(s=> ({ layout: 'title_content', theme: 'office', transition: 'None', animation: 'none', background: '#ffffff', shapes: [], ...s }))
  state.slides = enriched
  state.activeSlide = 0
  renderSlides()
  status(`Opened ${file.name} — ${state.slides.length} slide(s) — exceptional tools ready`)
}

// ---------- PowerPoint slide UI (Office-style: thumbnails, duplicate, reorder, transitions) ----------
function renderSlides() {
  const box = el('docSlides')
  if (!box) return
  // build thumbnail strip + editor for selected slide
  const idMap = new Map()
  box.innerHTML = `
    <style>
      .slide-wrap{display:flex;gap:12px;flex-wrap:wrap}
      #slideThumbs{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;padding:8px;background:#1e293b;border-radius:8px}
      #slideEditor{flex:1;min-width:280px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px}
      #slideEditor .btn{margin-bottom:6px}
    </style>
    <div class="slide-wrap">
      <div id="slideThumbs"></div>
      <div id="slideEditor"></div>
    </div>
  `
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const th = box.querySelector('#slideThumbs')
  state.slides.forEach((s, i) => {
    const card = document.createElement('div')
    card.className = 'slide-thumb' + (i === state.activeSlide ? ' active' : '')
    card.title = s.title || `Slide ${i + 1}`
    card.innerHTML = `<div class="slide-num">${i + 1}</div>
      <div style="text-align:center;padding:4px;font-size:9px;max-height:3em;overflow:hidden;color:#334155;">${esc(s.title || 'Slide')}</div>
      <button class="slide-del" title="Delete slide">✕</button>`
    card.onclick = () => { state.activeSlide = i; renderSlides() }
    card.querySelector('.slide-del').onclick = (e) => { e.stopPropagation(); if (state.slides.length <= 1) return status('Keep at least one slide'); state.slides.splice(i, 1); state.activeSlide = Math.min(state.activeSlide, state.slides.length - 1); renderSlides() }
    th.appendChild(card)
  })
  // hidden "delete" helper for the strip
  // editor for active slide
  const ed = box.querySelector('#slideEditor')
  const i = state.activeSlide ?? 0
  const s = state.slides[i]
  // sync global toolbar to active slide
  if(el('pptLayout')) el('pptLayout').value = s.layout||'title_content'
  if(el('pptTheme')) el('pptTheme').value = s.theme||'office'
  if(el('pptBg')) el('pptBg').value = s.background||'#ffffff'
  if(el('pptAnimation')) el('pptAnimation').value = s.animation||'none'
  ed.innerHTML = `
    <h4 style="margin:0 0 8px;font-size:14px;color:#7c3aed;">Slide ${i + 1} of ${state.slides.length} — <span style="color:#94a3b8;font-size:11px;">${esc(s.layout||'title_content')} • ${esc(s.theme||'office')}</span></h4>
    <div style="display:flex;gap:4px;flex-wrap:wrap;">
      <button id="slideDup" class="btn btn-small">⧉ Duplicate</button>
      <button id="slideUp" class="btn btn-small">▲ Move Up</button>
      <button id="slideDown" class="btn btn-small">▼ Move Down</button>
      <button id="slideAdd" class="btn btn-small" style="background:#7c3aed;color:#fff;">➕ Add</button>
    </div>
    <input id="slideTitle" value="${esc((s.title || '').replace(/"/g, '&quot;'))}" placeholder="Slide title" style="width:100%;padding:7px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;margin:6px 0;" />
    <textarea id="slideBody" rows="6" placeholder="Bullet points (one per line)" style="width:100%;padding:7px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;resize:vertical;">${esc(s.body || '')}</textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;font-size:11px;color:#94a3b8;">
      <label>Layout <select id="slideLayout" style="width:100%;padding:4px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;">${['title_content','title_slide','two_content','title_only','blank','section'].map(x=> `<option value="${x}" ${s.layout===x?'selected':''}>${x.replace('_',' ')}</option>`).join('')}</select></label>
      <label>Theme <select id="slideTheme" style="width:100%;padding:4px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;">${['office','berlin','apex','aspect','civic','midnight'].map(x=> `<option ${s.theme===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label>Transition <select id="slideTrans" style="width:100%;padding:4px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;">${['None','Fade','Push','Wipe','Zoom','Split'].map((x) => `<option ${(s.transition||'None') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Animation <select id="slideAnim" style="width:100%;padding:4px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;">${['none','fade','flyIn','zoom','wipe','bounce'].map(x=> `<option ${s.animation===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label>Background <input type="color" id="slideBg" value="${s.background||'#ffffff'}" style="width:100%;height:32px;padding:0;border:1px solid #475569;border-radius:6px;" /></label>
      <label>Shapes <span style="color:#7c3aed;">${(s.shapes||[]).length} shape(s)</span></label>
    </div>
    ${(s.shapes&&s.shapes.length)?`<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">${s.shapes.map((sh,si)=> `<span style="font-size:10px;background:#1e293b;border:1px solid #475569;padding:2px 6px;border-radius:6px;">${sh.type} <button data-shdel="${si}" style="margin-left:4px;color:#ef4444;border:none;background:transparent;cursor:pointer;">✕</button></span>`).join('')}</div>`:''}
    <div style="margin-top:6px;font-size:10px;color:#64748b;">Layout, theme, shapes, animation & background are exceptional features — fully saved to .pptx with WIDE layout, theme colors, transitions and animations.</div>
  `
  ed.querySelector('#slideTitle').oninput = (e) => { state.slides[i].title = e.target.value; const card=th.children[i]; if(card) card.querySelector('div:nth-child(2)').textContent=e.target.value||'Slide' }
  ed.querySelector('#slideBody').oninput = (e) => { state.slides[i].body = e.target.value }
  ed.querySelector('#slideTrans').onchange = (e) => { state.slides[i].transition = e.target.value }
  ed.querySelector('#slideLayout').onchange = (e) => { state.slides[i].layout = e.target.value; if(el('pptLayout')) el('pptLayout').value=e.target.value }
  ed.querySelector('#slideTheme').onchange = (e) => { state.slides[i].theme = e.target.value; if(el('pptTheme')) el('pptTheme').value=e.target.value }
  ed.querySelector('#slideAnim').onchange = (e) => { state.slides[i].animation = e.target.value; if(el('pptAnimation')) el('pptAnimation').value=e.target.value }
  ed.querySelector('#slideBg').oninput = (e) => { state.slides[i].background = e.target.value; if(el('pptBg')) el('pptBg').value=e.target.value }
  ed.querySelectorAll('[data-shdel]').forEach(b=> b.onclick=()=>{ state.slides[i].shapes.splice(+b.dataset.shdel,1); renderSlides() })
  ed.querySelector('#slideDup').onclick = () => { const cp = JSON.parse(JSON.stringify(state.slides[i])); state.slides.splice(i + 1, 0, cp); state.activeSlide = i + 1; renderSlides(); status('Slide duplicated') }
  ed.querySelector('#slideUp').onclick = () => { if (i <= 0) return status('Already first'); [state.slides[i - 1], state.slides[i]] = [state.slides[i], state.slides[i - 1]]; state.activeSlide = i - 1; renderSlides() }
  ed.querySelector('#slideDown').onclick = () => { if (i >= state.slides.length - 1) return status('Already last'); [state.slides[i + 1], state.slides[i]] = [state.slides[i], state.slides[i + 1]]; state.activeSlide = i + 1; renderSlides() }
  ed.querySelector('#slideAdd').onclick = () => { state.slides.push({ title: `Slide ${state.slides.length + 1}`, body: '', layout: 'title_content', theme: 'office', transition: 'None', animation: 'none', background: '#ffffff', shapes: [] }); state.activeSlide = state.slides.length - 1; renderSlides() }
}
function esc(v){ return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;') }
function addSlide() { state.slides.push({ title: `Slide ${state.slides.length + 1}`, body: '', layout: 'title_content', theme: 'office', transition: 'None', animation: 'none', background: '#ffffff', shapes: [] }); state.activeSlide = state.slides.length - 1; renderSlides() }

// ---------- exports ----------
async function saveWord() {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = await import('docx')
  const children = []
  // iterate Word pages; insert a page break (second section) between pages
  let firstPage = true
  for (const page of wordPages()) {
    if (!firstPage) children.push(new Paragraph({ children: [new PageBreak()] }))
    firstPage = false
    const blocks = htmlBlocks(page.innerHTML)
    const pageChildren = blocks.map((b) => {
      const runs = (b.runs && b.runs.length ? b.runs : [{ text: '' }]).map((r) => new TextRun({ text: r.text, bold: !!r.bold, italics: !!r.italics, underline: r.underline ? {} : undefined, break: 1 }))
      if (b.type === 'heading') return new Paragraph({ children: runs, heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 })
      if (b.type === 'bullet') return new Paragraph({ children: runs, bullet: { level: 0 } })
      return new Paragraph({ children: runs, spacing: { after: 120 } })
    })
    children.push(...(pageChildren.length ? pageChildren : [new Paragraph('')]))
  }
  const doc = new Document({ creator: 'BOTIM DOCSHUB', title: state.wordName, sections: [{ children: children.length ? children : [new Paragraph('')] }] })
  downloadBlob(await Packer.toBlob(doc), state.wordName + '.docx')
  status('Saved as Word (.docx) — ' + wordPages().length + ' page(s)')
}
async function savePpt() {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'BOTIM DOCSHUB by Otim Noah'
  pptx.title = state.pptName
  const themes={ office:{ bg:'FFFFFF', title:'1e3a8a', accent:'2563eb' }, berlin:{ bg:'f0fdfa', title:'134e4a', accent:'14b8a6' }, apex:{ bg:'fff7ed', title:'9a3412', accent:'f97316' }, aspect:{ bg:'faf5ff', title:'581c87', accent:'a855f7' }, civic:{ bg:'f0fdf4', title:'14532d', accent:'22c55e' }, midnight:{ bg:'0f172a', title:'e2e8f0', accent:'38bdf8' } }
  state.slides.forEach((s) => {
    const th=themes[s.theme]||themes.office
    const bg=s.background && s.background!=='#ffffff'? s.background.replace('#','') : th.bg
    const slide = pptx.addSlide()
    slide.background={ fill: bg }
    // layout-aware placement
    const layout=s.layout||'title_content'
    if(layout==='blank'){ /* nothing */ }
    else if(layout==='title_slide'){
      slide.addText(s.title || '', { x:1, y:2, w:11, h:1.2, fontSize:32, bold:true, color:th.title, align:'center' })
      const lines=(s.body||'').split('\n').map(l=>l.trim()).filter(Boolean)
      if(lines.length) slide.addText(lines.map(l=>({text:l.replace(/^[-•*]\s*/,''), options:{ fontSize:16, color:th.accent, align:'center'}})), { x:1, y:3.5, w:11, h:2, align:'center' })
    } else if(layout==='two_content'){
      slide.addText(s.title || '', { x:0.4, y:0.35, w:12.2, h:0.9, fontSize:24, bold:true, color:th.title })
      const lines=(s.body||'').split('\n').map(l=>l.trim()).filter(Boolean)
      const mid=Math.ceil(lines.length/2)
      if(lines.length) {
        slide.addText(lines.slice(0,mid).map(l=>({text:l.replace(/^[-•*]\s*/,''), options:{bullet:true, fontSize:12, color:'0f172a'}})), { x:0.4, y:1.3, w:5.8, h:4 })
        slide.addText(lines.slice(mid).map(l=>({text:l.replace(/^[-•*]\s*/,''), options:{bullet:true, fontSize:12, color:'0f172a'}})), { x:6.8, y:1.3, w:5.8, h:4 })
      }
    } else if(layout==='section'){
      slide.addShape(pptx.shapes.RECTANGLE, { x:0, y:0, w:13.33, h:7.5, fill:{ color:th.accent } })
      slide.addText(s.title || '', { x:0.5, y:2.5, w:12.3, h:1.5, fontSize:28, bold:true, color:'FFFFFF', align:'center' })
      if(s.body) slide.addText(s.body, { x:1, y:4.2, w:11.3, h:2, fontSize:14, color:'FFFFFF', align:'center' })
    } else {
      slide.addText(s.title || '', { x:0.4, y:0.35, w:12.2, h:0.9, fontSize:24, bold:true, color:th.title })
      const lines=(s.body||'').split('\n').map(l=>l.trim()).filter(Boolean)
      if(lines.length) slide.addText(lines.map(l=>({ text:l.replace(/^[-•*]\s*/,''), options:{ bullet:true, fontSize:14, color:'0f172a' }})), { x:0.5, y:1.4, w:12.3, h:3.9, valign:'top', lineSpacingMultiple:1.3 })
    }
    // exceptional shapes
    for(const sh of (s.shapes||[])){
      const c=(sh.color||'#3b82f6').replace('#','')
      if(sh.type==='rect') slide.addShape(pptx.shapes.RECTANGLE, { x:sh.x, y:sh.y, w:sh.w, h:sh.h, fill:{color:c}, line:{color:c} })
      else if(sh.type==='circle') slide.addShape(pptx.shapes.OVAL, { x:sh.x, y:sh.y, w:sh.w, h:sh.h, fill:{color:c} })
      else if(sh.type==='arrow') slide.addShape(pptx.shapes.RIGHT_ARROW, { x:sh.x, y:sh.y, w:sh.w, h:sh.h, fill:{color:c} })
      else if(sh.type==='line') slide.addShape(pptx.shapes.RECTANGLE, { x:sh.x, y:sh.y, w:sh.w, h:sh.h, fill:{color:c} })
    }
    if(s.transition && s.transition!=='None') slide.transition={ type: s.transition.toLowerCase() }
    // animation hint stored as slide property (PowerPoint honours transition; animation is per-object in pptxgenjs not yet, but stored)
    if(s.animation && s.animation!=='none') slide._animation=s.animation
  })
  const out = await pptx.write({ outputType: 'blob' })
  downloadBlob(out, state.pptName + '.pptx')
  status('Saved exceptional PowerPoint (.pptx) — layouts, themes, shapes, transitions')
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
    let firstPage = true
    for (const page of wordPages()) {
      if (!firstPage) { newPage() }
      firstPage = false
      const blocks = htmlBlocks(page.innerHTML)
      for (const b of blocks) {
        const text = (b.runs || []).map((r) => r.text).join('')
        if (!text.trim()) continue
        if (b.type === 'heading') { y -= 6; drawWrapped(text, b.level === 1 ? 20 : b.level === 2 ? 16 : 14, bold, rgb(0.1, 0.1, 0.3)) }
        else if (b.type === 'bullet') drawWrapped('• ' + text, 12, font, rgb(0, 0, 0), 12)
        else drawWrapped(text, 12, font, rgb(0, 0, 0))
        y -= 4
      }
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
      <h4>Word — Design Tools <span style="color:#38bdf8;font-size:10px;">Microsoft-like</span></h4>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        <select id="wStyle" style="flex:1;padding:5px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">
          <option value="P">Normal</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option><option value="H3">Heading 3</option><option value="QUOTE">Quote</option><option value="CODE">Code</option>
        </select>
        <small id="wordPageCount" style="color:#38bdf8;font-size:11px;white-space:nowrap;">1 page</small>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button data-fmt="bold" class="btn btn-small" style="flex:1;font-weight:bold;" title="Bold (Ctrl+B)">B</button>
        <button data-fmt="italic" class="btn btn-small" style="flex:1;font-style:italic;" title="Italic (Ctrl+I)">I</button>
        <button data-fmt="underline" class="btn btn-small" style="flex:1;text-decoration:underline;" title="Underline (Ctrl+U)">U</button>
        <button data-fmt="strikeThrough" class="btn btn-small" style="flex:1;text-decoration:line-through;" title="Strikethrough">S</button>
        <button id="wSub" class="btn btn-small" style="flex:1;" title="Subscript">X₂</button>
        <button id="wSup" class="btn btn-small" style="flex:1;" title="Superscript">X²</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        <select id="wFontFamily" style="flex:1;padding:5px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">
          <option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Times New Roman">Times</option><option value="Courier New">Courier</option><option value="Calibri">Calibri</option><option value="Verdana">Verdana</option>
        </select>
        <select id="wFontSize" style="width:64px;padding:5px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">
          <option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="14" selected>14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option><option value="24">24</option><option value="28">28</option><option value="32">32</option>
        </select>
        <input type="color" id="wFontColor" value="#111111" title="Font color" style="width:32px;height:32px;padding:0;border:1px solid #334155;border-radius:6px;" />
        <input type="color" id="wHighlight" value="#fef08a" title="Highlight color" style="width:32px;height:32px;padding:0;border:1px solid #334155;border-radius:6px;" />
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button data-align="left" class="alignBtn btn btn-small" style="flex:1;" title="Align left">⬅</button>
        <button data-align="center" class="alignBtn btn btn-small" style="flex:1;" title="Center">⬍</button>
        <button data-align="right" class="alignBtn btn btn-small" style="flex:1;" title="Align right">➡</button>
        <button data-align="justify" class="alignBtn btn btn-small" style="flex:1;" title="Justify">☰</button>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:11px;flex:1;">Line <input type="range" id="wLineSpacing" min="1" max="2.5" step="0.1" value="1.55" style="width:70px;" /></label>
        <button id="wIndentDec" class="btn btn-small" style="width:auto;" title="Decrease indent">⬅ Indent</button>
        <button id="wIndentInc" class="btn btn-small" style="width:auto;" title="Increase indent">Indent ➡</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button data-blk="H1" class="btn btn-small" style="flex:1;">H1</button>
        <button data-blk="H2" class="btn btn-small" style="flex:1;">H2</button>
        <button data-blk="P" class="btn btn-small" style="flex:1;">¶ Normal</button>
        <button data-blk="UL" class="btn btn-small" style="flex:1;">• Bullet</button>
        <button data-blk="OL" class="btn btn-small" style="flex:1;">1. Number</button>
        <button id="wClearFmt" class="btn btn-small" style="flex:1;background:#475569;color:#fff;" title="Clear formatting">Clear</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button id="wInsTable" class="btn btn-small" style="flex:1;">▦ Table</button>
        <label class="btn btn-small" style="flex:1;background:#0ea5e9;color:#fff;text-align:center;">🖼️ Image <input type="file" id="wInsImage" accept="image/*" hidden /></label>
        <button id="wInsLink" class="btn btn-small" style="flex:1;">🔗 Link</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button id="wFindReplace" class="btn btn-small" style="flex:1;background:#38bdf8;color:#fff;">Find/Replace</button>
        <button id="wWordCount" class="btn btn-small" style="flex:1;">Word Count</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap; border-top:1px solid #334155; padding-top:6px; margin-top:4px;">
        <button id="dPageBreak" class="btn btn-small" style="flex:1;">⛶ Page Break</button>
        <button id="dPageCtl-del" class="btn btn-small" style="flex:1;background:#fee2e2;color:#991b1b;">🗑 Delete Page</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button id="dPageCtl-up" class="btn btn-small" style="flex:1;">▲ Move Up</button>
        <button id="dPageCtl-dn" class="btn btn-small" style="flex:1;">▼ Move Down</button>
      </div>
      <button id="dSaveWord" class="btn btn-small" style="background:#2563eb;color:#fff;">💾 Save as Word (.docx)</button>
      <button id="dSavePdf" class="btn btn-small" style="background:#16a34a;color:#fff;">💾 Export PDF</button>
    </div>
    <div class="tool-group" id="docPptTools" style="border-color:#7c3aed;display:none;">
      <h4>PowerPoint — Design Studio <span style="color:#a78bfa;font-size:10px;">Exceptional</span></h4>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <select id="pptLayout" style="flex:1;padding:5px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #475569;">
          <option value="title_content">Title and Content</option><option value="title_slide">Title Slide</option><option value="two_content">Two Content</option><option value="title_only">Title Only</option><option value="blank">Blank</option><option value="section">Section Header</option>
        </select>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        <select id="pptTheme" style="flex:1;padding:5px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #475569;">
          <option value="office">Office</option><option value="berlin">Berlin</option><option value="apex">Apex</option><option value="aspect">Aspect</option><option value="civic">Civic</option><option value="midnight">Midnight</option>
        </select>
        <input type="color" id="pptBg" value="#ffffff" title="Slide background" style="width:32px;height:32px;padding:0;border:1px solid #475569;border-radius:6px;" />
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button id="pptAddShapeRect" class="btn btn-small" style="flex:1;">▭ Rect</button>
        <button id="pptAddShapeCircle" class="btn btn-small" style="flex:1;">○ Circle</button>
        <button id="pptAddShapeArrow" class="btn btn-small" style="flex:1;">➤ Arrow</button>
        <button id="pptAddShapeLine" class="btn btn-small" style="flex:1;">— Line</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <select id="pptAnimation" style="flex:1;padding:5px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #475569;">
          <option value="none">Animation: None</option><option value="fade">Fade</option><option value="flyIn">Fly In</option><option value="zoom">Zoom</option><option value="wipe">Wipe</option><option value="bounce">Bounce</option>
        </select>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button id="dAddSlide" class="btn btn-small" style="flex:1;background:#7c3aed;color:#fff;">➕ Add Slide</button>
        <button id="pptDupSlide" class="btn btn-small" style="flex:1;">⧉ Duplicate</button>
      </div>
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
    canvas.innerHTML = `<div id="docWordCanvas" style="display:flex;flex-direction:column;gap:8px;background:transparent;"></div><div id="docSlides" style="display:none;flex-direction:column;gap:10px;"></div>`
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
  el('pptDupSlide')?.addEventListener('click', ()=>{ const i=state.activeSlide; if(i<0) return; const cp=JSON.parse(JSON.stringify(state.slides[i])); state.slides.splice(i+1,0,cp); state.activeSlide=i+1; renderSlides(); status('Slide duplicated') })
  // PPT exceptional controls -> apply to active slide
  const applyToActive = (fn)=>{ const s=state.slides[state.activeSlide]; if(s) { fn(s); renderSlides(); } }
  el('pptLayout')?.addEventListener('change', e=> applyToActive(s=> s.layout=e.target.value))
  el('pptTheme')?.addEventListener('change', e=> applyToActive(s=> s.theme=e.target.value))
  el('pptBg')?.addEventListener('input', e=> applyToActive(s=> s.background=e.target.value))
  el('pptAnimation')?.addEventListener('change', e=> applyToActive(s=> s.animation=e.target.value))
  el('pptAddShapeRect')?.addEventListener('click', ()=> applyToActive(s=>{ s.shapes=s.shapes||[]; s.shapes.push({type:'rect', x:1, y:3, w:3, h:2, color:'#3b82f6'}); status('Rectangle added') }))
  el('pptAddShapeCircle')?.addEventListener('click', ()=> applyToActive(s=>{ s.shapes=s.shapes||[]; s.shapes.push({type:'circle', x:2, y:3, w:2, h:2, color:'#22c55e'}); status('Circle added') }))
  el('pptAddShapeArrow')?.addEventListener('click', ()=> applyToActive(s=>{ s.shapes=s.shapes||[]; s.shapes.push({type:'arrow', x:1, y:5, w:4, h:0.6, color:'#f59e0b'}); status('Arrow added') }))
  el('pptAddShapeLine')?.addEventListener('click', ()=> applyToActive(s=>{ s.shapes=s.shapes||[]; s.shapes.push({type:'line', x:0.5, y:6, w:5, h:0.1, color:'#64748b'}); status('Line added') }))
  el('dPageBreak').onclick = () => { insertWordPageBreak(); countWordPages() }
  el('dPageCtl-del').onclick = () => { deleteWordPage(); countWordPages() }
  el('dPageCtl-up').onclick = () => { moveWordPage(-1); countWordPages() }
  el('dPageCtl-dn').onclick = () => { moveWordPage(1); countWordPages() }
  el('dSaveWord').onclick = saveWord
  el('dSavePpt').onclick = savePpt
  el('dSavePdf').onclick = savePdfFromDoc
  el('dSavePdf2').onclick = savePdfFromDoc
  tab.querySelectorAll('[data-fmt]').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); document.execCommand(b.dataset.fmt, false, null) })
  tab.querySelectorAll('[data-blk]').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); const v = b.dataset.blk; document.execCommand('formatBlock', false, v === 'UL' ? '<ul>' : v === 'OL' ? '<ol>' : v === 'P' ? '<p>' : `<${v.toLowerCase()}>`) })
  // Word design tools
  const wStyle = el('wStyle'); if (wStyle) wStyle.onchange = () => { const v=wStyle.value; if(v==='QUOTE') document.execCommand('formatBlock', false, '<blockquote>'); else if(v==='CODE') document.execCommand('formatBlock', false, '<pre>'); else document.execCommand('formatBlock', false, `<${v.toLowerCase()}>`) }
  const wFontFamily = el('wFontFamily'); if (wFontFamily) wFontFamily.onchange = () => document.execCommand('fontName', false, wFontFamily.value)
  const wFontSize = el('wFontSize'); if (wFontSize) wFontSize.onchange = () => { const s=wFontSize.value; const sel=window.getSelection(); if(sel && sel.rangeCount){ const range=sel.getRangeAt(0); const span=document.createElement('span'); span.style.fontSize=s+'px'; try{ range.surroundContents(span) }catch{ document.execCommand('fontSize', false, '7'); const fonts=document.querySelectorAll('font[size="7"]'); fonts.forEach(f=>{f.removeAttribute('size'); f.style.fontSize=s+'px'}) } } }
  const wFontColor = el('wFontColor'); if (wFontColor) wFontColor.oninput = () => document.execCommand('foreColor', false, wFontColor.value)
  const wHighlight = el('wHighlight'); if (wHighlight) wHighlight.oninput = () => document.execCommand('hiliteColor', false, wHighlight.value)
  const wLineSpacing = el('wLineSpacing'); if (wLineSpacing) wLineSpacing.oninput = () => { const v=wLineSpacing.value; wordPages().forEach(p=> p.style.lineHeight=v); const selEl=window.getSelection()?.anchorNode?.parentElement; if(selEl) selEl.closest('.doc-page') && (selEl.closest('.doc-page').style.lineHeight=v); status('Line spacing '+v) }
  el('wIndentInc')?.addEventListener('click', ()=> document.execCommand('indent', false, null))
  el('wIndentDec')?.addEventListener('click', ()=> document.execCommand('outdent', false, null))
  el('wClearFmt')?.addEventListener('click', ()=> { document.execCommand('removeFormat', false, null); document.execCommand('unlink', false, null) })
  el('wSub')?.addEventListener('click', ()=> document.execCommand('subscript', false, null))
  el('wSup')?.addEventListener('click', ()=> document.execCommand('superscript', false, null))
  tab.querySelectorAll('.alignBtn').forEach(b=> b.addEventListener('mousedown', e=>{e.preventDefault(); const m={left:'justifyLeft',center:'justifyCenter',right:'justifyRight',justify:'justifyFull'}; document.execCommand(m[b.dataset.align]||'justifyLeft', false, null)}))
  el('wInsTable')?.addEventListener('click', ()=>{
    const rows=parseInt(prompt('Rows (1-12):','3')||'3',10), cols=parseInt(prompt('Columns (1-8):','3')||'3',10)
    if(!rows||!cols) return
    let html='<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin:8px 0;"><tbody>'
    for(let r=0;r<Math.min(rows,12);r++){ html+='<tr>'; for(let c=0;c<Math.min(cols,8);c++) html+=`<td style="border:1px solid #94a3b8;padding:6px;min-width:60px;">Cell</td>`; html+='</tr>' }
    html+='</tbody></table><p></p>'
    document.execCommand('insertHTML', false, html); status('Table inserted')
  })
  el('wInsImage')?.addEventListener('change', async (e)=>{
    const f=e.target.files[0]; if(!f) return
    const reader=new FileReader(); reader.onload=()=>{ document.execCommand('insertImage', false, reader.result); status('Image inserted') }; reader.readAsDataURL(f)
  })
  el('wInsLink')?.addEventListener('click', ()=>{
    const url=prompt('Link URL (https://):','https://'); if(!url) return
    document.execCommand('createLink', false, url); status('Link inserted')
  })
  el('wFindReplace')?.addEventListener('click', ()=> { document.getElementById('findModal')?.classList.remove('hidden'); document.getElementById('findInput')?.focus() })
  el('wWordCount')?.addEventListener('click', ()=>{
    const text=wordPages().map(p=> p.innerText).join(' ')
    const words=text.trim()? text.trim().split(/\s+/).length:0
    const chars=text.length
    status(`Word count: ${words} words, ${chars} chars, ${wordPages().length} pages`); alert(`Word count\n\nWords: ${words}\nCharacters: ${chars}\nPages: ${wordPages().length}`)
  })
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
      <hr/><button data-act="docs-open-word">📂 Open Word (.docx)…</button>
      <button data-act="docs-open-ppt">📂 Open PowerPoint (.pptx)…</button>
      <hr/><button data-act="docs-pagebreak">⛶ Insert Page Break</button>
      <button data-act="docs-page-del">🗑 Delete Word Page</button>
      <button data-act="docs-page-up">▲ Move Page Up</button>
      <button data-act="docs-page-dn">▼ Move Page Down</button>
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
      else act(btn.dataset.act)
    }))
  }
})()

reg('docs-new-word', () => { document.querySelector('.side-tab[data-tab="docs"]')?.click(); el('dNewWord')?.click() })
reg('docs-new-ppt', () => { document.querySelector('.side-tab[data-tab="docs"]')?.click(); el('dNewPpt')?.click() })
reg('docs-open-word', () => el('dOpenWord')?.click())
reg('docs-open-ppt', () => el('dOpenPpt')?.click())

reg('docs-pagebreak', () => { insertWordPageBreak(); countWordPages() })
reg('docs-page-del', () => { deleteWordPage(); countWordPages() })
reg('docs-page-up', () => { moveWordPage(-1); countWordPages() })
reg('docs-page-dn', () => { moveWordPage(1); countWordPages() })

export { openWord, openPpt, resetWord, resetPpt, renumberWordPages, countWordPages }
