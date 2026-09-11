import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, rgb, StandardFonts, degrees, grayscale, PDFName } from 'pdf-lib'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf.js worker - local bundled (works offline + Electron file://)
try { pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl } catch(e){ console.warn('worker src failed', e) }
// fallback CDN if local fails
if(!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`

window.addEventListener('error', e=> { console.error('window error', e.message, e.error); const st=document.getElementById('status'); if(st) st.textContent='Error: '+e.message })
window.addEventListener('unhandledrejection', e=> { console.error('unhandled', e.reason); const st=document.getElementById('status'); if(st) st.textContent='Error: '+ (e.reason?.message||e.reason) })

const fileInput = document.getElementById('fileInput')
const imageInput = document.getElementById('imageInput')
const saveBtn = document.getElementById('saveBtn')
const pdfContainer = document.getElementById('pdfContainer')
const dropZone = document.getElementById('dropZone')
const viewer = document.getElementById('viewer')
const pageInfo = document.getElementById('pageInfo')
const statusEl = document.getElementById('status')
const prevBtn = document.getElementById('prevPage')
const nextBtn = document.getElementById('nextPage')
const zoomIn = document.getElementById('zoomIn')
const zoomOut = document.getElementById('zoomOut')
const zoomLabel = document.getElementById('zoomLabel')
const formFieldsList = document.getElementById('formFieldsList')

let pdfDocProxy = null
let pdfLibDoc = null
let originalBytes = null
let currentZoom = 1.1
let totalPages = 0
let edits = [] // {pageIndex, type, data}
let selectedEl = null
let tool = 'select'
let isDrawing = false
// cover page state
let coverBytes = null
let coverDoc = null
let coverFileName = ''
// word-like state
let wordState = { bold:false, italic:false, underline:false, strike:false, align:'left', fontFamily:'Helvetica', fontSize:14, color:'#000000', lineSpacing:1.2 }
let undoStack = [], redoStack = []
function pushUndo(){ undoStack.push(JSON.stringify(edits)); if(undoStack.length>80) undoStack.shift(); redoStack=[] }
function undo(){ if(!undoStack.length) return status('Nothing to undo'); redoStack.push(JSON.stringify(edits)); edits = JSON.parse(undoStack.pop()); refreshOverlays(); status('Undo') }
function redo(){ if(!redoStack.length) return status('Nothing to redo'); undoStack.push(JSON.stringify(edits)); edits = JSON.parse(redoStack.pop()); refreshOverlays(); status('Redo') }
function refreshOverlays(){ document.querySelectorAll('.overlay').forEach((ov,i)=>{ ov.querySelectorAll('.editable-text,.editable-image,.table-wrap').forEach(n=>n.remove()); reapplyEdits(ov,i) }) }

// PWA install
let deferredPrompt
const installBtn = document.getElementById('installBtn')
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; installBtn.hidden=false })
installBtn?.addEventListener('click', async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.hidden=true })
if('serviceWorker' in navigator && location.protocol.startsWith('http')){ navigator.serviceWorker.register('./sw.js').catch(()=>{}) }

document.querySelectorAll('.tool').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active'))
    b.classList.add('active')
    tool = b.dataset.tool
    setEraseCursor()
    if(tool==='deleteWord') status('Erase: CLICK a word to delete it precisely, DOUBLE-CLICK the line, or DRAG an area')
    else if(tool==='replace') status('Replace mode: PRESS + DRAG over a word, then type the replacement')
    else status(`Tool: ${tool}`)
  })
})
// word toolbar wiring
const fontFamilySel=document.getElementById('fontFamily'), fontSizeSel=document.getElementById('fontSizeWord'), lineSpacingSel=document.getElementById('lineSpacing'), wordColorSel=document.getElementById('wordColor')
fontFamilySel?.addEventListener('change', e=> wordState.fontFamily=e.target.value)
fontSizeSel?.addEventListener('change', e=> wordState.fontSize=parseInt(e.target.value))
lineSpacingSel?.addEventListener('input', e=> wordState.lineSpacing=parseFloat(e.target.value))
wordColorSel?.addEventListener('input', e=> wordState.color=e.target.value)
document.getElementById('boldBtn')?.addEventListener('click', ()=>{ wordState.bold=!wordState.bold; document.getElementById('boldBtn').style.background= wordState.bold?'#3b82f6':'#1e293b'; if(selectedEl) applyWordToSelected() })
document.getElementById('italicBtn')?.addEventListener('click', ()=>{ wordState.italic=!wordState.italic; document.getElementById('italicBtn').style.background= wordState.italic?'#3b82f6':'#1e293b'; if(selectedEl) applyWordToSelected() })
document.getElementById('underlineBtn')?.addEventListener('click', ()=>{ wordState.underline=!wordState.underline; document.getElementById('underlineBtn').style.background= wordState.underline?'#3b82f6':'#1e293b'; if(selectedEl) applyWordToSelected() })
document.getElementById('strikeBtn')?.addEventListener('click', ()=>{ wordState.strike=!wordState.strike; if(selectedEl) applyWordToSelected() })
document.querySelectorAll('.alignBtn').forEach(b=> b.addEventListener('click', ()=>{ wordState.align=b.dataset.align; document.querySelectorAll('.alignBtn').forEach(x=>x.style.background='#1e293b'); b.style.background='#3b82f6'; if(selectedEl) applyWordToSelected() }))
document.getElementById('bulletBtn')?.addEventListener('click', ()=>{ addStyledText('bullet') })
document.getElementById('numberBtn')?.addEventListener('click', ()=>{ addStyledText('number') })
document.getElementById('wordHighBtn')?.addEventListener('click', ()=>{ if(!selectedEl) return status('Select text first'); const ed=getEditForEl(selectedEl); if(ed){ ed.highlight='#fef08a'; selectedEl.style.background='#fef08a'; pushUndo() } })
document.getElementById('clearFormatBtn')?.addEventListener('click', ()=>{ wordState={ bold:false, italic:false, underline:false, strike:false, align:'left', fontFamily:'Helvetica', fontSize:14, color:'#000000', lineSpacing:1.2 }; if(selectedEl) applyWordToSelected(true) })
document.getElementById('undoBtn')?.addEventListener('click', undo)
document.getElementById('redoBtn')?.addEventListener('click', redo)
document.getElementById('insertTableBtn')?.addEventListener('click', ()=> document.getElementById('tableModal').classList.remove('hidden'))
document.getElementById('tableCancel')?.addEventListener('click', ()=> document.getElementById('tableModal').classList.add('hidden'))
document.getElementById('tableConfirm')?.addEventListener('click', ()=>{ const r=parseInt(document.getElementById('tableRows').value)||3, c=parseInt(document.getElementById('tableCols').value)||3; document.getElementById('tableModal').classList.add('hidden'); insertTable(r,c) })
document.getElementById('insertHeaderBtn')?.addEventListener('click', ()=> addHeaderFooter('header'))
document.getElementById('insertFooterBtn')?.addEventListener('click', ()=> addHeaderFooter('footer'))
document.getElementById('pageNumberBtn')?.addEventListener('click', ()=> addPageNumbers())
document.getElementById('insertLineBtn')?.addEventListener('click', ()=> addHorizontalLine())
document.getElementById('findReplaceBtn')?.addEventListener('click', ()=> document.getElementById('findModal').classList.remove('hidden'))
document.getElementById('findCloseBtn')?.addEventListener('click', ()=> document.getElementById('findModal').classList.add('hidden'))
document.getElementById('findNextBtn')?.addEventListener('click', findNext)
document.getElementById('replaceOneBtn')?.addEventListener('click', ()=> replaceOne(false))
document.getElementById('replaceAllBtn')?.addEventListener('click', ()=> replaceOne(true))
document.getElementById('spellCheckBtn')?.addEventListener('click', ()=>{ if(!selectedEl) return status('Select text to spellcheck'); const ed=getEditForEl(selectedEl); if(ed && typeof ed.text==='string'){ selectedEl.setAttribute('spellcheck','true'); selectedEl.setAttribute('contenteditable','true'); selectedEl.focus(); status('Spellcheck on: text is editable in place — red underlines show misspellings') } })
document.getElementById('addStyledTextBtn')?.addEventListener('click', ()=> addStyledText('plain'))
document.addEventListener('keydown', e=>{ if((e.ctrlKey||e.metaKey) && e.key==='z'){ e.preventDefault(); undo() } if((e.ctrlKey||e.metaKey) && e.key==='y'){ e.preventDefault(); redo() } if((e.ctrlKey||e.metaKey) && e.key==='f'){ e.preventDefault(); document.getElementById('findModal').classList.remove('hidden') } })

function getEditForEl(el){ const id=el.dataset.id; return edits.find(x=> String(x.id)===String(id)) }
function applyWordToSelected(clear=false){
  const ed=getEditForEl(selectedEl); if(!ed || ed.type!=='text') return
  if(clear){ Object.assign(ed, {bold:false, italic:false, underline:false, strike:false, align:'left', fontFamily:'Helvetica', fontSize:14, color:'#000000'}); } else { Object.assign(ed, {...wordState}) }
  // update DOM
  selectedEl.style.fontFamily = ed.fontFamily.includes('Courier') ? 'monospace' : ed.fontFamily.includes('Times') ? 'serif' : 'sans-serif'
  selectedEl.style.fontWeight = ed.bold ? '800' : '400'
  selectedEl.style.fontStyle = ed.italic ? 'italic' : 'normal'
  selectedEl.style.textDecoration = (ed.underline && ed.strike) ? 'underline line-through' : ed.underline ? 'underline' : ed.strike ? 'line-through' : 'none'
  selectedEl.style.color = ed.color
  selectedEl.style.textAlign = ed.align
  selectedEl.style.lineHeight = ed.lineSpacing || 1.2
  selectedEl.style.fontSize = ed.fontSize+'px'
  pushUndo()
}
function addStyledText(kind){
  const pi=visiblePageIndex(), ov=visibleOverlay(); if(!ov) return status('Open PDF first')
  pushUndo()
  let text='New Word-style text - double-click to edit'
  if(kind==='bullet') text='• Bullet item - double-click to edit'
  if(kind==='number') text='1. Numbered item - double-click to edit'
  const ed={id:Date.now()+Math.random(), pageIndex:pi, type:'text', x:40, y:40, w:220, h:28, text, fontSize: wordState.fontSize, color: wordState.color, fontFamily: wordState.fontFamily, bold: wordState.bold, italic: wordState.italic, underline: wordState.underline, strike: wordState.strike, align: wordState.align, lineSpacing: wordState.lineSpacing, kind}
  edits.push(ed); createTextEl(ov, ed)
}

function status(t){ statusEl.textContent=t; const el=document.getElementById('coverStatus'); if(el && t.includes('Cover')) el.textContent=t; setTimeout(()=>{ if(statusEl.textContent===t) statusEl.textContent='' }, 5000) }

// Cover page handlers
const coverInput = document.getElementById('coverInput')
const coverInput2 = document.getElementById('coverInput2')
const coverStatus = document.getElementById('coverStatus')
const mergeCoverCheck = document.getElementById('mergeCoverCheck')
const coverAllPagesCheck = document.getElementById('coverAllPagesCheck')
const clearCoverBtn = document.getElementById('clearCoverBtn')
const previewCoverBtn = document.getElementById('previewCoverBtn')

async function handleCoverFile(file){
  if(!file) return
  try{
    const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)
    if(isImg){
      // image cover (PNG/JPG/WEBP) → build a one-page PDF at image size
      const dataUrl = await fileToDataUrl(file)
      let bytes = await fetch(dataUrl).then(r=>r.arrayBuffer())
      const nd = await PDFDocument.create()
      let img
      if(file.type==='image/png' || /\.png$/i.test(file.name)) img = await nd.embedPng(bytes)
      else if(file.type==='image/jpeg' || /\.jpe?g$/i.test(file.name)) { try{ img = await nd.embedJpg(bytes) }catch{ img = await nd.embedPng(await rasterDataUrlToPngBytes(dataUrl)) } }
      else img = await nd.embedPng(await rasterDataUrlToPngBytes(dataUrl))
      const pg = nd.addPage([img.width, img.height])
      pg.drawImage(img, { x:0, y:0, width: img.width, height: img.height })
      coverBytes = await nd.save()
      coverDoc = nd
    } else {
      coverBytes = new Uint8Array(await file.arrayBuffer())
      coverDoc = await PDFDocument.load(coverBytes)
    }
    coverFileName = file.name
    const n = coverDoc.getPageCount()
    coverStatus.textContent = `✓ ${file.name} — ${n} ${isImg?'image cover':'page'+(n>1?'s':'')} ready. Will merge on Save.`
    coverStatus.style.color='#22c55e'
    status(`Cover imported: ${file.name} (${isImg?'PNG/image':'PDF'}, ${n} page${n>1?'s':''})`)
    try{ if(window.renderThumbs) window.renderThumbs() }catch{}
  }catch(e){ coverStatus.textContent='Failed: '+e.message; coverStatus.style.color='#ef4444' }
}
coverInput?.addEventListener('change', e=> handleCoverFile(e.target.files[0]))
coverInput2?.addEventListener('change', e=> handleCoverFile(e.target.files[0]))
clearCoverBtn?.addEventListener('click', ()=>{ coverBytes=null; coverDoc=null; coverFileName=''; coverStatus.textContent='No cover imported'; coverStatus.style.color=''; status('Cover removed') })
previewCoverBtn?.addEventListener('click', async()=>{
  if(!coverDoc) return status('No cover imported')
  // preview first page as thumbnail via PDF.js
  try{
    const task = pdfjsLib.getDocument({data: coverBytes})
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const vp = page.getViewport({scale:0.5})
    const c = document.createElement('canvas'); c.width=vp.width; c.height=vp.height
    await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise
    const w = window.open('', '_blank')
    w.document.body.innerHTML=`<h3 style='font-family:sans-serif'>Cover Preview: ${coverFileName} - ${coverDoc.getPageCount()} pages</h3>`
    w.document.body.appendChild(c)
  } catch(e){ status('Preview failed: '+e.message) }
})
// drag cover also
viewer.addEventListener('dragover', e=>{ if(e.dataTransfer.types.includes('Files')) e.preventDefault() })

fileInput.addEventListener('change', e=>{ if(e.target.files[0]) loadPdf(e.target.files[0]) })
viewer.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('drag') })
viewer.addEventListener('dragleave', ()=> dropZone.classList.remove('drag'))
viewer.addEventListener('drop', e=>{ e.preventDefault(); dropZone.classList.remove('drag'); const f=e.dataTransfer.files[0]; if(f && f.type==='application/pdf') loadPdf(f); else status('Drop a PDF file') })

async function loadPdf(file){
  originalBytes = new Uint8Array(await file.arrayBuffer())
  // keep pdf-lib doc for saving
  pdfLibDoc = await PDFDocument.load(originalBytes)
  // pdf.js for rendering
  const loadingTask = pdfjsLib.getDocument({ data: originalBytes })
  pdfDocProxy = await loadingTask.promise
  totalPages = pdfDocProxy.numPages
  edits = []
  pagesToDelete.clear()
  pdfContainer.innerHTML = ''
  dropZone.style.display='none'
  saveBtn.disabled = false
  await renderAll()
  renderPageList()
  await listFormFields()
  status(`Loaded ${file.name} — ${totalPages} pages`)
}

async function renderAll(){
  pdfContainer.innerHTML=''
  for(let i=1;i<=totalPages;i++){
    const page = await pdfDocProxy.getPage(i)
    const viewport = page.getViewport({ scale: currentZoom })
    const wrap = document.createElement('div')
    wrap.className='page-wrap'
    wrap.style.width = viewport.width+'px'
    wrap.style.height = viewport.height+'px'
    wrap.dataset.pageIndex = i-1

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = viewport.width+'px'
    canvas.style.height = viewport.height+'px'

    // overlay for edits
    const overlay = document.createElement('div')
    overlay.className='overlay'
    overlay.style.width = viewport.width+'px'
    overlay.style.height = viewport.height+'px'

    // draw canvas for freehand
    const drawCanvas = document.createElement('canvas')
    drawCanvas.className='draw-canvas'
    drawCanvas.width = viewport.width
    drawCanvas.height = viewport.height
    drawCanvas.style.width='100%'
    drawCanvas.style.height='100%'
    overlay.appendChild(drawCanvas)
    setupDraw(drawCanvas, i-1)

    wrap.appendChild(canvas)
    wrap.appendChild(overlay)
    pdfContainer.appendChild(wrap)
    setupErase(overlay, i-1)
    setEraseCursor()

    // clicks for adding
    overlay.addEventListener('click', (e)=>{
      if(e.target!==overlay && e.target!==drawCanvas) return
      if(tool==='text'){ addTextBox(overlay, i-1, e.offsetX, e.offsetY) }
      else if(tool==='stamp'){ addNote(overlay, i-1, e.offsetX, e.offsetY) }
      else if(tool==='highlight'){ addHighlight(overlay, i-1, e.offsetX, e.offsetY) }
      else if(tool==='deleteWord' || tool==='replace'){ handleOverlayClick(overlay, i-1, e) }
    })
    // double-click = erase the WHOLE line (precise, text-aware)
    overlay.addEventListener('dblclick', async (e)=>{
      if(e.target!==overlay && e.target!==drawCanvas) return
      if(tool==='deleteWord'){ e.preventDefault(); await eraseWordAt(overlay, i-1, e.offsetX, e.offsetY, true) }
    })

    await page.render({ canvasContext: ctx, viewport }).promise
    // re-apply edits for this page
    reapplyEdits(overlay, i-1, viewport)
    // form fields overlay
    renderFormOverlays(overlay, i-1, viewport)
  }
  pageInfo.textContent = `${totalPages} pages • ${Math.round(currentZoom*100)}%`
  zoomLabel.textContent = Math.round(currentZoom*100)+'%'
}

function reapplyEdits(overlay, pageIndex, viewport){
  edits.filter(e=>e.pageIndex===pageIndex).forEach(ed=>{
    if(ed.type==='text') createTextEl(overlay, ed)
    if(ed.type==='image') createImageEl(overlay, ed)
    if(ed.type==='note') createNoteEl(overlay, ed)
    if(ed.type==='highlight') createHighlightEl(overlay, ed)
    if(ed.type==='deleteWord') createDeleteEl(overlay, ed)
    if(ed.type==='table') createTableEl(overlay, ed)
    if(ed.type==='headerFooter') createHeaderFooterEl(overlay, ed)
    if(ed.type==='line') createLineEl(overlay, ed)
    if(ed.type==='shape'||ed.type==='arrow'||ed.type==='uann'||ed.type==='sann'||ed.type==='stamp'||ed.type==='callout'||ed.type==='redact'||ed.type==='formCreate'){ if(window.ProRenderEdit) window.ProRenderEdit(overlay, ed) }
  })
  const dc=overlay.querySelector('.draw-canvas')
  if(dc) redrawDrawings(dc, pageIndex)
}

// Text
document.getElementById('addTextBtn').addEventListener('click', ()=>{
  const ov = visibleOverlay()
  if(!ov) return status('Open a PDF first')
  addTextBox(ov, visiblePageIndex(), 40, 40)
})

function addTextBox(overlay, pageIndex, x, y){
  const id = Date.now()+Math.random()
  const ed = { id, pageIndex, type:'text', x, y, w:180, h:26, text:'Double-click to edit', fontSize: parseInt(document.getElementById('fontSize').value)||wordState.fontSize, color: document.getElementById('colorPicker').value||wordState.color, fontFamily: wordState.fontFamily, bold: wordState.bold, italic: wordState.italic, underline: wordState.underline, strike: wordState.strike, align: wordState.align, lineSpacing: wordState.lineSpacing }
  pushUndo()
  edits.push(ed)
  createTextEl(overlay, ed)
}
function insertTable(rows, cols){
  const pi=visiblePageIndex(), ov=visibleOverlay(); if(!ov) return status('Open PDF first')
  pushUndo()
  const ed={id:Date.now()+Math.random(), pageIndex:pi, type:'table', x:30, y:80, w: 320, h: rows*28+10, rows, cols, cells: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> ''))}
  edits.push(ed); createTableEl(ov, ed)
}
function createTableEl(overlay, ed){
  const wrap=document.createElement('div'); wrap.className='table-wrap'; wrap.dataset.id=ed.id
  wrap.style.left=ed.x+'px'; wrap.style.top=ed.y+'px'; wrap.style.width=ed.w+'px'; wrap.style.height=ed.h+'px'
  const table=document.createElement('table')
  for(let r=0;r<ed.rows;r++){
    const tr=document.createElement('tr')
    for(let c=0;c<ed.cols;c++){
      const td=document.createElement('td'); td.contentEditable='true'; td.textContent=ed.cells[r][c]||`R${r+1}C${c+1}`
      td.addEventListener('input', ()=> ed.cells[r][c]=td.textContent)
      tr.appendChild(td)
    }
    table.appendChild(tr)
  }
  wrap.appendChild(table)
  const rh=document.createElement('div'); rh.className='resize-handle'; rh.style.right='-4px'; rh.style.bottom='-4px'; rh.style.background='#22c55e'; wrap.appendChild(rh)
  makeDraggable(wrap, ed, overlay); makeResizable(wrap, ed, rh)
  wrap.addEventListener('click', e=>{ e.stopPropagation(); selectEl(wrap) })
  overlay.appendChild(wrap)
}
function addHeaderFooter(kind){
  const ov=document.querySelectorAll('.overlay')[0]; if(!ov) return status('Open PDF first')
  pushUndo()
  const y = kind==='header' ? 8 : (ov.clientHeight-22)
  const ed={id:Date.now()+Math.random(), pageIndex:0, type:'headerFooter', kind, text: kind==='header' ? 'Header - by Otim Noah' : 'Footer - Page ', x: 40, y, w: ov.clientWidth-80, h:16, allPages:true }
  edits.push(ed); createHeaderFooterEl(ov, ed)
}
function createHeaderFooterEl(overlay, ed){
  const el=document.createElement('div'); el.className='editable-text'; el.dataset.id=ed.id
  el.style.left=ed.x+'px'; el.style.top=ed.y+'px'; el.style.width=ed.w+'px'; el.style.fontSize='10px'; el.style.color='#334155'; el.style.border='1px dashed #22c55e'; el.style.textAlign='center'
  el.textContent = ed.text + (ed.kind==='footer' ? '(will add page numbers)' : '')
  el.title='Header/Footer - double-click to edit (no prompt() - uses modal)'
  makeDraggable(el, ed, overlay)
  el.addEventListener('dblclick', async ()=>{ const t=await showPrompt('Header/Footer', 'Text:', ed.text); if(t!==null){ ed.text=t; el.textContent=t + (ed.kind==='footer' && ed.allPages ? ' (pages)' : '') } })
  el.addEventListener('click', e=>{ e.stopPropagation(); selectEl(el) })
  overlay.appendChild(el)
}
function addPageNumbers(){
  pushUndo()
  const ed={id:Date.now()+Math.random(), pageIndex:0, type:'pageNumber', x: 0, y: 0, allPages:true, style:'Page {n} of {total}'}
  edits.push(ed); status('Page numbers will be added to every page on Save (Word style)')
}
function addHorizontalLine(){
  const pi=visiblePageIndex(), ov=visibleOverlay(); if(!ov) return status('Open PDF first')
  pushUndo()
  const ed={id:Date.now()+Math.random(), pageIndex:pi, type:'line', x:30, y:60, w: 300, h:2, color:'#000000'}
  edits.push(ed); createLineEl(ov, ed)
}
function createLineEl(overlay, ed){
  const el=document.createElement('div'); el.className='editable-text'; el.dataset.id=ed.id
  el.style.left=ed.x+'px'; el.style.top=ed.y+'px'; el.style.width=ed.w+'px'; el.style.height='2px'; el.style.background=ed.color; el.style.border='none'; el.style.padding='0'
  makeDraggable(el, ed, overlay); makeResizable(el, ed, (()=>{ const h=document.createElement('div'); h.className='resize-handle'; h.style.right='-4px'; h.style.bottom='-4px'; el.appendChild(h); return h })())
  el.addEventListener('click', e=>{ e.stopPropagation(); selectEl(el) })
  overlay.appendChild(el)
}
async function findNext(){
  const q=document.getElementById('findInput').value.trim().toLowerCase()
  if(!q) return status('Enter find text')
  // 1) search added text boxes first
  const found = edits.find(e=> e.type==='text' && e.text.toLowerCase().includes(q))
  if(found){ status(`Found in your text on page ${found.pageIndex+1}: "${found.text.slice(0,40)}"`); document.querySelectorAll('.page-wrap')[found.pageIndex]?.scrollIntoView({behavior:'smooth', block:'center'}); return }
  // 2) search native PDF page text
  if(!pdfDocProxy) return status('Open a PDF first')
  status(`Searching ${totalPages} page(s) of PDF text...`)
  for(let i=1;i<=totalPages;i++){
    try{
      const page=await pdfDocProxy.getPage(i)
      const tc=await page.getTextContent()
      const str=(tc.items||[]).map(it=>it.str||'').join(' ')
      if(str.toLowerCase().includes(q)){
        document.querySelectorAll('.page-wrap')[i-1]?.scrollIntoView({behavior:'smooth', block:'center'})
        status(`Found "${q}" in PDF text on page ${i} — use 🧽 Erase + Text to replace it`)
        return
      }
    }catch(e){ /* keep searching */ }
  }
  status(`"${q}" not found in PDF or added text`)
}
function replaceOne(all){
  const f=document.getElementById('findInput').value, r=document.getElementById('replaceInput').value
  if(!f) return status('Enter find text')
  let count=0
  edits.forEach(ed=>{
    if(ed.type==='text' && ed.text.includes(f)){
      if(all){ ed.text = ed.text.split(f).join(r); count++ }
      else if(count===0 && ed.text.includes(f)){ ed.text = ed.text.replace(f, r); count=1 }
    }
  })
  if(count===0) return status('No matches in added text boxes')
  pushUndo()
  refreshOverlays()
  status(`Replaced ${count} occurrence(s)`)
  // also create deleteWord covers for PDF native text - instruct user to use Erase tool for native PDF words
}

function createTextEl(overlay, ed){
  const el = document.createElement('div')
  el.className='editable-text'
  el.dataset.id = ed.id
  el.style.left = ed.x+'px'
  el.style.top = ed.y+'px'
  el.style.width = ed.w+'px'
  el.style.minHeight = ed.h+'px'
  el.style.fontSize = (ed.fontSize||14)+'px'
  el.style.color = ed.color || '#000000'
  el.style.fontFamily = ed.fontFamily?.includes('Courier') ? 'monospace' : ed.fontFamily?.includes('Times') ? 'serif' : 'sans-serif'
  el.style.fontWeight = ed.bold ? '800' : '400'
  el.style.fontStyle = ed.italic ? 'italic' : 'normal'
  el.style.textDecoration = (ed.underline && ed.strike) ? 'underline line-through' : ed.underline ? 'underline' : ed.strike ? 'line-through' : 'none'
  el.style.textAlign = ed.align || 'left'
  el.style.lineHeight = ed.lineSpacing || 1.2
  el.style.background = ed.highlight || 'transparent'
  el.textContent = ed.text
  el.title='Drag to move, double-click to edit'
  el.setAttribute('spellcheck','true')
  makeDraggable(el, ed, overlay)
  el.addEventListener('dblclick', ()=> openTextModal(ed, el))
  el.addEventListener('click', (e)=>{ e.stopPropagation(); selectEl(el); // sync toolbar to this text's style
    Object.assign(wordState, {fontFamily:ed.fontFamily||'Helvetica', fontSize:ed.fontSize||14, bold:!!ed.bold, italic:!!ed.italic, underline:!!ed.underline, strike:!!ed.strike, align:ed.align||'left', color:ed.color||'#000000'})
  })
  overlay.appendChild(el)
}

// highlight / note
function addHighlight(overlay, pageIndex, x, y){
  const id=Date.now()+Math.random()
  const color=document.getElementById('colorPicker').value
  const opacity=document.getElementById('opacity').value
  const ed={id,pageIndex,type:'highlight',x:x-40,y:y-8,w:120,h:18,color,opacity}
  edits.push(ed); createHighlightEl(overlay, ed)
}
function createHighlightEl(overlay, ed){
  const el=document.createElement('div')
  el.className='editable-text'
  el.dataset.id=ed.id
  el.style.left=ed.x+'px';el.style.top=ed.y+'px';el.style.width=ed.w+'px';el.style.height=ed.h+'px'
  el.style.background=hexToRgba(ed.color, ed.opacity*0.35)
  el.style.border='1px solid '+hexToRgba(ed.color,0.5)
  makeDraggable(el, ed, overlay)
  overlay.appendChild(el)
}
function addNote(overlay, pageIndex, x, y){
  const id=Date.now()+Math.random()
  const ed={id,pageIndex,type:'note',x,y,text:'📌 Note'}
  edits.push(ed); createNoteEl(overlay, ed)
}
function createNoteEl(overlay, ed){
  const el=document.createElement('div')
  el.className='annotation-dot'
  el.dataset.id=ed.id
  el.style.left=ed.x+'px';el.style.top=ed.y+'px'
  el.textContent='!'
  el.title=ed.text
  el.addEventListener('click', async (e)=>{ e.stopPropagation(); const t=await showPrompt('Annotation', 'Note text:', ed.text); if(t!==null){ ed.text=t; el.title=t } })
  makeDraggable(el, ed, overlay)
  overlay.appendChild(el)
}

// Images
imageInput.addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return
  pushUndo()
  const url=URL.createObjectURL(f)
  const img=new Image(); img.src=url; await img.decode()
  const pi=visiblePageIndex(), overlay=visibleOverlay()
  if(!overlay) return status('Open a PDF first')
  const id=Date.now()+Math.random()
  const ed={id,pageIndex:pi,type:'image',x:40,y:40,w: Math.min(200, img.width/2), h: Math.min(200, img.height/2), src: await fileToDataUrl(f)}
  edits.push(ed); createImageEl(overlay, ed)
  status(`Image added on page ${pi+1} — drag to move, corner to resize`)
})
function createImageEl(overlay, ed){
  const el=document.createElement('div')
  el.className='editable-image'
  el.dataset.id=ed.id
  el.style.left=ed.x+'px';el.style.top=ed.y+'px';el.style.width=ed.w+'px';el.style.height=ed.h+'px'
  const img=document.createElement('img'); img.src=ed.src; el.appendChild(img)
  // resize handle
  const h=document.createElement('div'); h.className='resize-handle'; h.style.right='-4px'; h.style.bottom='-4px'; h.style.cursor='nwse-resize'; el.appendChild(h)
  makeDraggable(el, ed, overlay)
  makeResizable(el, ed, h)
  el.addEventListener('click', e=>{ e.stopPropagation(); selectEl(el) })
  overlay.appendChild(el)
}

// Draw — strokes stored as normalized fractions so they survive zoom + undo + save
let drawColor = '#000000'
function setupDraw(canvas, pageIndex){
  const ctx=canvas.getContext('2d')
  ctx.lineWidth=2; ctx.strokeStyle=drawColor; ctx.lineCap='round'; ctx.lineJoin='round'
  let drawing=false; let pts=[]
  const getPos = e=>{ const r=canvas.getBoundingClientRect(); const x=(e.touches?e.touches[0].clientX:e.clientX)-r.left; const y=(e.touches?e.touches[0].clientY:e.clientY)-r.top; return {x: x * (canvas.width / r.width), y: y * (canvas.height / r.height)} }
  const start = e=>{ if(tool!=='draw') return; drawing=true; pts=[]; ctx.strokeStyle=drawColor; const p=getPos(e); pts.push(p); ctx.beginPath(); ctx.moveTo(p.x,p.y); e.preventDefault() }
  const move = e=>{ if(!drawing) return; const p=getPos(e); pts.push(p); ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault() }
  const end = ()=>{ if(!drawing) return; drawing=false; if(pts.length>2){ pushUndo(); edits.push({id:Date.now()+Math.random(), pageIndex, type:'draw', points: pts.map(p=>({fx:p.x/canvas.width, fy:p.y/canvas.height})), color:drawColor, width:2}) } }
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end)
  canvas.addEventListener('touchstart', start, {passive:false}); canvas.addEventListener('touchmove', move, {passive:false}); canvas.addEventListener('touchend', end)
  redrawDrawings(canvas, pageIndex)
}
// redraw freehand strokes on this page's draw-canvas (zoom / undo / reload) — wired ONCE
function redrawDrawings(canvas, pageIndex){
  const ctx=canvas.getContext('2d')
  ctx.clearRect(0,0,canvas.width,canvas.height)
  ctx.lineCap='round'; ctx.lineJoin='round'
  for(const ed of edits){
    if(ed.type!=='draw' || ed.pageIndex!==pageIndex || !ed.points || ed.points.length<2) continue
    ctx.strokeStyle=ed.color||'#000000'; ctx.lineWidth=(ed.width||2) * (canvas.width/600 + 0.5)
    ctx.beginPath()
    ed.points.forEach((p,i)=>{
      const X = (p.fx!==undefined ? p.fx*canvas.width : p.x)
      const Y = (p.fy!==undefined ? p.fy*canvas.height : p.y)
      if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y)
    })
    ctx.stroke()
  }
}
if(!window.__drawGlobalWired){
  window.__drawGlobalWired=true
  document.getElementById('clearDrawBtn').addEventListener('click', ()=>{
    pushUndo()
    edits = edits.filter(ed=> ed.type!=='draw')
    document.querySelectorAll('.draw-canvas').forEach(c=> c.getContext('2d').clearRect(0,0,c.width,c.height))
    status('All freehand drawings cleared (all pages)')
  })
  document.getElementById('colorPicker').addEventListener('input', e=>{ drawColor=e.target.value })
}
document.getElementById('deleteSelectedBtn').addEventListener('click', ()=>{
  if(!selectedEl) return status('Nothing selected')
  const id=selectedEl.dataset.id; edits = edits.filter(ed=> String(ed.id)!==String(id)); selectedEl.remove(); selectedEl=null
})

// signature pad
const sigPad=document.getElementById('sigPad')
const sigCtx=sigPad.getContext('2d')
sigCtx.lineWidth=2; sigCtx.strokeStyle='#000'; sigCtx.lineCap='round'
let sigDrawing=false
sigPad.addEventListener('mousedown', e=>{ sigDrawing=true; const r=sigPad.getBoundingClientRect(); sigCtx.beginPath(); sigCtx.moveTo(e.clientX-r.left, e.clientY-r.top) })
sigPad.addEventListener('mousemove', e=>{ if(!sigDrawing) return; const r=sigPad.getBoundingClientRect(); sigCtx.lineTo(e.clientX-r.left, e.clientY-r.top); sigCtx.stroke() })
window.addEventListener('mouseup', ()=> sigDrawing=false)
sigPad.addEventListener('touchstart', e=>{ const r=sigPad.getBoundingClientRect(); sigCtx.beginPath(); sigCtx.moveTo(e.touches[0].clientX-r.left, e.touches[0].clientY-r.top); sigDrawing=true; e.preventDefault() }, {passive:false})
sigPad.addEventListener('touchmove', e=>{ if(!sigDrawing) return; const r=sigPad.getBoundingClientRect(); sigCtx.lineTo(e.touches[0].clientX-r.left, e.touches[0].clientY-r.top); sigCtx.stroke(); e.preventDefault() }, {passive:false})
sigPad.addEventListener('touchend', ()=> sigDrawing=false)
document.getElementById('clearSigBtn').addEventListener('click', ()=> sigCtx.clearRect(0,0,sigPad.width,sigPad.height))
document.getElementById('addSigBtn').addEventListener('click', ()=>{
  if(isCanvasBlank(sigPad)) return status('Draw signature first')
  const dataUrl=sigPad.toDataURL('image/png')
  const pi=visiblePageIndex(), overlay=visibleOverlay()
  if(!overlay) return status('Open a PDF first')
  pushUndo()
  const ed={id:Date.now()+Math.random(), pageIndex:pi, type:'image', x:40, y:140, w:150, h:60, src:dataUrl}
  edits.push(ed); createImageEl(overlay, ed); status(`Signature added on page ${pi+1} — drag to position`)
})

// helpers
function makeDraggable(el, ed, overlay){
  let ox=0, oy=0, startX=0, startY=0, dragging=false
  const onDown = e=>{
    if(e.target.classList.contains('resize-handle')) return
    dragging=true; selectEl(el)
    const rect=overlay.getBoundingClientRect()
    const pt = e.touches?e.touches[0]:e
    startX=pt.clientX; startY=pt.clientY; ox=ed.x; oy=ed.y
    e.preventDefault()
  }
  const onMove = e=>{
    if(!dragging) return
    const pt=e.touches?e.touches[0]:e
    const dx=(pt.clientX-startX); const dy=(pt.clientY-startY)
    ed.x = Math.max(0, ox+dx); ed.y = Math.max(0, oy+dy)
    el.style.left=ed.x+'px'; el.style.top=ed.y+'px'
  }
  const onUp=()=> dragging=false
  el.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  el.addEventListener('touchstart', onDown, {passive:false}); window.addEventListener('touchmove', onMove, {passive:false}); window.addEventListener('touchend', onUp)
}
function makeResizable(el, ed, handle){
  let startW, startH, startX, startY, resizing=false
  handle.addEventListener('mousedown', e=>{ resizing=true; startW=ed.w; startH=ed.h; startX=e.clientX; startY=e.clientY; e.stopPropagation(); e.preventDefault() })
  window.addEventListener('mousemove', e=>{
    if(!resizing) return; ed.w=Math.max(20, startW+(e.clientX-startX)); ed.h=Math.max(20, startH+(e.clientY-startY))
    el.style.width=ed.w+'px'; el.style.height=ed.h+'px'
  })
  window.addEventListener('mouseup', ()=> resizing=false)
}
function selectEl(el){ document.querySelectorAll('.editable-text,.editable-image,.table-wrap').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); selectedEl=el }
// page the user is currently viewing (so new items land where expected, not always page 1)
function visiblePageIndex(){
  const wraps=[...document.querySelectorAll('.page-wrap')]; if(!wraps.length) return 0
  const vr=viewer.getBoundingClientRect()
  let best=0, bestD=Infinity
  wraps.forEach((w,i)=>{ const r=w.getBoundingClientRect(); const d=Math.abs((r.top+r.height*0.35)-vr.top); if(d<bestD){bestD=d;best=i} })
  return best
}
function visibleOverlay(){
  const ovs=document.querySelectorAll('.overlay')
  return ovs[visiblePageIndex()] || ovs[0] || null
}
function hexToRgba(hex, a){ const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})` }
function fileToDataUrl(f){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(f) }) }
// rasterize any browser-decodable image (webp/gif/svg/bmp) to PNG bytes for pdf-lib embedding
function rasterDataUrlToPngBytes(dataUrl){
  return new Promise((res, rej)=>{
    const img=new Image()
    img.onload=()=>{
      try{
        const c=document.createElement('canvas'); c.width=img.naturalWidth||400; c.height=img.naturalHeight||400
        const cx=c.getContext('2d'); cx.fillStyle='#ffffff'; cx.fillRect(0,0,c.width,c.height); cx.drawImage(img,0,0)
        c.toBlob(b=>{ if(!b) return rej(new Error('rasterize failed')); b.arrayBuffer().then(a=>res(a)) }, 'image/png')
      }catch(e){ rej(e) }
    }
    img.onerror=()=>rej(new Error('cannot decode image'))
    img.src=dataUrl
  })
}
function isCanvasBlank(c){ const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; return !d.some((v,i)=> i%4!==3 && v!==0) }

