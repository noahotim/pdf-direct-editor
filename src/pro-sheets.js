// pro-sheets: Excel spreadsheet editor — open/create/edit/save .xlsx, .csv, PDF grid
import { status, reg, downloadBlob, pickFiles } from './pro-core.js'

const st = { wb: null, sheetNames: [], activeSheet: 0, fileName: 'spreadsheet', modified: false, data: {}, colW: 28, rowH: 22, mergeCells: {}, selection: null, formulaBar: null }

function el(id) { return document.getElementById(id) }

async function loadXlsx() { return (await import('xlsx')).default }

// ---------- grid rendering ----------
const COLS = 26 // A-Z
function colName(c) { return String.fromCharCode(65 + c) }
function cellId(r, c) { return colName(c) + (r + 1) }
function parseCellRef(ref) {
  const m = ref.match(/^([A-Z])(\d+)$/)
  if (!m) return null
  return { r: parseInt(m[2]) - 1, c: m[1].charCodeAt(0) - 65 }
}

function getSheetData() {
  const name = st.sheetNames[st.activeSheet]
  return st.data[name] || {}
}
function setCell(r, c, val) {
  const name = st.sheetNames[st.activeSheet]
  if (!st.data[name]) st.data[name] = {}
  const ref = cellId(r, c)
  st.data[name][ref] = val
  st.modified = true
}