// Prompt modal replaces blocked prompt() in Electron - avoids "prompt() is and will not be supported"
function showPrompt(title, label, defaultValue){
  return new Promise(resolve=>{
    const m=document.getElementById('promptModal')
    document.getElementById('promptTitle').textContent=title
    document.getElementById('promptLabel').textContent=label
    const inp=document.getElementById('promptInput'), ok=document.getElementById('promptOk'), cancel=document.getElementById('promptCancel')
    inp.value=defaultValue||''; m.classList.remove('hidden'); setTimeout(()=>inp.focus(),50)
    let done=false
    function cleanup(val){ if(done) return; done=true; m.classList.add('hidden'); ok.onclick=null; cancel.onclick=null; inp.onkeydown=null; m.onclick=null; resolve(val) }
    ok.onclick=()=>cleanup(inp.value)
    cancel.onclick=()=>cleanup(null)
    inp.onkeydown=(e)=>{ if(e.key==='Enter') cleanup(inp.value); if(e.key==='Escape') cleanup(null) }
    m.onclick=(e)=>{ if(e.target===m) cleanup(null) }
  })
}

// Text modal with Word formatting
const modal=document.getElementById('textModal')
const modalInput=document.getElementById('textModalInput')
let modalEd=null, modalEl=null
function openTextModal(ed, el){ modalEd=ed; modalEl=el; modalInput.value=ed.text; document.getElementById('modalFontFamily').value=ed.fontFamily||'Helvetica'; document.getElementById('modalBold').checked=!!ed.bold; document.getElementById('modalItalic').checked=!!ed.italic; document.getElementById('modalUnderline').checked=!!ed.underline; modal.classList.remove('hidden'); modalInput.focus() }
document.getElementById('textModalCancel').addEventListener('click', ()=> modal.classList.add('hidden'))
document.getElementById('textModalSave').addEventListener('click', ()=>{
  if(modalEd){
    pushUndo()
    modalEd.text=modalInput.value
    modalEd.fontFamily=document.getElementById('modalFontFamily').value
    modalEd.bold=document.getElementById('modalBold').checked
    modalEd.italic=document.getElementById('modalItalic').checked
    modalEd.underline=document.getElementById('modalUnderline').checked
    // re-render
    modalEl.textContent=modalEd.text
    modalEl.style.fontFamily = modalEd.fontFamily.includes('Courier')?'monospace':modalEd.fontFamily.includes('Times')?'serif':'sans-serif'
    modalEl.style.fontWeight = modalEd.bold?'800':'400'
    modalEl.style.fontStyle = modalEd.italic?'italic':'normal'
    modalEl.style.textDecoration = modalEd.underline?'underline':'none'
  } modal.classList.add('hidden')
})
modal.addEventListener('click', e=>{ if(e.target===modal) modal.classList.add('hidden') })
document.getElementById('findModal')?.addEventListener('click', e=>{ if(e.target.id==='findModal') e.currentTarget.classList.add('hidden') })
document.getElementById('tableModal')?.addEventListener('click', e=>{ if(e.target.id==='tableModal') e.currentTarget.classList.add('hidden') })

// Page delete management
let pagesToDelete = new Set()
function renderPageList(){
  const list = document.getElementById('pageList')
  if(!pdfLibDoc){ list.textContent='No PDF loaded'; return }
  list.innerHTML=''
  for(let i=0;i<totalPages;i++){
    const row=document.createElement('label')
    row.style.cssText='display:flex;align-items:center;gap:6px;padding:4px 6px;background:#0f172a;border:1px solid #334155;border-radius:6px;cursor:pointer;'
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=pagesToDelete.has(i)
    cb.addEventListener('change', ()=>{
      if(cb.checked) pagesToDelete.add(i); else pagesToDelete.delete(i)
      row.style.opacity = cb.checked ? '0.6' : '1'
      row.style.borderColor = cb.checked ? '#ef4444' : '#334155'
      status(cb.checked ? `Page ${i+1} marked for deletion` : `Page ${i+1} restored`)
      // also dim the rendered page
      const wrap = document.querySelectorAll('.page-wrap')[i]
      if(wrap) wrap.style.opacity = cb.checked ? '0.35' : '1'
      if(cb.checked) wrap.style.filter='grayscale(1)'
      else wrap.style.filter=''
    })
    const txt=document.createElement('span'); txt.textContent=`Page ${i+1}`; txt.style.fontSize='12px'
    const badge=document.createElement('span'); badge.textContent= pagesToDelete.has(i) ? 'TO DELETE' : 'keep'; badge.style.cssText=`margin-left:auto;font-size:10px;padding:2px 6px;border-radius:999px;background:${pagesToDelete.has(i)?'#ef4444':'#1e293b'};color:white`
    // update badge on change
    cb.addEventListener('change', ()=>{ badge.textContent= pagesToDelete.has(i) ? 'TO DELETE' : 'keep'; badge.style.background= pagesToDelete.has(i)?'#ef4444':'#1e293b' })
    row.appendChild(cb); row.appendChild(txt); row.appendChild(badge)
    // click page to scroll
    row.addEventListener('click', (e)=>{ if(e.target===cb) return; const w=document.querySelectorAll('.page-wrap')[i]; if(w) w.scrollIntoView({behavior:'smooth', block:'center'}) })
    list.appendChild(row)
  }
}
document.getElementById('deletePagesBtn')?.addEventListener('click', ()=>{
  if(pagesToDelete.size===0) return status('No pages selected')
  if(window.bxDeletePagesNow){
    const picks=[...pagesToDelete]
    pagesToDelete.clear(); renderPageList()
    window.bxDeletePagesNow(picks)
  } else {
    status(`${pagesToDelete.size} page(s) will be deleted on Save`)
  }
})
document.getElementById('restorePagesBtn')?.addEventListener('click', ()=>{
  pagesToDelete.clear()
  renderPageList()
  document.querySelectorAll('.page-wrap').forEach(w=>{ w.style.opacity='1'; w.style.filter='' })
  status('All pages restored')
})