function renderGrid() {
  const wrap = el('sheetGridWrap')
  if (!wrap) return
  // show/hide sheet tabs
  const tabsBar = el('sheetTabs')
  if (tabsBar) {
    tabsBar.innerHTML = ''
    st.sheetNames.forEach((n, i) => {
      const t = document.createElement('button')
      t.className = 'sheet-tab-btn' + (i === st.activeSheet ? ' active' : '')
      t.textContent = n
      t.onclick = () => { st.activeSheet = i; renderGrid() }
      t.ondblclick = () => {
        const nn = prompt('Rename sheet:', n)
        if (nn && nn !== n && !st.sheetNames.includes(nn)) {
          st.data[nn] = st.data[n]; delete st.data[n]
          st.sheetNames[i] = nn; if (st.activeSheet === i) renderGrid()
        }
      }
      t.oncontextmenu = (e) => {
        e.preventDefault()
        if (st.sheetNames.length <= 1) return status('Keep at least one sheet')
        if (confirm(`Delete sheet "${n}"?`)) {
          delete st.data[n]; st.sheetNames.splice(i, 1)
          if (st.activeSheet >= st.sheetNames.length) st.activeSheet = st.sheetNames.length - 1
          renderGrid(); status(`Deleted sheet: ${n}`)
        }
      }
      tabsBar.appendChild(t)
    })
    // add sheet button
    const addBtn = document.createElement('button')
    addBtn.className = 'sheet-tab-btn'
    addBtn.textContent = '+'
    addBtn.title = 'Add new sheet'
    addBtn.onclick = () => {
      let n = 'Sheet' + (st.sheetNames.length + 1)
      while (st.sheetNames.includes(n)) n = n + '1'
      st.sheetNames.push(n); st.data[n] = {}
      st.activeSheet = st.sheetNames.length - 1
      renderGrid(); status(`Added sheet: ${n}`)
    }
    tabsBar.appendChild(addBtn)
  }
  // update header
  const cnt = el('sheetCount')
  if (cnt) cnt.textContent = `${st.sheetNames.length} sheet(s) — ${st.sheetNames[st.activeSheet]}`
  const data = getSheetData()
  // find used range
  let maxR = 19, maxC = COLS - 1
  for (const k of Object.keys(data)) {
    const p = parseCellRef(k)
    if (p) { if (p.r > maxR) maxR = Math.min(p.r, 99); if (p.c > maxC) maxC = Math.min(p.c, COLS - 1) }
  }
  maxR += 5; maxR = Math.min(maxR, 100)
  // build HTML table
  let html = '<table class="sheet-grid"><thead><tr><th class="sheet-corner"></th>'
  for (let c = 0; c <= maxC; c++) html += `<th class="sheet-col-h">${colName(c)}</th>`
  html += '</tr></thead><tbody>'
  for (let r = 0; r <= maxR; r++) {
    html += `<tr><td class="sheet-row-h">${r + 1}</td>`
    for (let c = 0; c <= maxC; c++) {
      const ref = cellId(r, c)
      const val = data[ref] || ''
      const display = typeof val === 'object' && val !== null ? (val.w || val.v || '') : val
      html += `<td class="sheet-cell" data-r="${r}" data-c="${c}" contenteditable="true">${escHtml(String(display))}</td>`
    }
    html += '</tr>'
  }
  html += '</tbody></table>'
  wrap.innerHTML = html
  // wire cell editing
  wrap.querySelectorAll('.sheet-cell').forEach((td) => {
    td.onfocus = () => {
      const r = +td.dataset.r, c = +td.dataset.c
      const ref = cellId(r, c)
      st.selection = { r, c }
      const fb = el('formulaBarInput')
      if (fb) fb.value = String(data[ref] || '')
      const cn = el('cellName')
      if (cn) cn.textContent = ref
    }
    td.oninput = () => {
      const r = +td.dataset.r, c = +td.dataset.c
      const raw = td.textContent.trim()
      setCell(r, c, raw)
      // update formula bar
      const fb = el('formulaBarInput')
      if (fb && st.selection && st.selection.r === r && st.selection.c === c) fb.value = raw
    }
    td.onkeydown = (e) => {
      const r = +td.dataset.r, c = +td.dataset.c
      if (e.key === 'Tab') { e.preventDefault(); moveTo(c + (e.shiftKey ? -1 : 1), r) }
      else if (e.key === 'Enter') { e.preventDefault(); moveTo(c, r + (e.shiftKey ? -1 : 1)) }
    }
  })
}
function moveTo(c, r) {
  const cells = el('sheetGridWrap')?.querySelectorAll('.sheet-cell')
  if (!cells) return
  const target = el('sheetGridWrap')?.querySelector(`.sheet-cell[data-r="${r}"][data-c="${c}"]`)
  if (target) target.focus()
}
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// ---------- open / create ----------
function resetSheet() {
  st.wb = null; st.sheetNames = ['Sheet1']; st.activeSheet = 0; st.data = { 'Sheet1': {} }; st.fileName = 'spreadsheet'; st.modified = false
  renderGrid(); status('New spreadsheet — type cells, then Save as Excel/CSV/PDF')
}
async function openExcel(file) {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  st.wb = XLSX.read(buf, { type: 'array', cellStyles: true })
  st.sheetNames = st.wb.SheetNames.slice()
  st.activeSheet = 0
  st.data = {}
  st.fileName = (file.name || 'spreadsheet').replace(/\.(xlsx|xls|csv)$/i, '')
  // convert each sheet to cell-ref keyed object
  for (const sn of st.sheetNames) {
    const ws = st.wb.Sheets[sn]
    const d = {}
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const ref = XLSX.utils.encode_cell({ r, c })
        const cell = ws[ref]
        if (cell) d[ref] = cell.w || cell.v || ''
      }
    }
    st.data[sn] = d
  }
  st.modified = false
  renderGrid()
  status(`Opened ${file.name} — ${st.sheetNames.length} sheet(s), edit then Save`)
}