// Delete word / replace handling — click a word to erase it precisely, or drag an area
let pendingReplace = null
function addDeleteRect(overlay, pageIndex, x, y, w=120, h=18, meta){
  const id=Date.now()+Math.random()
  const ed={id, pageIndex, type:'deleteWord', x: Math.max(0,Math.round(x)), y: Math.max(0,Math.round(y)), w: Math.max(8,Math.round(w)), h: Math.max(8,Math.round(h))}
  if(meta && meta.text) ed.text = meta.text
  pushUndo()
  edits.push(ed); createDeleteEl(overlay, ed)
  const n = edits.filter(e=>e.type==='deleteWord').length
  status(meta && meta.text ? `Erased "${meta.text.slice(0,40)}" on page ${pageIndex+1} — saved as opaque white.` : `Deleted block #${n} on page ${pageIndex+1} — looks deleted now, stays deleted on Save.`)
}
// Detect the actual word/line under a click and erase exactly it (precise word deletion)
async function eraseWordAt(overlay, pageIndex, x, y, wholeLine){
  try{
    const page = await pdfDocProxy.getPage(pageIndex+1)
    const vp = page.getViewport({ scale: currentZoom })
    const U = pdfjsLib.Util
    const tc = await page.getTextContent()
    let hit=null
    for(const it of (tc.items||[])){
      if(!it.str || !it.str.trim()) continue
      const tx = U.transform(vp.transform, it.transform)
      const fs = Math.hypot(tx[2], tx[3]) || 10
      const w = (it.width || it.str.length*fs*0.5)
      const h = fs*1.2
      const ix = tx[4], iy = tx[5]-h*0.85
      if(x>=ix-2 && x<=ix+w+2 && y>=iy-2 && y<=iy+h+2){ hit={it, ix, iy, w, h, fs, lineY: tx[5]}; break }
    }
    if(!hit){ return false }
    if(wholeLine){
      // cover the whole line: find all items on the same baseline
      let minX=hit.ix, maxX=hit.ix+hit.w, h=hit.h
      for(const it of (tc.items||[])){
        if(!it.str || !it.str.trim()) continue
        const tx=U.transform(vp.transform, it.transform)
        if(Math.abs(tx[5]-hit.lineY) < hit.fs*0.6){
          const fs=Math.hypot(tx[2],tx[3])||10
          const ix=tx[4], w=(it.width||it.str.length*fs*0.5), iy=tx[5]-fs*1.2*0.85
          minX=Math.min(minX,ix); maxX=Math.max(maxX,ix+w); h=Math.max(h,fs*1.2); hit.iy=Math.min(hit.iy,iy)
        }
      }
      addDeleteRect(overlay, pageIndex, minX-2, hit.iy-2, (maxX-minX)+4, h+4, {text:'line'})
    } else {
      addDeleteRect(overlay, pageIndex, hit.ix-2, hit.iy-2, hit.w+4, hit.h+4, {text:hit.it.str})
    }
    return true
  }catch(e){ return false }
}
function createDeleteEl(overlay, ed){
  const el=document.createElement('div')
  el.className='editable-text delete-cover'
  el.dataset.id=ed.id
  el.style.left=ed.x+'px'; el.style.top=ed.y+'px'; el.style.width=ed.w+'px'; el.style.height=ed.h+'px'
  el.style.cursor='move'
  el.title='Deleted — click to select (shows outline + ×), drag to move, corner to resize'
  // no label inside: plain white so the words look deleted immediately, before saving
  makeDraggable(el, ed, overlay)
  // resize handle (hidden until selected via CSS)
  const rh=document.createElement('div'); rh.className='resize-handle'; rh.style.right='-4px'; rh.style.bottom='-4px'; rh.style.cursor='nwse-resize'; rh.style.background='#ef4444'; el.appendChild(rh)
  makeResizable(el, ed, rh)
  // × remove button (hidden until hover/select via CSS)
  const x=document.createElement('button'); x.textContent='×'; x.title='Remove this white-out'; x.className='del-x'
  x.style.cssText='position:absolute;top:-10px;right:-10px;width:18px;height:18px;border-radius:50%;border:1px solid #fff;background:#ef4444;color:#fff;font-size:12px;line-height:1;cursor:pointer;padding:0;'
  x.addEventListener('click', (ev)=>{ ev.stopPropagation(); pushUndo(); edits = edits.filter(o=> String(o.id)!==String(ed.id)); el.remove(); if(selectedEl===el) selectedEl=null; status('White-out removed — words visible again') })
  el.appendChild(x)
  el.addEventListener('click', e=>{ e.stopPropagation(); selectEl(el) })
  overlay.appendChild(el)
}
// Drag-to-erase: press and drag over words to size the white cover (works on overlay + draw canvas)
function setupErase(overlay, pageIndex){
  let sx=0, sy=0, active=false, ghost=null
  const pos = (e)=>{
    const r=overlay.getBoundingClientRect()
    const pt = e.touches ? e.touches[0] : e
    return { x: pt.clientX - r.left, y: pt.clientY - r.top }
  }
  overlay.addEventListener('mousedown', (e)=>{
    if(tool!=='deleteWord' && tool!=='replace') return
    if(e.target!==overlay && !(e.target.classList && e.target.classList.contains('draw-canvas'))) return
    active=true; const p=pos(e); sx=p.x; sy=p.y
    ghost=document.createElement('div')
    ghost.style.cssText=`position:absolute;left:${sx}px;top:${sy}px;width:0;height:0;background:rgba(255,255,255,0.9);border:1.5px dashed #ef4444;pointer-events:none;z-index:5;`
    overlay.appendChild(ghost)
    e.preventDefault()
  })
  window.addEventListener('mousemove', (e)=>{
    if(!active || !ghost) return
    const r=overlay.getBoundingClientRect()
    const pt=e; const cx=pt.clientX-r.left, cy=pt.clientY-r.top
    const x=Math.min(sx,cx), y=Math.min(sy,cy), w=Math.abs(cx-sx), h=Math.abs(cy-sy)
    ghost.style.left=x+'px'; ghost.style.top=y+'px'; ghost.style.width=w+'px'; ghost.style.height=h+'px'
  })
  window.addEventListener('mouseup', async (e)=>{
    if(!active) return; active=false
    if(ghost){
      const gx=parseFloat(ghost.style.left), gy=parseFloat(ghost.style.top), gw=parseFloat(ghost.style.width), gh=parseFloat(ghost.style.height)
      ghost.remove(); ghost=null
      if(gw<6 && gh<6) return // treat as click — handleOverlayClick already created the quick box
      if(tool==='deleteWord'){ addDeleteRect(overlay, pageIndex, gx, gy, gw, Math.max(gh,12)) }
      else if(tool==='replace'){ await doReplace(overlay, pageIndex, gx, gy, gw, Math.max(gh,14)) }
    }
  })
}
function setEraseCursor(){
  const cross = (tool==='deleteWord'||tool==='replace')
  document.querySelectorAll('.draw-canvas').forEach(c=> c.style.cursor = cross ? 'crosshair' : 'default')
  document.querySelectorAll('.overlay').forEach(o=> o.style.cursor = cross ? 'crosshair' : 'default')
}
document.getElementById('deleteWordBtn')?.addEventListener('click', ()=>{
  tool='deleteWord'; document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active')); document.querySelector('[data-tool="deleteWord"]')?.classList.add('active')
  setEraseCursor()
  status('Erase: CLICK a word to delete it precisely, DOUBLE-CLICK the line, or DRAG an area')
})
document.getElementById('replaceWordBtn')?.addEventListener('click', ()=>{
  tool='replace'; document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active')); document.querySelector('[data-tool="replace"]')?.classList.add('active')
  setEraseCursor()
  status('Replace mode: PRESS + DRAG over a word, then type the replacement')
})

// Replace flow: white-out first, then replacement can be TEXT and/or IMAGE
function openReplaceModal(pageLabel){
  return new Promise(resolve=>{
    const m=document.getElementById('replaceModal')
    const txt=document.getElementById('replaceTextInput'), file=document.getElementById('replaceImageInput')
    const prev=document.getElementById('replaceImgPreview'), ok=document.getElementById('replaceConfirm'), cancel=document.getElementById('replaceCancel')
    document.getElementById('replaceHint').textContent=`Words on page ${pageLabel} are whited-out (looks deleted now). Type replacement text, choose an image, or both — then Apply.`
    txt.value=''; file.value=''; prev.textContent='No image chosen'; prev.style.color='#94a3b8'
    let dataUrl=null, fileName=''
    file.onchange=()=>{ const f=file.files[0]; if(!f){ dataUrl=null; prev.textContent='No image chosen'; return } fileName=f.name; fileToDataUrl(f).then(u=>{ dataUrl=u; prev.textContent=`✓ Image: ${f.name}`; prev.style.color='#22c55e' }) }
    let done=false
    function cleanup(val){ if(done) return; done=true; m.classList.add('hidden'); ok.onclick=null; cancel.onclick=null; m.onclick=null; resolve(val) }
    ok.onclick=()=>cleanup({text: txt.value.trim(), dataUrl, fileName})
    cancel.onclick=()=>cleanup(null)
    m.onclick=(e)=>{ if(e.target===m) cleanup(null) }
    m.classList.remove('hidden'); setTimeout(()=>txt.focus(),60)
  })
}
async function doReplace(overlay, pageIndex, rx, ry, rw, rh){
  addDeleteRect(overlay, pageIndex, rx, ry, rw, rh)
  const res = await openReplaceModal(pageIndex+1)
  if(!res) return status('Kept as white-out (no replacement). Words look deleted now and on Save.')
  const hasText = res.text && res.text.length>0
  if(!hasText && !res.dataUrl) return status('Kept as white-out (empty replacement).')
  pushUndo()
  let imgH=0
  if(res.dataUrl){
    try{
      const probe=new Image(); probe.src=res.dataUrl; await probe.decode().catch(()=>{})
      const iw=probe.naturalWidth||400, ih=probe.naturalHeight||300
      const w=Math.max(rw, 60)
      imgH=Math.max(20, Math.min(w*(ih/iw), rh*6, 400))
      const ed={id:Date.now()+Math.random(), pageIndex, type:'image', x:rx, y:ry, w, h:imgH, src:res.dataUrl}
      edits.push(ed); createImageEl(overlay, ed)
    }catch(err){ status('Image replacement failed: '+err.message) }
  }
  if(hasText){
    // text-only → inside the white-out; image+text → text just under the image
    const ty = res.dataUrl ? ry+imgH+4 : ry
    const ed={id:Date.now()+Math.random(), pageIndex, type:'text', x:rx+2, y:ty, w:Math.max(rw-4,60), h:Math.max(rh,16), text: res.text, fontSize: parseInt(document.getElementById('fontSize').value)||wordState.fontSize, color: document.getElementById('colorPicker').value||wordState.color, fontFamily: wordState.fontFamily, bold: wordState.bold, italic: wordState.italic, underline: wordState.underline}
    edits.push(ed); createTextEl(overlay, ed)
  }
  status(`Replaced on page ${pageIndex+1}${res.dataUrl?' with image':''}${hasText?' with text':''} — visible now, saved on Save.`)
}
// extend overlay click for delete/replace - will be added in renderAll via function
async function handleOverlayClick(overlay, pageIndex, e){
  if(tool==='deleteWord'){
    // precise: detect the word under the cursor and erase exactly it
    const ok = await eraseWordAt(overlay, pageIndex, e.offsetX, e.offsetY, false)
    if(!ok) addDeleteRect(overlay, pageIndex, e.offsetX-50, e.offsetY-9)  // fallback for images/scans
  } else if(tool==='replace'){
    const rx=e.offsetX-60, ry=e.offsetY-9
    await doReplace(overlay, pageIndex, rx, ry, 120, 18)
  }
}