// ---------- save ----------
async function saveExcel() {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  for (const sn of st.sheetNames) {
    const d = st.data[sn] || {}
    // find range
    let maxR = 0, maxC = 0
    for (const k of Object.keys(d)) {
      const p = parseCellRef(k)
      if (p) { if (p.r > maxR) maxR = p.r; if (p.c > maxC) maxC = p.c }
    }
    const range = { s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } }
    const ws = XLSX.utils.aoa_to_sheet([])
    ws['!ref'] = XLSX.utils.encode_range(range)
    for (const k of Object.keys(d)) {
      const p = parseCellRef(k)
      if (p && d[k] !== '' && d[k] !== undefined) ws[XLSX.utils.encode_cell(p)] = { v: d[k], t: 's' }
    }
    XLSX.utils.book_append_sheet(wb, ws, sn)
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), st.fileName + '.xlsx')
  st.modified = false; status('Saved as Excel (.xlsx)')
}
function saveCsv() {
  const d = getSheetData()
  const rows = []
  let maxR = 0, maxC = 0
  for (const k of Object.keys(d)) { const p = parseCellRef(k); if (p) { if (p.r > maxR) maxR = p.r; if (p.c > maxC) maxC = p.c } }
  for (let r = 0; r <= maxR; r++) {
    const row = []
    for (let c = 0; c <= maxC; c++) { row.push(String(d[cellId(r, c)] || '').replace(/"/g, '""')) }
    rows.push(row.map((c) => `"${c}"`).join(','))
  }
  downloadBlob(new Blob([rows.join('\n')], { type: 'text/csv' }), st.fileName + '.csv')
  status('Saved as CSV')
}
async function savePdfFromSheet() {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const d = getSheetData()
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Courier)
  const bold = await doc.embedFont(StandardFonts.CourierBold)
  const W = 842, H = 595, M = 30, COLW = (W - 2 * M) / Math.min(COLS, 10)
  let page = doc.addPage([W, H])
  let y = H - M
  // header
  for (let c = 0; c < Math.min(COLS, 10); c++) {
    page.drawText(colName(c), { x: M + c * COLW + 2, y, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2) })
  }
  y -= 14
  let maxR = 0
  for (const k of Object.keys(d)) { const p = parseCellRef(k); if (p && p.r > maxR) maxR = p.r }
  for (let r = 0; r <= Math.min(maxR, 80); r++) {
    if (y < M + 12) { page = doc.addPage([W, H]); y = H - M }
    page.drawText(String(r + 1).padStart(3), { x: M - 24, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) })
    for (let c = 0; c < Math.min(COLS, 10); c++) {
      const val = String(d[cellId(r, c)] || '')
      if (val) page.drawText(val.substring(0, 18), { x: M + c * COLW + 2, y, size: 8, font, color: rgb(0, 0, 0) })
    }
    y -= 12
  }
  downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), st.fileName + '.pdf')
  status('Exported spreadsheet as PDF')
}

// ---------- menu actions ----------
function sheetTabShow() { document.querySelector('.side-tab[data-tab="sheets"]')?.click() }