// Form fields
async function listFormFields(){
  try{
    const form = pdfLibDoc.getForm()
    const fields = form.getFields()
    if(fields.length===0){ formFieldsList.textContent='No form fields in this PDF'; return }
    formFieldsList.innerHTML=''
    fields.forEach(f=>{
      const div=document.createElement('div'); div.className='form-item'
      const name=f.getName(); const type=f.constructor.name
      div.innerHTML=`<b>${name}</b><br/><small>${type}</small><br/>`
      const inp=document.createElement('input'); inp.placeholder='Edit value'
      try{
        if(type==='PDFTextField') inp.value=f.getText()||''
        if(type==='PDFCheckBox') inp.type='checkbox', inp.checked=f.isChecked()
      }catch{}
      inp.addEventListener('change', ()=>{
        // store as edit to apply on save
        edits.push({id:Date.now()+Math.random(), pageIndex:-1, type:'form', name, value: inp.type==='checkbox'? inp.checked : inp.value, fieldType:type})
        status(`Form field ${name} staged`)
      })
      div.appendChild(inp); formFieldsList.appendChild(div)
    })
  }catch{ formFieldsList.textContent='No form fields or encrypted' }
}
function renderFormOverlays(overlay, pageIndex, viewport){
  // Visual boxes are complex to map; rely on list panel. Could add detection via pdf.js annotation layer if needed.
}

// Zoom / pagination (pagination is scroll now, buttons just scroll)
prevBtn.addEventListener('click', ()=> viewer.scrollBy({top:-600, behavior:'smooth'}))
nextBtn.addEventListener('click', ()=> viewer.scrollBy({top:600, behavior:'smooth'}))
zoomIn.addEventListener('click', async()=>{ currentZoom=Math.min(2.5, currentZoom+0.15); await renderAll() })
zoomOut.addEventListener('click', async()=>{ currentZoom=Math.max(0.5, currentZoom-0.15); await renderAll() })

// SAVE — directly to PDF, no Word (with optional cover merge)
saveBtn.addEventListener('click', async ()=>{
  if(!pdfLibDoc) return
  status('Saving...')
  try{
    // Word fonts
    const helv = await pdfLibDoc.embedFont(StandardFonts.Helvetica)
    const helvBold = await pdfLibDoc.embedFont(StandardFonts.HelveticaBold)
    const helvOblique = await pdfLibDoc.embedFont(StandardFonts.HelveticaOblique)
    const helvBoldOblique = await pdfLibDoc.embedFont(StandardFonts.HelveticaBoldOblique)
    const times = await pdfLibDoc.embedFont(StandardFonts.TimesRoman)
    const timesBold = await pdfLibDoc.embedFont(StandardFonts.TimesRomanBold)
    const courier = await pdfLibDoc.embedFont(StandardFonts.Courier)
    const courierBold = await pdfLibDoc.embedFont(StandardFonts.CourierBold)
    function pickFont(fam, bold, italic){
      if(fam?.includes('Courier')) return bold ? courierBold : courier
      if(fam?.includes('Times')) return bold ? timesBold : times
      if(bold && italic) return helvBoldOblique
      if(bold) return helvBold
      if(italic) return helvOblique
      return helv
    }
    // handle cover merge: create new doc with cover pages prepended
    let targetDoc = pdfLibDoc
    let pageOffset = 0
    let doMergeCover = coverDoc && mergeCoverCheck?.checked
    if(doMergeCover){
      const newDoc = await PDFDocument.create()
      const wantAll = coverAllPagesCheck?.checked
      const indices = wantAll ? coverDoc.getPageIndices() : [0]
      const coverPages = await newDoc.copyPages(coverDoc, indices)
      coverPages.forEach(p=> newDoc.addPage(p))
      pageOffset = coverPages.length
      targetDoc = newDoc
      status(`Merging ${pageOffset} cover page(s) as first page(s)...`)
    }
    const pages = pdfLibDoc.getPages()
    for(const ed of edits){
      if(ed.type==='form' && ed.pageIndex===-1) {
        try{
          const form=pdfLibDoc.getForm(); const f=form.getField(ed.name)
          if(ed.fieldType==='PDFTextField') f.constructor.name==='PDFTextField' && form.getTextField(ed.name).setText(String(ed.value))
          if(ed.fieldType==='PDFCheckBox') ed.value? form.getCheckBox(ed.name).check() : form.getCheckBox(ed.name).uncheck()
          if(ed.fieldType==='PDFDropdown') form.getDropdown(ed.name).select(String(ed.value))
        }catch(e){ console.warn('form field save failed', e) }
        continue
      }
      // headerFooter and pageNumber are handled after per-page edits (on final doc)
      if(ed.type==='headerFooter' || ed.type==='pageNumber' || ed.type==='table') continue
      if(ed.type==='line'){
        if(ed.pageIndex<0 || ed.pageIndex >= pages.length) continue
        const page=pages[ed.pageIndex]; const {width:pw,height:ph}=page.getSize()
        const ov=document.querySelectorAll('.overlay')[ed.pageIndex]; const sx=pw/(ov?ov.clientWidth:pw), sy=ph/(ov?ov.clientHeight:ph)
        const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy/2), w=ed.w*sx
        const c=ed.color||'#000000'; const r=parseInt(c.slice(1,3),16)/255,g=parseInt(c.slice(3,5),16)/255,b=parseInt(c.slice(5,7),16)/255
        page.drawLine({start:{x,y}, end:{x:x+w,y}, thickness:1.5, color:rgb(r,g,b)})
        continue
      }
      if(ed.pageIndex<0 || ed.pageIndex >= pages.length) continue
      const page = pages[ed.pageIndex]
      const { width: pw, height: ph } = page.getSize()
      const overlayEl = document.querySelectorAll('.overlay')[ed.pageIndex]
      const vw = overlayEl ? overlayEl.clientWidth : pw
      const vh = overlayEl ? overlayEl.clientHeight : ph
      const sx = pw / vw
      const sy = ph / vh
      if(ed.type==='text'){
        const font = pickFont(ed.fontFamily, ed.bold, ed.italic)
        const size = (ed.fontSize||14) * sx
        // alignment
        let x = ed.x * sx
        const textWidth = font.widthOfTextAtSize(ed.text, size)
        const boxW = ed.w * sx
        if(ed.align==='center') x = ed.x*sx + (boxW - textWidth)/2
        else if(ed.align==='right') x = ed.x*sx + (boxW - textWidth)
        // highlight background
        if(ed.highlight){
          const c=ed.highlight; const r=parseInt(c.slice(1,3),16)/255,g=parseInt(c.slice(3,5),16)/255,b=parseInt(c.slice(5,7),16)/255
          const hx=x, hy=ph - (ed.y*sy) - (ed.fontSize||14)*sy*0.9, hw=textWidth+4, hh=(ed.fontSize||14)*sy*1.1
          page.drawRectangle({x:hx-2,y:hy-2,width:hw,height:hh,color:rgb(r,g,b),borderWidth:0,opacity:0.9})
        }
        const y = ph - (ed.y * sy) - (ed.fontSize||14) * 0.9
        const colorHex = ed.color || '#000000'
        const r=parseInt(colorHex.slice(1,3),16)/255, g=parseInt(colorHex.slice(3,5),16)/255, b=parseInt(colorHex.slice(5,7),16)/255
        page.drawText(ed.text, { x, y, size, font, color: rgb(r,g,b), lineHeight: (ed.lineSpacing||1.2)*size, rotate: degrees(ed.rotation||0), opacity: (ed.opacity===undefined?1:ed.opacity) })
        // underline / strike
        if(ed.underline){
          const uy = y - 2
          page.drawLine({start:{x, y:uy}, end:{x: x+textWidth, y:uy}, thickness:0.8, color:rgb(r,g,b)})
        }
        if(ed.strike){
          const sy2 = y + size*0.35
          page.drawLine({start:{x, y:sy2}, end:{x: x+textWidth, y:sy2}, thickness:0.8, color:rgb(r,g,b)})
        }
      } else if(ed.type==='highlight'){
        const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy), w=ed.w*sx, h=ed.h*sy
        const c=ed.color||'#ffff00'; const r=parseInt(c.slice(1,3),16)/255, g=parseInt(c.slice(3,5),16)/255, b=parseInt(c.slice(5,7),16)/255
        page.drawRectangle({x,y,width:w,height:h, color: rgb(r,g,b), opacity: (ed.opacity||0.4)*0.5, borderColor: rgb(r,g,b), borderWidth:0})
      } else if(ed.type==='note'){
        const x=ed.x*sx, y=ph-(ed.y*sy)
        page.drawText('📌 '+ed.text, {x, y: y-10, size: 8, font: helv, color: rgb(0.8,0.5,0)})
      } else if(ed.type==='image'){
        try{
          let bytes = await fetch(ed.src).then(r=>r.arrayBuffer())
          let img
          const head = ed.src.slice(0,30)
          if(head.startsWith('data:image/png')){ img = await pdfLibDoc.embedPng(bytes) }
          else if(head.startsWith('data:image/jpeg')||head.startsWith('data:image/jpg')){ try{ img = await pdfLibDoc.embedJpg(bytes) }catch{ img = await pdfLibDoc.embedPng(await rasterDataUrlToPngBytes(ed.src)) } }
          else { img = await pdfLibDoc.embedPng(await rasterDataUrlToPngBytes(ed.src)) } // WEBP/GIF/SVG/BMP → rasterize via canvas (real conversion)
          const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy), w=ed.w*sx, h=ed.h*sy
          page.drawImage(img, {x,y,width:w,height:h, rotate: degrees(ed.rotation||0), opacity: (ed.opacity===undefined?1:ed.opacity)})
        }catch(e){ console.warn('image embed failed', e) }
      } else if(ed.type==='draw'){
        // draw polyline as series of lines (supports normalized fx/fy + legacy x/y points)
        for(let i=1;i<ed.points.length;i++){
          const p0=ed.points[i-1], p1=ed.points[i]
          const x0=(p0.fx!==undefined ? p0.fx*pw : p0.x*sx), y0=ph-(p0.fy!==undefined ? p0.fy*ph : p0.y*sy)
          const x1=(p1.fx!==undefined ? p1.fx*pw : p1.x*sx), y1=ph-(p1.fy!==undefined ? p1.fy*ph : p1.y*sy)
          const c=ed.color||'#000000'; const r=parseInt(c.slice(1,3),16)/255, g=parseInt(c.slice(3,5),16)/255, b=parseInt(c.slice(5,7),16)/255
          page.drawLine({start:{x:x0,y:y0}, end:{x:x1,y:y1}, thickness: (ed.width||2)*sx, color: rgb(r,g,b), opacity:1})
        }
      } else if(ed.type==='deleteWord'){
        // Opaque white cover — valid pdf-lib options only (color + opacity, white border, no fillOpacity, no black border)
        const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy), w=ed.w*sx, h=ed.h*sy
        page.drawRectangle({x, y, width:w, height:h, color: rgb(1,1,1), borderColor: rgb(1,1,1), borderWidth: 0, opacity: 1})
      } else if(ed.type==='shape'){
        const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy), w=ed.w*sx, h=ed.h*sy
        const bc=ed.borderColor||'#000000', br=parseInt(bc.slice(1,3),16)/255, bg=parseInt(bc.slice(3,5),16)/255, bb=parseInt(bc.slice(5,7),16)/255
        const opts={x, y, width:w, height:h, borderColor: rgb(br,bg,bb), borderWidth: (ed.borderWidth||2)*sx, borderOpacity: (ed.opacity===undefined?1:ed.opacity), rotate: degrees(ed.rotation||0)}
        if(ed.fill){ const fc=ed.fill, fr=parseInt(fc.slice(1,3),16)/255, fg=parseInt(fc.slice(3,5),16)/255, fb=parseInt(fc.slice(5,7),16)/255; opts.color=rgb(fr,fg,fb); opts.opacity=(ed.fillOpacity===undefined?0.25:ed.fillOpacity) }
        if(ed.shape==='ellipse') page.drawEllipse({...opts, xScale:w/2, yScale:h/2, x:x+w/2, y:y+h/2})
        else page.drawRectangle(opts)
      } else if(ed.type==='arrow'){
        const x0=ed.x*sx, y0=ph-ed.y*sy, x1=(ed.x+ed.w)*sx, y1=ph-(ed.y+ed.h)*sy
        const c=ed.color||'#000000', r=parseInt(c.slice(1,3),16)/255, g=parseInt(c.slice(3,5),16)/255, b=parseInt(c.slice(5,7),16)/255
        const th=(ed.width||2.5)*sx, col=rgb(r,g,b), op=(ed.opacity===undefined?1:ed.opacity)
        page.drawLine({start:{x:x0,y:y0}, end:{x:x1,y:y1}, thickness:th, color:col, opacity:op})
        const ang=Math.atan2(y1-y0,x1-x0), L=10*sx+th*2
        ;[[ang+Math.PI*0.85],[ang-Math.PI*0.85]].forEach(([a])=>{ page.drawLine({start:{x:x1,y:y1}, end:{x:x1+L*Math.cos(a), y:y1+L*Math.sin(a)}, thickness:th, color:col, opacity:op}) })
      } else if(ed.type==='uann' || ed.type==='sann'){
        const c=ed.color||'#000000', r=parseInt(c.slice(1,3),16)/255, g=parseInt(c.slice(3,5),16)/255, b=parseInt(c.slice(5,7),16)/255
        const x=ed.x*sx, w=ed.w*sx, yy = ed.type==='uann' ? ph-(ed.y*sy)-(ed.h*sy)+1 : ph-(ed.y*sy)-(ed.h*sy)/2
        page.drawLine({start:{x, y:yy}, end:{x:x+w, y:yy}, thickness:(ed.width||1.5)*sx, color:rgb(r,g,b), opacity:(ed.opacity===undefined?1:ed.opacity)})
      } else if(ed.type==='stamp'){
        const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy), w=ed.w*sx, h=ed.h*sy
        const c=ed.color||'#dc2626', r=parseInt(c.slice(1,3),16)/255, g=parseInt(c.slice(3,5),16)/255, b=parseInt(c.slice(5,7),16)/255
        page.drawRectangle({x, y, width:w, height:h, borderColor:rgb(r,g,b), borderWidth:2*sx, borderOpacity:0.9})
        const size=Math.min(14*sx, h*0.5)
        const tw=helv.widthOfTextAtSize(ed.text||'APPROVED', size)
        page.drawText(ed.text||'APPROVED', {x:x+(w-tw)/2, y:y+(h-size)/2, size, font:helvBold, color:rgb(r,g,b), opacity:0.9})
      } else if(ed.type==='callout'){
        const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy), w=ed.w*sx, h=ed.h*sy
        const bc=ed.borderColor||'#f59e0b', br=parseInt(bc.slice(1,3),16)/255, bg=parseInt(bc.slice(3,5),16)/255, bb=parseInt(bc.slice(5,7),16)/255
        page.drawRectangle({x, y, width:w, height:h, color:rgb(1,1,0.85), borderColor:rgb(br,bg,bb), borderWidth:1.2*sx, opacity:0.95})
        const c=ed.color||'#000000', r=parseInt(c.slice(1,3),16)/255, g=parseInt(c.slice(3,5),16)/255, b=parseInt(c.slice(5,7),16)/255
        page.drawText(ed.text||'', {x:x+4, y:y+h-12, size:Math.min(10*sx,(ed.fontSize||11)*sx), font:helv, color:rgb(r,g,b), maxWidth:w-8})
      } else if(ed.type==='redact'){
        const x=ed.x*sx, y=ph-(ed.y*sy)-(ed.h*sy), w=ed.w*sx, h=ed.h*sy
        page.drawRectangle({x, y, width:w, height:h, color:rgb(0,0,0), borderColor:rgb(0,0,0), borderWidth:0, opacity:1})
      } else if(ed.type==='formCreate'){
        try{
          const form=pdfLibDoc.getForm()
          const x=ed.x*sx, y=ph-(ed.y*sy)-Math.max(ed.h*sy,18), w=ed.w*sx, h=Math.max(ed.h*sy,18)
          if(ed.field==='text'){ const tf=form.createTextField(ed.name); if(ed.required) tf.enableRequired(); tf.addToPage(page,{x,y,width:w,height:h}); if(ed.value) tf.setText(ed.value) }
          else if(ed.field==='check'){ const cb=form.createCheckBox(ed.name); if(ed.required) cb.enableRequired(); cb.addToPage(page,{x,y,width:Math.min(w,22),height:Math.min(h,22)}) }
          else if(ed.field==='drop'){ const dd=form.createDropdown(ed.name); if(ed.required) dd.enableRequired(); dd.addOptions(ed.options&&ed.options.length?ed.options:['Yes','No']); dd.addToPage(page,{x,y,width:w,height:h}) }
          else if(ed.field==='radio'){ const rg=form.createRadioGroup(ed.name); const ops=ed.options&&ed.options.length?ed.options:['Yes','No']; ops.forEach((op,i)=> rg.addOptionToPage(op, page, {x:x+i*(w/ops.length), y, width:Math.min(w/ops.length,24), height:Math.min(h,22)})) }
          form.updateFieldAppearances()
        }catch(e){ console.warn('formCreate failed', e) }
      }
    }
    if(window.__flattenOnSave){ try{ pdfLibDoc.getForm().flatten() }catch(e){ console.warn('flatten failed', e) } window.__flattenOnSave=false }
    // word tables / headerFooter / pageNumber / lines need to be drawn on final pages (after deletions/cover)
    // collect word table/headers
    const headerEdits = edits.filter(e=> e.type==='headerFooter')
    const tableEdits = edits.filter(e=> e.type==='table')
    const lineEdits = edits.filter(e=> e.type==='line')
    const pageNumberEdits = edits.filter(e=> e.type==='pageNumber')

    // build final doc with deletions and cover
    let finalBytes
    const needNewDoc = doMergeCover || pagesToDelete.size>0 || headerEdits.length>0 || pageNumberEdits.length>0
    if(needNewDoc){
      const finalDoc = doMergeCover ? targetDoc : await PDFDocument.create()
      const keepIndices = pdfLibDoc.getPageIndices().filter(i=> !pagesToDelete.has(i))
      if(keepIndices.length===0) throw new Error('Cannot delete all pages - keep at least one')
      const mainPages = await finalDoc.copyPages(pdfLibDoc, keepIndices)
      mainPages.forEach(p=> finalDoc.addPage(p))

      // draw word elements on finalDoc pages (map original indices to final indices)
      const finalPages = finalDoc.getPages()
      const coverOffset = doMergeCover ? pageOffset : 0
      // pageNumbers: bottom center of every page (including cover if desired)
      for(const pn of pageNumberEdits){
        const total = finalPages.length
        finalPages.forEach((pg, idx)=>{
          const {width, height} = pg.getSize()
          const txt = (pn.style||'Page {n} of {total}').replace('{n}', String(idx+1)).replace('{total}', String(total))
          const f = helv
          const size=9
          const w = f.widthOfTextAtSize(txt, size)
          pg.drawText(txt, {x: (width-w)/2, y: 14, size, font:f, color: rgb(0.3,0.3,0.3)})
        })
      }
      // headers/footers
      for(const hf of headerEdits){
        const isHeader = hf.kind==='header'
        finalPages.forEach(pg=>{
          const {width, height} = pg.getSize()
          const f = pickFont(hf.fontFamily||'Helvetica', hf.bold, hf.italic)
          const size=10
          const y = isHeader ? height-18 : 22
          const x = (width - f.widthOfTextAtSize(hf.text, size))/2
          pg.drawText(hf.text, {x, y, size, font:f, color: rgb(0.2,0.2,0.2)})
        })
      }
      // word tables (draw only on first page(s) as placed - approximate to first kept page)
      for(const tb of tableEdits){
        // draw on first final page after cover
        const pg = finalPages[coverOffset] || finalPages[0]
        const {width:pw, height:ph} = pg.getSize()
        // map table from overlay coords (first page overlay size)
        const ov0 = document.querySelectorAll('.overlay')[0]
        const sx = pw/(ov0?ov0.clientWidth:pw), sy=ph/(ov0?ov0.clientHeight:ph)
        const tx = tb.x*sx, ty = ph - tb.y*sy - tb.h*sy
        const tw = tb.w*sx, th = tb.h*sy
        const cellW = tw / tb.cols, cellH = th / tb.rows
        // outer rect
        pg.drawRectangle({x:tx, y:ty, width:tw, height:th, borderColor: rgb(0.2,0.2,0.2), borderWidth:1, color: rgb(1,1,1)})
        // grid
        for(let r=1;r<tb.rows;r++) pg.drawLine({start:{x:tx, y:ty+ r*cellH}, end:{x:tx+tw, y:ty+r*cellH}, thickness:0.7, color: rgb(0.6,0.6,0.6)})
        for(let c=1;c<tb.cols;c++) pg.drawLine({start:{x:tx+ c*cellW, y:ty}, end:{x:tx+c*cellW, y:ty+th}, thickness:0.7, color: rgb(0.6,0.6,0.6)})
        // cell text
        const f = helv
        for(let r=0;r<tb.rows;r++) for(let c=0;c<tb.cols;c++){
          const txt = tb.cells[r][c] || ''
          if(!txt) continue
          const cx = tx + c*cellW + 3, cy = ty + th - r*cellH - 12
          pg.drawText(String(txt).slice(0,30), {x:cx, y:cy, size:7, font:f, color: rgb(0,0,0)})
        }
      }
      // lines already handled per-page earlier, but if they were on deleted pages they are skipped; for remaining they are already drawn on pdfLibDoc pages, which got copied, so fine

      if(window.__stripMeta){ try{ finalDoc.setTitle(''); finalDoc.setAuthor(''); finalDoc.setSubject(''); finalDoc.setKeywords([]); finalDoc.setCreator(''); finalDoc.setProducer('BOTIM DOCSHUB') }catch{} window.__stripMeta=false }
      else { try{ finalDoc.setAuthor('Otim Noah'); finalDoc.setProducer('BOTIM DOCSHUB by Otim Noah'); finalDoc.setCreator('BOTIM DOCSHUB v1.0 - Otim Noah') }catch{} }
      finalBytes = await finalDoc.save()
    } else {
      if(window.__stripMeta){ try{ pdfLibDoc.setTitle(''); pdfLibDoc.setAuthor(''); pdfLibDoc.setSubject(''); pdfLibDoc.setKeywords([]); pdfLibDoc.setCreator(''); pdfLibDoc.setProducer('BOTIM DOCSHUB') }catch{} window.__stripMeta=false }
      else { try{ pdfLibDoc.setAuthor('Otim Noah'); pdfLibDoc.setProducer('BOTIM DOCSHUB by Otim Noah') }catch{} }
      finalBytes = await pdfLibDoc.save()
    }
    // TRUE redaction: pages carrying redact marks are rasterized so underlying
    // text/images become unrecoverable pixels (verified below). opt-in via window.__redactRaster.
    if(window.__redactRaster && edits.some(e=>e.type==='redact')){
      try{
        status('Applying true redaction (rasterizing marked pages)…')
        const keep2 = pdfLibDoc.getPageIndices().filter(i=> !pagesToDelete.has(i))
        const needNew2 = doMergeCover || pagesToDelete.size>0 || edits.some(e=>e.type==='headerFooter'||e.type==='pageNumber')
        finalBytes = await rasterizeRedactedPages(finalBytes, keep2, needNew2)
      }catch(err){ status('Redaction raster failed ('+err.message+') — saved with opaque covers instead') }
      window.__redactRaster=null
    }
    const blob = new Blob([finalBytes], {type:'application/pdf'})
    const url = URL.createObjectURL(blob)
    const a=document.createElement('a'); a.href=url
    let fname='edited-direct.pdf'
    if(doMergeCover && pagesToDelete.size>0) fname='edited-cover-pages-deleted.pdf'
    else if(doMergeCover) fname='merged-with-cover.pdf'
    else if(pagesToDelete.size>0) fname='edited-pages-deleted.pdf'
    if(window.__saveAsName){ fname=window.__saveAsName; window.__saveAsName=null }
    a.download=fname; a.click()
    URL.revokeObjectURL(url)
    let msg=`✓ Saved as ${fname} — no Word conversion`
    if(doMergeCover) msg+=` + ${pageOffset} cover page(s)`
    if(pagesToDelete.size>0) msg+=` - ${pagesToDelete.size} page(s) deleted`
    // also list deleteWord count
    const delCount = edits.filter(e=>e.type==='deleteWord').length
    if(delCount>0) msg+=` - ${delCount} word block(s) erased`
    status(msg)
  }catch(e){ console.error(e); status('Save failed: '+e.message) }
})