// ---------- setup ----------
function setupSheetTab() {
  const tabs = document.querySelector('.side-tabs')
  if (tabs && !tabs.querySelector('[data-tab="sheets"]')) {
    const b = document.createElement('button')
    b.className = 'side-tab'; b.dataset.tab = 'sheets'; b.textContent = 'Sheets'
    const ai = tabs.querySelector('[data-tab="ai"]')
    if (ai) ai.before(b); else tabs.appendChild(b)
    const p = document.createElement('div'); p.id = 'tab-sheets'; p.className = 'hidden'
    el('sidebar')?.appendChild(p)
  }
  const tab = el('tab-sheets')
  if (!tab) return
  tab.innerHTML = `
    <h3>Excel <span style="color:#22c55e;font-size:11px;">Spreadsheet Editor</span></h3>
    <div class="tool-group" style="border-color:#22c55e;">
      <h4>Create / Open</h4>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button id="sheetNew" class="btn btn-small" style="flex:1;background:#22c55e;color:#fff;">+ New Spreadsheet</button>
      </div>
      <label class="btn btn-small" style="background:#16a34a;color:#fff;text-align:center;">📂 Open Excel (.xlsx/.csv) <input type="file" id="sheetOpen" accept=".xlsx,.xls,.csv" hidden /></label>
    </div>
    <div class="tool-group" style="border-color:#22c55e;">
      <h4>Formulas</h4>
      <div id="cellName" style="font-weight:bold;color:#22c55e;margin-bottom:2px;">A1</div>
      <input id="formulaBarInput" type="text" placeholder="Enter value or formula (e.g. =SUM(A1:A5))" style="width:100%;padding:4px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;" />
      <div id="sheetCount" style="font-size:10px;color:#94a3b8;margin-top:4px;">1 sheet — Sheet1</div>
    </div>
    <div class="tool-group" style="border-color:#22c55e;">
      <h4>Save / Export</h4>
      <button id="sheetSaveXlsx" class="btn btn-small" style="background:#22c55e;color:#fff;">💾 Save as Excel (.xlsx)</button>
      <button id="sheetSaveCsv" class="btn btn-small">💾 Save as CSV</button>
      <button id="sheetSavePdf" class="btn btn-small" style="background:#16a34a;color:#fff;">💾 Export PDF</button>
    </div>
  `
  // create the grid area in the viewer
  let canvas = el('docCanvasWrap')
  if (!canvas) {
    canvas = document.createElement('div')
    canvas.id = 'docCanvasWrap'
    canvas.style.cssText = 'display:none;width:100%;max-width:1100px;margin:10px auto;'
    canvas.innerHTML = `<div contenteditable="true" id="docWordCanvas" spellcheck="true" style="display:none;background:#fff;color:#111;min-height:70vh;padding:48px 56px;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:Georgia,serif;font-size:16px;line-height:1.55;outline:none;"></div><div id="docSlides" style="display:none;flex-direction:column;gap:10px;"></div><div id="sheetCanvas" style="display:none;width:100%;overflow:auto;max-height:70vh;background:#fff;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.5);"><div id="sheetGridWrap" style="min-width:600px;"></div></div><div id="sheetTabs" style="display:flex;gap:2px;margin-top:6px;"></div>`
    el('viewer')?.appendChild(canvas)
  } else {
    // ensure sheetCanvas exists inside
    if (!el('sheetCanvas')) {
      const sc = document.createElement('div')
      sc.id = 'sheetCanvas'
      sc.style.cssText = 'display:none;width:100%;overflow:auto;max-height:70vh;background:#fff;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.5);'
      sc.innerHTML = '<div id="sheetGridWrap" style="min-width:600px;"></div>'
      canvas.appendChild(sc)
      // also add sheet tabs below canvas
      const stb = document.createElement('div')
      stb.id = 'sheetTabs'
      stb.style.cssText = 'display:flex;gap:2px;margin-top:6px;'
      canvas.appendChild(stb)
    }
  }
  const showSheet = () => {
    el('sheetCanvas').style.display = 'block'
    el('sheetGridWrap').style.display = 'block'
    el('sheetTabs').style.display = 'flex'
    el('docCanvasWrap').style.display = 'block'
    el('pdfContainer').style.display = 'none'
    el('dropZone').style.display = 'none'
    el('docWordCanvas').style.display = 'none'
    el('docSlides').style.display = 'none'
    // update doc mode for tab switching
    window.__sheetMode = true
    renderGrid()
  }
  // hide other doc canvases
  const hideAll = () => {
    el('sheetCanvas').style.display = 'none'
    el('sheetTabs').style.display = 'none'
    if (el('docCanvasWrap')) el('docCanvasWrap').style.display = 'none'
    el('pdfContainer').style.display = ''
    window.__sheetMode = false
  }
  el('sheetNew').onclick = () => { resetSheet(); showSheet() }
  el('sheetOpen').onchange = async (e) => { if (e.target.files[0]) { await openExcel(e.target.files[0]); showSheet() } }
  el('sheetSaveXlsx').onclick = saveExcel
  el('sheetSaveCsv').onclick = saveCsv
  el('sheetSavePdf').onclick = savePdfFromSheet
  el('formulaBarInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && st.selection) {
      const val = e.target.value.trim()
      setCell(st.selection.r, st.selection.c, val)
      renderGrid()
    }
  })
  // tab switching: hide sheets when other tabs are clicked
  document.querySelector('.side-tabs')?.addEventListener('click', (ev) => {
    const t = ev.target.closest('.side-tab')
    if (!t) return
    if (t.dataset.tab === 'sheets') showSheet()
    else if (t.dataset.tab !== 'docs' && window.__sheetMode) hideAll()
  })
  // file input accepts xlsx
  const fi = el('fileInput')
  if (fi) fi.accept += ',.xlsx,.xls'
}

;(() => { setupSheetTab() })()

reg('sheets-tab', sheetTabShow)
reg('sheets-new', () => { sheetTabShow(); el('sheetNew')?.click() })
reg('sheets-open', () => el('sheetOpen')?.click())

export { openExcel, resetSheet }