// TRUE-redaction helper: replaces redacted pages' vector content with a flat
// rendering so covered text cannot be selected, searched, copied or extracted.
async function rasterizeRedactedPages(bytes, keep, needNew){
  // map redact edits (pdfLibDoc indices) to final-doc indices (mirror of copy logic above)
  const redactSrc = edits.filter(e=>e.type==='redact').map(e=>e.pageIndex)
  const lib = await PDFDocument.load(bytes)
  const finalCount = lib.getPageCount()
  const coverShift = needNew ? Math.max(0, finalCount - keep.length) : 0
  const finalIdx = [...new Set(redactSrc.filter(i=>keep.includes(i)).map(i=> coverShift + keep.indexOf(i)).filter(i=>i>=0 && i<finalCount))]
  if(!finalIdx.length) return bytes
  const SCALE = 2
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise
  for(const fi of finalIdx){
    const page = await doc.getPage(fi+1)
    const v0 = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: SCALE })
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
    const cx = c.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0,0,c.width,c.height)
    await page.render({ canvasContext: cx, viewport: vp }).promise
    const blob = await new Promise(r=> c.toBlob(r, 'image/jpeg', 0.92))
    const buf = await blob.arrayBuffer()
    const img = await lib.embedJpg(buf)
    const pg = lib.getPage(fi)
    try{ pg.node.delete(PDFName.of('Annots')) }catch(e){}   // drop widgets/links on redacted pages
    try{ pg.node.delete(PDFName.of('Contents')) }catch(e){} // drop vector content (the actual redaction)
    const { width, height } = pg.getSize()
    pg.drawImage(img, { x: 0, y: 0, width, height })
  }
  const out = await lib.save()
  // verify: rasterized pages must expose no text layer and none of the marked terms
  try{
    const vdoc = await pdfjsLib.getDocument({ data: out }).promise
    const terms = (window.__redactTerms || []).map(t=> String(t).toLowerCase())
    let leftover = 0
    const found = new Set()
    for(const fi of finalIdx){
      const tc = await (await vdoc.getPage(fi+1)).getTextContent()
      const txt = (tc.items||[]).map(it=>it.str||'').join(' ')
      if(txt.trim().length > 0) leftover++
      for(const t of terms){ if(t && txt.toLowerCase().includes(t)) found.add(t) }
    }
    await vdoc.destroy(); await doc.destroy()
    window.__redactTerms = null
    if(found.size) status(`⚠ Redaction incomplete — still extractable: ${[...found].slice(0,3).join(', ')}`)
    else if(leftover) status(`✓ Redactions applied (${finalIdx.length} page${finalIdx.length>1?'s':''} rasterized; no marked terms extractable)`)
    else status(`✓ True redaction verified — ${finalIdx.length} page${finalIdx.length>1?'s':''} now contain zero extractable text`)
  }catch(e){ try{ await doc.destroy() }catch(_){} }
  return out
}

// ===== Bridge for professional extension modules (pro-*.js) =====
// Exposes core state + actions so new features reuse the existing architecture.
window.PDFE = {
  get edits(){ return edits }, set edits(v){ edits=v },
  get pdfLibDoc(){ return pdfLibDoc }, set pdfLibDoc(v){ pdfLibDoc=v },
  get pdfDocProxy(){ return pdfDocProxy }, set pdfDocProxy(v){ pdfDocProxy=v },
  get originalBytes(){ return originalBytes }, set originalBytes(v){ originalBytes=v },
  get totalPages(){ return totalPages }, set totalPages(v){ totalPages=v },
  get currentZoom(){ return currentZoom }, set currentZoom(v){ currentZoom=v },
  get pagesToDelete(){ return pagesToDelete },
  get coverDoc(){ return coverDoc }, get coverBytes(){ return coverBytes }, get coverFileName(){ return coverFileName },
  get tool(){ return tool }, set tool(v){ tool=v },
  get selectedEl(){ return selectedEl },
  get viewer(){ return viewer }, get pdfContainer(){ return pdfContainer }, get dropZone(){ return dropZone },
  get fileInput(){ return fileInput }, get saveBtn(){ return saveBtn },
  get formFieldsList(){ return formFieldsList },
  libs: { PDFDocument, rgb, StandardFonts, degrees, grayscale, pdfjsLib },
  loadPdf, renderAll, renderPageList, listFormFields, status, pushUndo, undo, redo,
  refreshOverlays, selectEl, getEditForEl, setEraseCursor, visiblePageIndex, visibleOverlay,
  createTextEl, createImageEl, createNoteEl, createHighlightEl, createDeleteEl,
  createTableEl, createHeaderFooterEl, createLineEl,
  makeDraggable, makeResizable, fileToDataUrl, rasterDataUrlToPngBytes, hexToRgba, showPrompt,
  handleCoverFile,
  removeSelected(){
    if(!selectedEl) return false
    pushUndo()
    const id=selectedEl.dataset.id
    edits = edits.filter(ed=> String(ed.id)!==String(id))
    selectedEl.remove(); selectedEl=null
    return true
  },
  // reload viewer from raw PDF bytes (used after page-ops rebuilds / compression / new docs)
  async reloadFromBytes(bytes, opts={}){
    originalBytes = bytes
    pdfLibDoc = await PDFDocument.load(bytes)
    const task = pdfjsLib.getDocument({ data: bytes })
    pdfDocProxy = await task.promise
    totalPages = pdfDocProxy.numPages
    if(!opts.keepEdits) edits=[]
    pagesToDelete.clear()
    pdfContainer.innerHTML=''
    const dz=document.getElementById('dropZone'); if(dz) dz.style.display='none'
    const sb=document.getElementById('saveBtn'); if(sb) sb.disabled=false
    await renderAll(); renderPageList(); await listFormFields()
  }
}
window.dispatchEvent(new Event('pdfe-ready'))
