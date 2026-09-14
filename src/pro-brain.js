// pro-brain: FREE/LOCAL document intelligence workspace (no paid APIs, no cloud).
// Rule-based + statistical processing only — everything labeled "Local".
// Modules: analyze engine, Intel panel, smart search, Quick Actions NL,
// health, cleanup, privacy, metadata cleaner, tables, summary, academic,
// templates, batch extras, accessibility, recipes, command palette, suggestions.
import { E, status, reg, openDialog, showInfo, downloadBlob, downloadBytes, pickFiles, taskBegin, setBar, parseRange } from './pro-core.js'
import { rebuild, renderThumbs } from './pro-pages.js'
import {
  RX, uniq, extractContacts, extractPhones, detectSections, detectTitleAuthors,
  summarize, tokens, stem, buildIndex, relatedTerms, tableFromItems, gridToCsv,
  gridToJson, normHash, healthScore, privacyScan, parseCommand,
} from './brain-utils.js'
import { PDFName, PDFString } from 'pdf-lib'

const tick = () => new Promise((r) => setTimeout(r, 0))

// ================= Intel tab + Intelligence menu =================
;(() => {
  const tabs = document.querySelector('.side-tabs')
  if (tabs && !tabs.querySelector('[data-tab="intel"]')) {
    const b = document.createElement('button')
    b.className = 'side-tab'; b.dataset.tab = 'intel'; b.textContent = 'Intel 🧠'
    tabs.appendChild(b)
    const p = document.createElement('div')
    p.id = 'tab-intel'; p.className = 'hidden'
    p.innerHTML = `
      <h3>Document Intelligence <small style="color:#94a3b8;">(local)</small></h3>
      <div class="tool-group">
        <label style="font-size:11px;">Ask / Command <small style="color:#94a3b8;">e.g. "delete pages 2-4"</small></label>
        <div style="display:flex;gap:4px;"><input id="qaInput" placeholder='Try "remove blank pages"…' style="flex:1;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;" /><button id="qaGo" class="btn btn-small" style="width:auto;">▶</button></div>
        <div id="qaProposal" style="font-size:12px;"></div>
      </div>
      <div class="tool-group"><h4>📊 Overview</h4><div id="intelOverview" class="form-list">Open a PDF, then Analyze.</div>
        <div style="display:flex;gap:4px;"><button id="intelAnalyze" class="btn btn-small" style="flex:1;">🔍 Analyze Document</button></div>
      </div>
      <div class="tool-group"><h4>💡 Suggestions</h4><div id="intelSuggest" class="form-list">Run analysis first.</div></div>
      <div class="tool-group"><h4>🧰 Quick Tools</h4>
        <button data-qt="autofix" class="btn btn-small" style="background:#16a34a;color:#fff;">🔧 Auto-Fix Health Issues</button>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <button data-qt="health" class="btn btn-small" style="flex:1;">Health</button>
          <button data-qt="privacy" class="btn btn-small" style="flex:1;">Privacy</button>
          <button data-qt="clean" class="btn btn-small" style="flex:1;">Clean</button>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <button data-qt="summary" class="btn btn-small" style="flex:1;">Summary</button>
          <button data-qt="tables" class="btn btn-small" style="flex:1;">Tables</button>
          <button data-qt="academic" class="btn btn-small" style="flex:1;">Academic</button>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <button data-qt="templates" class="btn btn-small" style="flex:1;">Templates</button>
          <button data-qt="recipes" class="btn btn-small" style="flex:1;">Recipes</button>
          <button data-qt="a11y" class="btn btn-small" style="flex:1;">Access ♿</button>
        </div>
      </div>`
    document.getElementById('sidebar').appendChild(p)
  }
  // fix tab sync for the 5th tab (runs after shell's own handler via bubbling)
  document.querySelector('.side-tabs')?.addEventListener('click', () => {
    setTimeout(() => {
      document.querySelectorAll('.side-tab').forEach((x) => {
        const panel = document.getElementById('tab-' + x.dataset.tab)
        if (panel) panel.classList.toggle('hidden', !x.classList.contains('active'))
      })
    }, 0)
  })
  document.getElementById('qaGo')?.addEventListener('click', runQuickAction)
  document.getElementById('qaInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runQuickAction() })
  document.getElementById('intelAnalyze')?.addEventListener('click', async () => { await analyzeDoc(true); renderOverview(); renderSuggestions() })
  document.querySelectorAll('#tab-intel [data-qt]').forEach((b) => b.addEventListener('click', () => {
    const map = { autofix: 'bx-autofix', health: 'bx-health', privacy: 'bx-privacy', clean: 'bx-clean', summary: 'bx-summary', tables: 'bx-tables', academic: 'bx-academic', templates: 'bx-templates', recipes: 'bx-recipes', a11y: 'bx-a11y' }
    const fn = window.__bx && window.__bx[map[b.dataset.qt]]
    if (fn) fn(); else status('Loading…')
  }))
  // Intelligence menu before Help
  const help = document.querySelector('#menubar [data-menu="help"]')
  if (help && !document.querySelector('#menubar [data-menu="intel"]')) {
    const m = document.createElement('div')
    m.className = 'menu'; m.dataset.menu = 'intel'
    m.innerHTML = `<button class="menu-btn">Intelligence</button><div class="menu-drop">
      <button data-act="bx-intel">🧠 Document Intelligence</button>
      <button data-act="bx-qa">⌨ Quick Actions…</button>
      <button data-act="bx-smart">🔍 Smart Search…</button>
      <hr/><button data-act="bx-health">🩺 Health Check</button>
      <button data-act="bx-autofix">🔧 Auto-Fix Health Issues</button>
      <button data-act="bx-clean">🧹 Clean PDF…</button>
      <button data-act="bx-privacy">🛡 Privacy Scanner</button>
      <button data-act="bx-redact-info">⬛ About True Redaction</button>
      <hr/><button data-act="bx-summary">📝 Quick Summary (local)</button>
      <button data-act="bx-tables">▦ Detect Tables…</button>
      <button data-act="bx-academic">🎓 Academic Mode</button>
      <button data-act="bx-templates">📑 Templates…</button>
      <hr/><button data-act="bx-batchx">📦 More Batch Tools…</button>
      <button data-act="bx-a11y">♿ Accessibility Check</button>
      <button data-act="bx-recipes">🍳 Automation Recipes…</button>
      <button data-act="bx-palette">⌨ Command Palette <small>Ctrl+K</small></button>
    </div>`
    help.before(m)
    const btn = m.querySelector('.menu-btn')
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const was = m.classList.contains('open')
      document.querySelectorAll('#menubar .menu.open').forEach((x) => x.classList.remove('open'))
      if (!was) m.classList.add('open')
    })
    m.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#menubar .menu.open').forEach((x) => x.classList.remove('open'))
      const fn = window.__bx && window.__bx[b.dataset.act]
      if (fn) fn(); else status('Opening…')
    }))
  }
})()
function showIntel() { document.querySelector('.side-tab[data-tab="intel"]')?.click() }

// ================= analysis engine (local, chunked, cached) =================
let intelCache = null
async function analyzeDoc(force) {
  const e = E()
  if (!e.pdfDocProxy) { status('Open a PDF first'); return null }
  if (!force && intelCache && intelCache.proxy === e.pdfDocProxy) return intelCache.data
  const t = taskBegin('Local document analysis')
  const U = e.libs.pdfjsLib.Util, OPS = e.libs.pdfjsLib.OPS
  const pages = []
  let linkCount = 0, imageCount = 0
  for (let i = 1; i <= e.totalPages; i++) {
    const page = await e.pdfDocProxy.getPage(i)
    const v1 = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const items = (tc.items || []).map((it) => {
      let x = 0, y = 0, size = 10
      try {
        const tx = U.transform(v1.transform, it.transform)
        size = Math.hypot(tx[2], tx[3]) || 10
        x = tx[4]; y = tx[5]
      } catch { /* keep defaults */ }
      return { str: it.str || '', x, y, h: size, size, w: (it.width || (it.str || '').length * size * 0.5) }
    }).filter((it) => it.str)
    const text = items.map((it) => it.str).join(' ')
    // lines
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
    const lines = []
    for (const it of sorted) {
      const cy = it.y
      let ln = lines.find((l) => Math.abs(l.y - cy) <= 3)
      if (!ln) { ln = { y: cy, size: 0, parts: [] }; lines.push(ln) }
      ln.parts.push(it); ln.size = Math.max(ln.size, it.size)
    }
    lines.forEach((l) => { l.parts.sort((a, b) => a.x - b.x); l.text = l.parts.map((p) => p.str).join(' ') })
    const med = lines.length ? lines.map((l) => l.size).sort((a, b) => a - b)[Math.floor(lines.length / 2)] : 10
    lines.forEach((l) => { l.big = l.size >= med * 1.3 })
    // images via operator list
    let imgs = 0
    try {
      const ops = await page.getOperatorList()
      for (const fn of ops.fnArray) if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) imgs++
    } catch { /* ignore */ }
    imageCount += imgs
    // links
    try {
      const anns = await page.getAnnotations()
      linkCount += anns.filter((a) => a.subtype === 'Link' && (a.url || a.dest)).length
    } catch { /* ignore */ }
    const sz = e.pdfLibDoc.getPage(i - 1).getSize()
    let rot = 0
    try { rot = e.pdfLibDoc.getPage(i - 1).getRotation().angle } catch { /* ignore */ }
    pages.push({ n: i, text, items, lines, images: imgs, w: sz.width, h: sz.height, rot })
    if (i % 2 === 0) { t.log(`page ${i}/${e.totalPages}`); setBar((i / e.totalPages) * 70); await tick() }
  }
  setBar(80)
  const fullText = pages.map((p) => p.text).join('\n')
  const contacts = extractContacts(fullText)
  contacts.phones = extractPhones(fullText)
  const sections = detectSections(pages)
  const titleAuthors = detectTitleAuthors(pages[0] ? pages[0].lines : [])
  // likely tables
  const tables = []
  for (const p of pages) {
    const g = tableFromItems(p.items.map((it) => ({ str: it.str, x: it.x, y: it.y, w: it.w, h: it.h })), 4)
    if (g.looksTable && g.rows >= 2 && g.rows <= 60) tables.push({ page: p.n, ...g })
  }
  // references
  let refCount = 0, refSec = null
  const ri = sections.findIndex((s) => /reference/i.test(s.title))
  if (ri >= 0) {
    refSec = sections[ri].page
    const tail = pages.slice(refSec - 1).map((p) => p.text).join('\n')
    refCount = (tail.match(/^\s*\[\d+\]|\(\d{4}\)/gm) || []).length
  }
  const data = { pages, fullText, contacts, sections, titleAuthors, tables, linkCount, imageCount, refCount, refSec, at: Date.now() }
  intelCache = { proxy: e.pdfDocProxy, data }
  setBar(100); t.done(`Analyzed ${e.totalPages} pages locally (no network)`)
  return data
}
function overviewHTML(d) {
  const e = E()
  return `<div style="font-size:12px;line-height:1.9;">
    <b>Pages:</b> ${e.totalPages} • <b>Text blocks:</b> ${d.pages.reduce((a, p) => a + p.lines.length, 0)}<br/>
    <b>Images:</b> ${d.imageCount} • <b>Likely tables:</b> ${d.tables.length} • <b>Links:</b> ${d.linkCount}<br/>
    <b>Title:</b> ${d.titleAuthors.title ? d.titleAuthors.title.slice(0, 80) : '<i>not detected</i>'}<br/>
    <b>Detected sections (${d.sections.length}):</b><br/>${d.sections.slice(0, 12).map((s) => `<a href="#" data-pg="${s.page}" class="sec-link">§ ${s.title.slice(0, 50)} (p${s.page})</a>`).join('<br/>') || '<i>none</i>'}
  </div>`
}
function renderOverview() {
  const box = document.getElementById('intelOverview')
  if (!box || !intelCache) return
  box.innerHTML = overviewHTML(intelCache.data)
  box.querySelectorAll('.sec-link').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault()
    document.querySelectorAll('.page-wrap')[+a.dataset.pg - 1]?.scrollIntoView({ block: 'center' })
  }))
}
function renderSuggestions() {
  const box = document.getElementById('intelSuggest')
  if (!box || !intelCache) return
  const d = intelCache.data, e = E()
  const sug = []
  const scanned = d.pages.filter((p) => !p.text.trim() && p.images > 0).length
  if (scanned) sug.push({ t: `⚠ ${scanned} scanned page${scanned > 1 ? 's' : ''} with no text layer.`, b: 'Run OCR', fn: () => window.__bx['bx-ocr-go']() })
  const blanks = d.pages.filter((p) => !p.text.trim() && !p.images).length
  if (blanks) sug.push({ t: `⚠ ${blanks} blank page${blanks > 1 ? 's' : ''} detected.`, b: 'Remove blanks', fn: () => quickRemoveBlanks() })
  if (!e.pdfLibDoc.getTitle() && !e.pdfLibDoc.getAuthor()) sug.push({ t: '⚠ Metadata has no title/author.', b: 'Review metadata', fn: () => { if (window.ProActMeta) window.ProActMeta() } })
  if (d.imageCount >= 12) sug.push({ t: `⚠ ${d.imageCount} images — file may be large.`, b: 'Compress', fn: () => { const f = window.__bxComp; if (f) f() } })
  if (!sug.length) sug.push({ t: '✓ No issues spotted. Document looks healthy.', b: null })
  box.innerHTML = ''
  sug.forEach((s) => {
    const div = document.createElement('div')
    div.className = 'form-item'
    div.innerHTML = `<small>${s.t}</small>`
    if (s.b) {
      const btn = document.createElement('button')
      btn.className = 'btn btn-small'; btn.textContent = '→ ' + s.b
      btn.onclick = s.fn
      div.appendChild(btn)
    }
    box.appendChild(div)
  })
}

// ================= smart search =================
async function smartSearch(q) {
  const d = await analyzeDoc(false)
  if (!d) return
  q = (q || '').trim()
  if (!q) return status('Enter a search term')
  document.querySelectorAll('.search-hit').forEach((n) => n.remove())
  const e = E()
  const index = buildIndex(d.fullText)
  const related = relatedTerms(q, index)
  const terms = [q.toLowerCase(), ...related.map((r) => r.toLowerCase())]
  const resBox = document.getElementById('intelOverview')
  let hits = 0
  const per = []
  d.pages.forEach((p) => {
    const low = p.text.toLowerCase()
    const matched = terms.filter((t) => low.includes(t))
    if (matched.length) { hits += matched.length; per.push({ page: p.n, terms: matched }) }
  })
  resBox.innerHTML = `<div style="font-size:12px;"><b>Smart search: "${q}"</b> — ${hits} term-match${hits === 1 ? '' : 'es'} on ${per.length} page${per.length === 1 ? '' : 's'}<br/>
    <small style="color:#94a3b8;">Related local terms: ${related.length ? related.join(', ') : '<i>none found in document</i>'}</small><br/>
    ${per.slice(0, 20).map((r) => `<a href="#" data-pg="${r.page}" class="sec-link">p${r.page}: ${r.terms.slice(0, 4).join(', ')}</a>`).join('<br/>')}
  </div>`
  resBox.querySelectorAll('.sec-link').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault()
    document.querySelectorAll('.page-wrap')[+a.dataset.pg - 1]?.scrollIntoView({ block: 'center' })
  }))
  // highlight exact-phrase matches on pages
  if (e.pdfDocProxy) {
    const U = e.libs.pdfjsLib.Util
    for (const p of d.pages) {
      const page = await e.pdfDocProxy.getPage(p.n)
      const vp = page.getViewport({ scale: e.currentZoom })
      const ov = document.querySelectorAll('.overlay')[p.n - 1]
      if (!ov) continue
      const tc = await page.getTextContent()
      for (const it of tc.items || []) {
        if (!it.str || !it.str.toLowerCase().includes(q.toLowerCase())) continue
        try {
          const tx = U.transform(vp.transform, it.transform)
          const fs = Math.hypot(tx[2], tx[3]) || 10
          const w = (it.width || it.str.length * fs * 0.55) * e.currentZoom
          const h = fs * e.currentZoom * 1.1
          const s = document.createElement('div')
          s.className = 'search-hit'
          s.style.left = tx[4] + 'px'; s.style.top = (tx[5] - h * 0.85) + 'px'; s.style.width = Math.max(6, w) + 'px'; s.style.height = h + 'px'
          ov.appendChild(s)
        } catch { /* skip */ }
      }
    }
  }
  status(`Smart search: ${hits} matches + ${related.length} related terms (all local)`)
}

// ================= Quick Actions (NL command center) =================
async function snapDoc() {
  const e = E()
  let bytes
  try { bytes = e.originalBytes.slice() } catch {
    try { bytes = await e.pdfLibDoc.save() } catch { bytes = new Uint8Array(0) }
  }
  return { bytes, edits: JSON.parse(JSON.stringify(e.edits)) }
}
async function restoreSnap(s) {
  const e = E()
  await e.reloadFromBytes(new Uint8Array(s.bytes))
  e.edits = s.edits
  e.refreshOverlays()
  try { renderThumbs() } catch { /* pages tab refreshes on open */ }
}
async function runQuickAction() {
  const inp = document.getElementById('qaInput')
  const box = document.getElementById('qaProposal')
  const e = E()
  if (!e.pdfLibDoc) { box.textContent = 'Open a PDF first.'; return }
  const parsed = (await import('./brain-utils.js')).parseCommand(inp.value, e.totalPages)
  if (parsed.action === 'unknown') {
    box.innerHTML = `<small>🤔 Not understood. ${parsed.hint}</small>`
    return
  }
  box.innerHTML = `<div class="form-item"><b>PROPOSED CHANGE</b><br/>${parsed.summary}<br/>
    <small style="color:#94a3b8;">Review first — nothing changes until you press Apply. Undo available after.</small>
    <div style="display:flex;gap:4px;margin-top:4px;"><button id="qaCancel" class="btn btn-small" style="flex:1">Cancel</button><button id="qaApply" class="btn btn-small btn-primary" style="flex:1">Apply</button></div></div>`
  document.getElementById('qaCancel').onclick = () => { box.innerHTML = '<small>Cancelled — nothing changed.</small>' }
  document.getElementById('qaApply').onclick = async () => {
    box.innerHTML = '<small>Applying…</small>'
    try { await execCommand(parsed); box.innerHTML = `<small>✓ Done. <a href="#" id="qaUndo">Undo</a></small>`; document.getElementById('qaUndo').onclick = async (ev) => { ev.preventDefault(); await undoLast(); box.innerHTML = '<small>Undone.</small>' } }
    catch (err) { box.innerHTML = `<small>⚠ Failed: ${err.message}</small>` }
  }
}
let lastSnap = null
async function undoLast() {
  if (!lastSnap) return status('Nothing to undo')
  await restoreSnap(lastSnap)
  lastSnap = null
  status('Undone')
}
async function execCommand(p) {
  const e = E()
  const { PDFDocument, degrees } = e.libs
  switch (p.action) {
    case 'deletePages': {
      lastSnap = await snapDoc()
      const drop = new Set(p.params.pages.map((n) => n - 1))
      if (drop.size >= e.totalPages) throw new Error('refusing to delete every page')
      const order = e.pdfLibDoc.getPageIndices().filter((i) => !drop.has(i))
      const pos = {}
      order.forEach((o, ni) => { pos[o] = ni })
      await rebuild(order.map((o) => ({ doc: e.pdfLibDoc, index: o })), (old) => (drop.has(old) ? -1 : pos[old]), `Quick action: deleted ${drop.size} page(s)`)
      break
    }
    case 'rotatePage': {
      lastSnap = await snapDoc()
      const pg = e.pdfLibDoc.getPage(p.params.page - 1)
      pg.setRotation(degrees((pg.getRotation().angle + p.params.dir + 360) % 360))
      await e.reloadFromBytes(await e.pdfLibDoc.save(), { keepEdits: true })
      status(`Rotated page ${p.params.page}`)
      break
    }
    case 'addBlank': {
      lastSnap = await snapDoc()
      const s0 = e.pdfLibDoc.getPage(0).getSize()
      const tmp = await PDFDocument.create()
      tmp.addPage([s0.width, s0.height])
      const at = Math.min(p.params.after, e.totalPages)
      const order = e.pdfLibDoc.getPageIndices()
      const sources = []
      order.forEach((o, ni) => { if (ni === at) sources.push({ doc: tmp, index: 0 }); sources.push({ doc: e.pdfLibDoc, index: o }) })
      if (at >= order.length) sources.push({ doc: tmp, index: 0 })
      const pos = {}
      let n = 0
      sources.forEach((s) => { if (s.doc === e.pdfLibDoc) pos[s.index] = n; n++ })
      await rebuild(sources, (old) => pos[old], `Quick action: blank page after ${at}`)
      break
    }
    case 'extractPages': {
      const nd = await PDFDocument.create()
      const idx = p.params.pages.map((n) => n - 1)
      ;(await nd.copyPages(e.pdfLibDoc, idx)).forEach((x) => nd.addPage(x))
      downloadBytes(await nd.save(), 'quick-extract.pdf')
      status(`Extracted ${idx.length} page(s) → quick-extract.pdf`)
      break
    }
    case 'findAll': {
      showIntel()
      await smartSearch(p.params.q)
      break
    }
    case 'replaceText': {
      e.pushUndo()
      let n = 0
      e.edits.forEach((ed) => { if (ed.type === 'text' && ed.text.includes(p.params.find)) { ed.text = ed.text.split(p.params.find).join(p.params.repl); n++ } })
      e.refreshOverlays()
      status(n ? `Replaced in ${n} text box(es). Native PDF words need erase + retype.` : 'No matches in your text boxes — use 🧽 Erase for native PDF words')
      break
    }
    case 'pageNumbers': document.getElementById('pageNumberBtn')?.click(); break
    case 'header': document.getElementById('insertHeaderBtn')?.click(); break
    case 'footer': document.getElementById('insertFooterBtn')?.click(); break
    case 'openMerge': { const f = window.__bxMerge; if (f) f(); break }
    case 'compress': document.querySelector('#menubar [data-act="compress"]')?.click(); break
    case 'watermark': document.querySelector('#menubar [data-act="batchmark"]')?.click(); break
    case 'toc': insertTocPage(); break
    case 'summary': showIntel(); await showSummary(); break
    case 'health': showIntel(); await runHealth(); break
    case 'privacy': showIntel(); await runPrivacy(); break
    case 'clean': showIntel(); await openCleanup(); break
    case 'ocr': document.querySelector('#menubar [data-act="ocr"]')?.click(); break
    case 'compare': document.querySelector('#menubar [data-act="compare"]')?.click(); break
    default: status('Command recognized but has no executor yet')
  }
}
async function quickRemoveBlanks() {
  const d = await analyzeDoc(false)
  if (!d) return
  const blanks = d.pages.filter((p) => !p.text.trim() && !p.images).map((p) => p.n)
  if (!blanks.length) return status('No blank pages found')
  lastSnap = await snapDoc()
  const e = E()
  const drop = new Set(blanks.map((n) => n - 1))
  const order = e.pdfLibDoc.getPageIndices().filter((i) => !drop.has(i))
  if (!order.length) { lastSnap = null; return status('Refusing: every page looks blank') }
  const pos = {}
  order.forEach((o, ni) => { pos[o] = ni })
  await rebuild(order.map((o) => ({ doc: e.pdfLibDoc, index: o })), (old) => (drop.has(old) ? -1 : pos[old]), `Removed ${blanks.length} blank page(s)`)
}

// ================= health =================
async function runHealth() {
  const d = await analyzeDoc(false)
  if (!d) return
  const e = E()
  const blanks = d.pages.filter((p) => !p.text.trim() && !p.images).length
  const scanned = d.pages.filter((p) => !p.text.trim() && p.images > 0).length
  const noText = d.pages.every((p) => !p.text.trim()) ? 1 : 0
  const rotated = d.pages.filter((p) => p.rot % 360 !== 0).length
  const sizes = new Set(d.pages.map((p) => `${Math.round(p.w)}x${Math.round(p.h)}`)).size > 1 ? 1 : 0
  const missingMeta = (!e.pdfLibDoc.getTitle() || !e.pdfLibDoc.getAuthor()) ? 1 : 0
  // malformed links only (offline-safe)
  let badLinks = 0
  for (const p of d.pages) {
    try {
      const anns = await e.pdfDocProxy.getPage(p.n).then((pg) => pg.getAnnotations())
      for (const a of anns) if (a.subtype === 'Link' && a.url && !/^https?:\/\/[^\s]+\.[a-z]{2,}/i.test(a.url)) badLinks++
    } catch { /* ignore */ }
  }
  const heavy = d.pages.filter((p) => p.images >= 5).length
  // duplicates
  const seen = new Map()
  let dups = 0
  for (const p of d.pages) {
    const h = normHash(p.text)
    if (h.length > 40) { if (seen.has(h)) dups++; else seen.set(h, p.n) }
  }
  const { score, items } = healthScore({ blanks, rotated, sizes, missingMeta, brokenLinks: badLinks, bigImages: heavy, dups, noText, scanned })
  const emoji = { ok: '✓', warn: '⚠', bad: '✗' }
  const canFix = (blanks + dups + rotated + sizes + missingMeta) > 0
  const summary = [blanks ? `${blanks} blank page(s)` : null, dups ? `${dups} duplicate page(s)` : null, rotated ? `${rotated} rotated page(s)` : null, sizes ? 'inconsistent page sizes' : null, missingMeta ? 'missing metadata' : null].filter(Boolean).join(', ') || 'nothing to fix'
  const body = showInfo('🩺 PDF Health (local analysis)', `
    <div style="font-size:22px;text-align:center;">PDF HEALTH SCORE<br/><b>${score}/100</b></div>
    <div style="font-size:12px;line-height:2;">${items.map((i) => `${emoji[i.kind]} ${i.label}`).join('<br/>')}</div>
    <hr style="border-color:#334155;" />
    <div style="font-size:12px;"><b>One-click auto-fix will:</b> ${summary}</div>
    <div style="display:flex;gap:6px;margin-top:8px;">
      <button id="hlAutoFix" class="btn btn-small btn-primary" style="flex:1;" ${canFix ? '' : 'disabled'}>🔧 Auto-Fix All Issues</button>
      <button id="hlFix" class="btn btn-small" style="flex:1;">Fix Pages Only</button>
    </div>
    <small style="color:#94a3b8;">Auto-fix: removes blank/duplicate pages, straightens rotated pages, normalizes page sizes (enlarge-only, never crops), and fills missing metadata. Fully undoable. Links/heavy images stay report-only (use Compress for images).</small>`)
  body.querySelector('#hlAutoFix').onclick = () => { document.getElementById('actionModal').classList.add('hidden'); autoFixHealth(d) }
  body.querySelector('#hlFix').onclick = async () => {
    document.getElementById('actionModal').classList.add('hidden')
    lastSnap = await snapDoc()
    const drop = new Set()
    d.pages.forEach((p) => { if (!p.text.trim() && !p.images) drop.add(p.n - 1) })
    if (dups) {
      const seen2 = new Map()
      d.pages.forEach((p) => {
        const h = normHash(p.text)
        if (h.length > 40) { if (seen2.has(h)) drop.add(p.n - 1); else seen2.set(h, 1) }
      })
    }
    const order = e.pdfLibDoc.getPageIndices().filter((i) => !drop.has(i))
    if (!order.length) { lastSnap = null; return status('Refusing: everything looks blank') }
    const pos = {}
    order.forEach((o, ni) => { pos[o] = ni })
    await rebuild(order.map((o) => ({ doc: e.pdfLibDoc, index: o })), (old) => (drop.has(old) ? -1 : pos[old]), `Health fix: removed ${drop.size} page(s)`)
  }
}

// ================= ONE-CLICK AUTO-FIX (repairs everything safe) =================
async function autoFixHealth(data) {
  const e = E()
  const d = data || await analyzeDoc(true)
  if (!d) return
  const { degrees } = e.libs
  const t = taskBegin('Auto-fixing document health')
  try {
    lastSnap = await snapDoc()
    lastSnap.meta = { title: e.pdfLibDoc.getTitle(), author: e.pdfLibDoc.getAuthor(), subject: e.pdfLibDoc.getSubject(), creator: e.pdfLibDoc.getCreator() }
    const done = []

    // 1) straighten rotated pages
    t.log('Checking page rotation…')
    let rot = 0
    for (const p of d.pages) {
      try { const pg = e.pdfLibDoc.getPage(p.n - 1); if (pg.getRotation().angle % 360 !== 0) { pg.setRotation(degrees(0)); rot++ } } catch {}
    }
    if (rot) done.push(`straightened ${rot} rotated page(s)`)

    // 2) normalize page sizes (enlarge-only so nothing is ever cropped)
    t.log('Normalizing page sizes…')
    const maxW = Math.max(...d.pages.map((p) => p.w)), maxH = Math.max(...d.pages.map((p) => p.h))
    const uniqSizes = new Set(d.pages.map((p) => `${Math.round(p.w)}x${Math.round(p.h)}`))
    let sized = 0
    if (uniqSizes.size > 1) {
      for (let i = 0; i < e.totalPages; i++) {
        try { const pg = e.pdfLibDoc.getPage(i); const s = pg.getSize(); if (s.width < maxW - 1 || s.height < maxH - 1) { pg.setSize(Math.max(s.width, maxW), Math.max(s.height, maxH)); sized++ } } catch {}
      }
    }
    if (sized) done.push(`normalized ${sized} page size(s) to ${Math.round(maxW)}×${Math.round(maxH)}`)

    // 3) remove blank + duplicate pages via a single rebuild
    t.log('Removing blank/duplicate pages…')
    const drop = new Set()
    d.pages.forEach((p) => { if (!p.text.trim() && !p.images) drop.add(p.n - 1) })
    const seen = new Map()
    d.pages.forEach((p) => {
      const h = normHash(p.text)
      if (h.length > 40) { if (seen.has(h)) drop.add(p.n - 1); else seen.set(h, 1) }
    })
    if (drop.size) {
      const order = e.pdfLibDoc.getPageIndices().filter((i) => !drop.has(i))
      if (order.length) {
        const pos = {}
        order.forEach((o, ni) => { pos[o] = ni })
        await rebuild(order.map((o) => ({ doc: e.pdfLibDoc, index: o })), (old) => (drop.has(old) ? -1 : pos[old]), `Auto-fix: removed ${drop.size} page(s)`)
        done.push(`removed ${drop.size} blank/duplicate page(s)`)
      }
    }

    // 4) fill missing metadata (title from detected content, author = Otim Noah)
    t.log('Filling metadata…')
    try {
      const dd = e.pdfLibDoc
      if (!dd.getTitle()) { const ti = (d.titleAuthors && d.titleAuthors.title) || (window.__docName || 'Document').replace(/\.pdf$/i, ''); dd.setTitle(ti) }
      if (!dd.getAuthor()) dd.setAuthor('Otim Noah')
      dd.setProducer('BOTIM DOCSHUB by Otim Noah'); dd.setCreator('BOTIM DOCSHUB')
      dd.setModificationDate(new Date())
      done.push('filled missing metadata')
    } catch {}

    await e.renderAll(); e.renderPageList(); try { renderThumbs() } catch {}
    analyzeDoc(true).then(() => { renderOverview(); renderSuggestions() }).catch(() => {})
    t.done('Auto-fix complete: ' + (done.join(', ') || 'nothing needed fixing'))

    // show result + undo
    const { showInfo: si } = await import('./pro-core.js')
    const box = si('✅ Auto-Fix Complete', `<div style="font-size:12px;line-height:1.9;">
      ${done.length ? done.map((x) => '✓ ' + x).join('<br/>') : '✓ Document already healthy — nothing needed fixing.'}
      <div style="margin-top:10px;"><button id="afUndo" class="btn btn-small">↩ Undo Auto-Fix</button> <button id="afSave" class="btn btn-small btn-primary">💾 Save Fixed PDF</button></div>
      <small style="color:#94a3b8;">Then click Save to keep the repairs in the file.</small></div>`)
    box.querySelector('#afUndo').onclick = async () => {
      if (!lastSnap) return status('Nothing to undo')
      await restoreSnap(lastSnap); lastSnap = null
      try { if (lastSnap?.meta) { const dd = E().pdfLibDoc; dd.setTitle(lastSnap.meta.title || ''); dd.setAuthor(lastSnap.meta.author || '') } } catch {}
      box.querySelector('#afUndo').textContent = 'Undone ✓'
      status('Auto-fix undone')
    }
    box.querySelector('#afSave').onclick = () => { box.closest('.modal')?.classList.add('hidden'); e.saveBtn.click() }
  } catch (err) { t.done('Auto-fix failed: ' + err.message) }
}

// ================= cleanup =================
async function openCleanup() {
  const d = await analyzeDoc(false)
  if (!d) return
  const e = E()
  const blanks = d.pages.filter((p) => !p.text.trim() && !p.images).map((p) => p.n)
  const seen = new Map(), dupPages = []
  d.pages.forEach((p) => {
    const h = normHash(p.text)
    if (h.length > 40) { if (seen.has(h)) dupPages.push(p.n); else seen.set(h, 1) }
  })
  const sizes = [...new Set(d.pages.map((p) => `${Math.round(p.w)}x${Math.round(p.h)}`))]
  const r = await openDialog('Clean PDF — review first, apply selected', [
    { key: 'blanks', label: `Remove ${blanks.length} blank page(s)${blanks.length ? ` (${blanks.join(', ')})` : ''}`, type: 'check', value: blanks.length > 0 },
    { key: 'dups', label: `Remove ${dupPages.length} duplicate page(s)`, type: 'check', value: dupPages.length > 0 },
    { key: 'padsizes', label: `Pad all pages to uniform size (enlarge-only, never crops)${sizes.length > 1 ? ` — ${sizes.length} sizes now` : ''}`, type: 'check', value: false },
    { key: 'meta', label: 'Strip personal metadata (title/author/subject/keywords/creator)', type: 'check', value: false },
    { key: 'compress', label: 'Compress images (opens Compress — pages become images)', type: 'check', value: false }
  ], 'Preview & Apply Selected')
  if (!r) return
  if (r.compress) { document.querySelector('#menubar [data-act="compress"]')?.click(); return }
  lastSnap = await snapDoc()
  const before = { title: e.pdfLibDoc.getTitle(), author: e.pdfLibDoc.getAuthor(), subject: e.pdfLibDoc.getSubject(), creator: e.pdfLibDoc.getCreator() }
  lastSnap.meta = before
  const drop = new Set()
  if (r.blanks) blanks.forEach((n) => drop.add(n - 1))
  if (r.dups) dupPages.forEach((n) => drop.add(n - 1))
  const order = e.pdfLibDoc.getPageIndices().filter((i) => !drop.has(i))
  if (!order.length) { lastSnap = null; return status('Refusing: selection would delete every page') }
  if (r.padsizes) {
    const mw = Math.max(...d.pages.map((p) => p.w)), mh = Math.max(...d.pages.map((p) => p.h))
    order.forEach((i) => { const pg = e.pdfLibDoc.getPage(i); const s = pg.getSize(); if (s.width < mw || s.height < mh) pg.setSize(Math.max(s.width, mw), Math.max(s.height, mh)) })
  }
  const pos = {}
  order.forEach((o, ni) => { pos[o] = ni })
  await rebuild(order.map((o) => ({ doc: e.pdfLibDoc, index: o })), (old) => (drop.has(old) ? -1 : pos[old]), 'Cleanup applied')
  if (r.meta) {
    const dd = E().pdfLibDoc
    try { dd.setTitle(''); dd.setAuthor(''); dd.setSubject(''); dd.setKeywords([]); dd.setCreator('') } catch { /* ignore */ }
    window.__stripMeta = true
    status('Cleanup applied + metadata staged for stripping on Save. Undo restores pages AND metadata.')
  } else status('Cleanup applied — Undo available in the Intel panel.')
  const box = document.getElementById('qaProposal')
  if (box) {
    box.innerHTML = `<small>✓ Cleanup applied. <a href="#" id="clUndo">Undo cleanup</a></small>`
    document.getElementById('clUndo').onclick = async (ev) => {
      ev.preventDefault()
      await restoreSnap(lastSnap)
      if (lastSnap.meta) { const dd = E().pdfLibDoc; try { dd.setTitle(lastSnap.meta.title || ''); dd.setAuthor(lastSnap.meta.author || ''); dd.setSubject(lastSnap.meta.subject || ''); dd.setCreator(lastSnap.meta.creator || '') } catch { /* ignore */ } }
      lastSnap = null
      box.innerHTML = '<small>Cleanup undone.</small>'
    }
  }
}

// ================= privacy =================
async function runPrivacy() {
  const d = await analyzeDoc(false)
  if (!d) return
  const e = E()
  const findings = []
  d.pages.forEach((p) => {
    privacyScan(p.text).forEach((f) => findings.push({ ...f, page: p.n }))
  });
  const byKind = {}
  findings.forEach((f) => { byKind[f.kind] = (byKind[f.kind] || 0) + 1 })
  const sum = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(' • ') || 'nothing found'
  const body = showInfo('Privacy Scanner (local pattern matching)', `<div style="font-size:12px;"><b>Potentially sensitive:</b> ${sum}<br/>
    <small style="color:#94a3b8;">Review each item. Nothing is redacted automatically.</small>
    <div id="pvList" style="max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:4px;margin:8px 0;"></div>
    <div style="display:flex;gap:6px;"><button id="pvRedact" class="btn btn-small btn-danger" style="flex:1;">⬛ Redact Checked</button></div></div>`)
  const list = body.querySelector('#pvList')
  const checks = []
  findings.slice(0, 300).forEach((f, i) => {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:11px;background:#0f172a;padding:4px 6px;border-radius:6px;'
    const cb = document.createElement('input')
    cb.type = 'checkbox'; cb.checked = true
    const sp = document.createElement('span')
    sp.innerHTML = `<b>${f.kind}</b> p${f.page}: ${f.value.replace(/</g, '&lt;').slice(0, 60)}`
    sp.style.cursor = 'pointer'
    sp.onclick = () => document.querySelectorAll('.page-wrap')[f.page - 1]?.scrollIntoView({ block: 'center' })
    row.append(cb, sp)
    list.appendChild(row)
    checks.push({ cb, f })
  })
  if (!findings.length) list.textContent = '✓ No email/phone/URL/date/ID-like patterns detected.'
  body.querySelector('#pvRedact').onclick = async () => {
    const sel = checks.filter((c) => c.cb.checked).map((c) => c.f)
    if (!sel.length) return status('Nothing checked')
    // locate each value's geometry on its page and mark redact edits
    const U = e.libs.pdfjsLib.Util
    e.pushUndo()
    let n = 0
    const byPage = {}
    sel.forEach((f) => { (byPage[f.page] = byPage[f.page] || []).push(f) })
    for (const [pgStr, items] of Object.entries(byPage)) {
      const pg = +pgStr
      const page = await e.pdfDocProxy.getPage(pg)
      const vp = page.getViewport({ scale: e.currentZoom })
      const ov = document.querySelectorAll('.overlay')[pg - 1]
      const tc = await page.getTextContent()
      for (const f of items) {
        const it = (tc.items || []).find((x) => (x.str || '').includes(f.value.slice(0, 24)))
        if (!it) continue
        try {
          const tx = U.transform(vp.transform, it.transform)
          const fs = Math.hypot(tx[2], tx[3]) || 10
          const w = (it.width || it.str.length * fs * 0.55) * e.currentZoom
          const h = fs * e.currentZoom * 1.2
          const ed = { id: Date.now() + Math.random() + n, pageIndex: pg - 1, type: 'redact', x: tx[4] - 2, y: tx[5] - h * 0.9, w: w + 4, h }
          e.edits.push(ed)
          if (ov) window.ProRenderEdit(ov, ed)
          n++
        } catch { /* skip */ }
      }
    }
    document.getElementById('actionModal').classList.add('hidden')
    status(`${n} redaction${n === 1 ? '' : 's'} marked — review black boxes, then Tools → Apply Redactions`)
  }
}

// ================= metadata cleaner =================
async function metadataCleaner() {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  const d = e.pdfLibDoc
  let attach = []
  try { attach = Object.keys((await e.pdfDocProxy.getAttachments()) || {}) } catch { /* ignore */ }
  let hasJS = false
  try { hasJS = await e.pdfDocProxy.hasJSActions() } catch { /* ignore */ }
  const annCount = e.edits.length
  const rows = [
    ['title', 'Title', d.getTitle() || ''],
    ['author', 'Author', d.getAuthor() || ''],
    ['subject', 'Subject', d.getSubject() || ''],
    ['keywords', 'Keywords', (d.getKeywords && d.getKeywords()) || ''],
    ['creator', 'Creator', d.getCreator() || ''],
    ['producer', 'Producer', d.getProducer() || ''],
  ]
  const r = await openDialog('Remove Hidden Information', rows.map(([k, l, v]) => ({ key: k, label: `${l}: ${v || '(empty)'}`, type: 'check', value: !!v })), 'Remove Selected')
  if (!r) return
  showInfo('Hidden Information Report', `<div style="font-size:12px;line-height:1.9;">
    <b>Annotations/overlays in editor:</b> ${annCount} (delete via Edit → Delete Selected or Clear)<br/>
    <b>Embedded files:</b> ${attach.length ? attach.join(', ') : 'none detected'}<br/>
    <b>JavaScript actions:</b> ${hasJS ? 'DETECTED — cannot remove with this offline build (needs a server engine)' : 'none detected'}<br/>
    <small style="color:#94a3b8;">Embedded files/JS removal is honestly out of scope for pdf-lib; only metadata + editor annotations are removed here.</small></div>`)
  const anyMeta = rows.some(([k]) => r[k])
  if (anyMeta) {
    lastSnap = await snapDoc()
    lastSnap.meta = { title: d.getTitle(), author: d.getAuthor(), subject: d.getSubject(), creator: d.getCreator() }
    try {
      if (r.title) d.setTitle('')
      if (r.author) d.setAuthor('')
      if (r.subject) d.setSubject('')
      if (r.keywords) d.setKeywords([])
      if (r.creator) d.setCreator('')
    } catch { /* ignore */ }
    window.__stripMeta = true
    status('Metadata staged for removal on Save (undo via Intel proposal box).')
    const box = document.getElementById('qaProposal')
    if (box) {
      box.innerHTML = `<small>✓ Metadata staged. <a href="#" id="mdUndo">Undo</a></small>`
      document.getElementById('mdUndo').onclick = async (ev) => { ev.preventDefault(); await restoreSnap(lastSnap); lastSnap = null; box.innerHTML = '<small>Undone.</small>' }
    }
  }
}

// ================= tables =================
async function detectTablesUI() {
  const d = await analyzeDoc(false)
  if (!d) return
  if (!d.tables.length) {
    showInfo('Detect Tables (local structure analysis)', '<div style="font-size:12px;">No grid-like tables detected. Tables need aligned rows + columns of text.</div>')
    return
  }
  const body = showInfo(`Likely Tables (${d.tables.length})`, '<div id="tblList" style="display:flex;flex-direction:column;gap:6px;"></div>')
  const list = body.querySelector('#tblList')
  d.tables.forEach((t, i) => {
    const div = document.createElement('div')
    div.className = 'form-item'
    div.innerHTML = `<b>Table ${i + 1}</b> — page ${t.page}, ${t.rows}×${t.cols}<br/><small>${t.grid[0].slice(0, 4).join(' | ').slice(0, 90)}</small>`
    const row = document.createElement('div')
    row.style.display = 'flex'; row.style.gap = '4px'; row.style.marginTop = '4px'
    const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn btn-small'; b.style.flex = '1'; b.textContent = label; b.onclick = () => fn(t, i); row.appendChild(b) }
    mk('CSV', () => downloadBlob(new Blob([gridToCsv(t.grid)], { type: 'text/csv' }), `table-p${t.page}.csv`))
    div.appendChild(row)
    list.appendChild(div)
  })
  const bar = document.createElement('div')
  bar.style.display = 'flex'; bar.style.gap = '4px'; bar.style.marginTop = '6px'
  const bj = document.createElement('button'); bj.className = 'btn btn-small'; bj.style.flex = '1'; bj.textContent = 'All as JSON'
  bj.onclick = () => downloadBlob(new Blob([JSON.stringify(d.tables.map((t) => ({ page: t.page, grid: t.grid })), null, 1)], { type: 'application/json' }), 'tables.json')
  const bc = document.createElement('button'); bc.className = 'btn btn-small'; bc.style.flex = '1'; bc.textContent = 'Copy first to clipboard'
  bc.onclick = async () => { try { await navigator.clipboard.writeText(gridToCsv(d.tables[0].grid)); status('Table copied to clipboard') } catch { status('Clipboard blocked by browser') } }
  bar.append(bj, bc)
  body.appendChild(bar)
  const note = document.createElement('small')
  note.style.color = '#94a3b8'
  note.textContent = 'XLSX needs a zip engine (not bundled to stay free/offline) — CSV opens directly in Excel.'
  body.appendChild(note)
}

// ================= summary (LOCAL extractive) =================
async function showSummary() {
  const d = await analyzeDoc(false)
  if (!d) return
  const pages = d.pages.map((p) => ({ text: p.text }))
  const { top, terms, stats } = (await import('./brain-utils.js')).summarize(pages, 6, 10)
  showInfo('Quick Summary — LOCAL document summary (extractive, offline)', `<div style="font-size:12px;line-height:1.8;">
    <b>Pages:</b> ${stats.pages} • <b>Words:</b> ${stats.words}<br/>
    <b>Main sections:</b><ol>${d.sections.slice(0, 8).map((s) => `<li>${s.title.slice(0, 70)} (p${s.page})</li>`).join('') || '<li><i>none detected</i></li>'}</ol>
    <b>Most relevant sentences (term-frequency ranked):</b><ul>${top.map((s) => `<li>${s.slice(0, 220)}</li>`).join('')}</ul>
    <b>Key topics:</b> ${terms.join(', ') || '<i>—</i>'}<br/>
    <small style="color:#94a3b8;">Not an LLM summary — top sentences + key terms computed locally.</small></div>`)
}

// ================= academic mode =================
async function academicMode() {
  const d = await analyzeDoc(false)
  if (!d) return
  const e = E()
  const p1 = d.pages[0] ? d.pages[0].text : ''
  const abs = /abstract/i.test(p1) || d.sections.some((s) => /abstract/i.test(s.title))
  const kwLine = d.pages.slice(0, 2).map((p) => p.text).join(' ').match(/keywords?\s*[:—-]\s*([^\n.]{4,200})/i)
  const figs = [], tbls = []
  d.pages.forEach((p) => {
    p.lines.forEach((l) => {
      const t = l.text.trim()
      if (/^(figure|fig\.)\s+\d+/i.test(t)) figs.push({ t: t.slice(0, 70), page: p.n })
      if (/^table\s+\d+/i.test(t)) tbls.push({ t: t.slice(0, 70), page: p.n })
    })
  })
  const body = showInfo('Academic Mode (local detection)', `<div style="font-size:12px;line-height:1.9;">
    <b>Title:</b> ${d.titleAuthors.title.slice(0, 120) || '<i>not detected</i>'}<br/>
    <b>Authors:</b> ${d.titleAuthors.authors.join('; ') || '<i>none</i>'}<br/>
    <b>Affiliations:</b> ${d.titleAuthors.affiliations.join(' | ').slice(0, 200) || '<i>none</i>'}<br/>
    <b>Abstract:</b> ${abs ? '✓ found' : '✗ not found'} • <b>Keywords:</b> ${kwLine ? kwLine[1].slice(0, 120) : '<i>none</i>'}<br/>
    <b>Headings:</b> ${d.sections.length} • <b>Tables:</b> ${tbls.length} • <b>Figures:</b> ${figs.length}<br/>
    <b>References:</b> ${d.refCount} entr${d.refCount === 1 ? 'y' : 'ies'}${d.refSec ? ` (from p${d.refSec})` : ''} • <b>DOIs:</b> ${d.contacts.dois.length}<br/>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
      <button id="acToc" class="btn btn-small" style="flex:1;">Insert TOC page</button>
      <button id="acTocDl" class="btn btn-small" style="flex:1;">Download TOC</button>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;">
      <button id="acHead" class="btn btn-small" style="flex:1;">Check headings</button>
      <button id="acRef" class="btn btn-small" style="flex:1;">Check references</button>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;">
      <button id="acAuth" class="btn btn-small" style="flex:1;">Copy authors</button>
      <button id="acDoi" class="btn btn-small" style="flex:1;">Copy DOIs</button>
    </div></div>`)
  const tocText = () => 'TABLE OF CONTENTS\n\n' + d.sections.map((s, i) => `${i + 1}. ${s.title.slice(0, 80)} ..... ${s.page}`).join('\n')
  body.querySelector('#acTocDl').onclick = () => downloadBlob(new Blob([tocText()], { type: 'text/plain' }), 'toc.txt')
  body.querySelector('#acToc').onclick = () => { document.getElementById('actionModal').classList.add('hidden'); insertTocPage() }
  body.querySelector('#acHead').onclick = () => {
    const bad = []
    d.pages.forEach((p) => {
      const hs = p.lines.filter((l) => l.big && l.text.trim().length > 2 && l.text.trim().length < 90)
      for (let i = 1; i < hs.length; i++) if (hs[i].size > hs[i - 1].size * 1.5) bad.push(`p${p.n}: "${hs[i].text.trim().slice(0, 40)}" larger than previous heading`)
    })
    status(bad.length ? `Heading issues: ${bad[0]}` : '✓ Heading sizes look consistent')
  }
  body.querySelector('#acRef').onclick = () => status(d.refCount ? `${d.refCount} reference entries, ${d.contacts.dois.length} with DOI` : 'No numbered reference entries detected')
  const cp = async (t, msg) => { try { await navigator.clipboard.writeText(t); status(msg) } catch { status('Clipboard blocked by browser') } }
  body.querySelector('#acAuth').onclick = () => cp(d.titleAuthors.authors.join('\n'), 'Authors copied')
  body.querySelector('#acDoi').onclick = () => cp(d.contacts.dois.join('\n') || 'none', 'DOIs copied')
}
async function insertTocPage() {
  const d = await analyzeDoc(false)
  if (!d || !d.sections.length) return status('No sections detected — cannot build TOC')
  const e = E()
  lastSnap = await snapDoc()
  const { PDFDocument, StandardFonts, rgb } = e.libs
  const tmp = await PDFDocument.create()
  const s0 = e.pdfLibDoc.getPage(0).getSize()
  tmp.addPage([s0.width, s0.height])
  const order = e.pdfLibDoc.getPageIndices()
  const sources = [{ doc: tmp, index: 0 }, ...order.map((o) => ({ doc: e.pdfLibDoc, index: o }))]
  const pos = {}
  order.forEach((o, ni) => { pos[o] = ni + 1 })
  await rebuild(sources, (old) => pos[old], 'Inserted table of contents')
  const font = await e.pdfLibDoc.embedFont(StandardFonts.Helvetica)
  const pg = e.pdfLibDoc.getPage(0)
  const { height } = pg.getSize()
  let y = height - 70
  pg.drawText('TABLE OF CONTENTS', { x: 50, y, size: 18, font })
  y -= 34
  d.sections.slice(0, 40).forEach((s, i) => {
    if (y < 50) return
    pg.drawText(`${i + 1}. ${s.title.slice(0, 75)} ..... ${s.page + 1}`, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) })
    y -= 16
  })
  await e.renderAll(); e.renderPageList()
  status('TOC page inserted (note: listed pages shifted +1). Undo in Intel proposal box.')
  const box = document.getElementById('qaProposal')
  if (box) {
    box.innerHTML = `<small>✓ TOC inserted. <a href="#" id="tocUndo">Undo</a></small>`
    document.getElementById('tocUndo').onclick = async (ev) => { ev.preventDefault(); await restoreSnap(lastSnap); lastSnap = null; box.innerHTML = '<small>Undone.</small>' }
  }
}

// ================= templates (localStorage, placeholders) =================
const TKEY = 'pde-templates-v1'
function loadTemplates() {
  let custom = []
  try { custom = JSON.parse(localStorage.getItem(TKEY) || '[]') } catch { custom = [] }
  return [...custom]
}
function saveTemplates(list) { try { localStorage.setItem(TKEY, JSON.stringify(list)) } catch { /* ignore */ } }
const BUILTINS = [
  { name: 'Certificate', size: 'A4 landscape', fields: [['Recipient name', 'name', 150, 420, 28], ['Award title', 'title', 150, 360, 18], ['Date', 'date', 150, 300, 14], ['Organization', 'organization', 150, 260, 14]] },
  { name: 'Invoice', size: 'A4', fields: [['Bill to', 'name', 60, 700, 12], ['Invoice title', 'title', 60, 740, 18], ['Date', 'date', 60, 660, 11], ['Amount due', 'amount', 60, 600, 14], ['Organization', 'organization', 60, 560, 11]] },
  { name: 'Letter', size: 'A4', fields: [['Recipient', 'name', 60, 720, 12], ['Subject', 'title', 60, 680, 14], ['Date', 'date', 60, 640, 11], ['Organization', 'organization', 60, 200, 11]] },
  { name: 'Receipt', size: 'A4', fields: [['Received from', 'name', 60, 700, 12], ['Payment title', 'title', 60, 740, 18], ['Date', 'date', 60, 660, 11], ['Amount', 'amount', 60, 600, 14]] },
  { name: 'Report Cover', size: 'A4', fields: [['Report title', 'title', 60, 500, 24], ['Author name', 'name', 60, 440, 14], ['Date', 'date', 60, 410, 12], ['Organization', 'organization', 60, 380, 12]] },
]
async function templatesUI() {
  const customs = loadTemplates()
  const all = [...BUILTINS.map((b) => ({ ...b, builtin: true })), ...customs]
  const r = await openDialog('Document Templates (stored locally)', [{ key: 'pick', label: `Template (${all.length})`, type: 'select', value: all[0].name, options: all.map((t) => t.name) }], 'Use Template')
  const body = document.getElementById('actionBody')
  const extra = document.createElement('div')
  extra.style.display = 'flex'; extra.style.gap = '4px'
  const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn btn-small'; b.style.flex = '1'; b.textContent = label; b.onclick = fn; extra.appendChild(b) }
  mk('＋ New', () => { document.getElementById('actionModal').classList.add('hidden'); templateBuilder(null) })
  mk('⧉ Duplicate', async () => {
    const t = all.find((x) => x.name === body.querySelector('select').value)
    if (!t || t.builtin) return status('Select a custom template to duplicate (built-ins are fixed)')
    const c = loadTemplates()
    c.push({ ...JSON.parse(JSON.stringify(t)), name: t.name + ' copy' })
    saveTemplates(c); status('Duplicated')
  })
  mk('🗑 Delete', async () => {
    const nm = body.querySelector('select').value
    saveTemplates(loadTemplates().filter((x) => x.name !== nm))
    status('Deleted (built-ins cannot be deleted)')
  })
  body.appendChild(extra)
  if (!r) return
  const t = all.find((x) => x.name === r.pick)
  if (t) { document.getElementById('actionModal').classList.add('hidden'); useTemplate(t) }
}
async function templateBuilder(existing) {
  const r = await openDialog(existing ? 'Edit Template' : 'New Template', [
    { key: 'name', label: 'Template name', value: existing ? existing.name : 'My Template' },
    { key: 'size', label: 'Page size', type: 'select', value: existing ? existing.size : 'A4', options: ['A4', 'A4 landscape', 'Letter'] },
    { key: 'spec', label: 'Fields — one per line: Label | key | x | y | fontSize', type: 'textarea', value: existing ? existing.fields.map((f) => f.join(' | ')).join('\n') : 'Full name | name | 60 | 700 | 14\nTitle | title | 60 | 660 | 18\nDate | date | 60 | 620 | 11' }
  ], 'Save Template')
  if (!r || !r.name) return
  const fields = r.spec.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a.length >= 2)
    .map((a) => [a[0] || 'Field', a[1] || 'field', +a[2] || 60, +a[3] || 700, +a[4] || 12]).slice(0, 20)
  if (!fields.length) return status('Add at least one field')
  const c = loadTemplates().filter((x) => x.name !== (existing ? existing.name : r.name))
  c.push({ name: r.name, size: r.size, fields })
  saveTemplates(c)
  status(`Template "${r.name}" saved locally`)
}
async function useTemplate(t) {
  const e = E()
  const vals = await openDialog(`Use Template: ${t.name}`, t.fields.map(([label, key]) => ({ key, label, value: key === 'date' ? new Date().toLocaleDateString() : '' })), 'Generate PDF')
  if (!vals) return
  const { PDFDocument, StandardFonts, rgb } = e.libs
  const d = await PDFDocument.create()
  const sizes = { A4: [595, 842], 'A4 landscape': [842, 595], Letter: [612, 792] }
  const [W, H] = sizes[t.size] || sizes.A4
  const page = d.addPage([W, H])
  const font = await d.embedFont(StandardFonts.Helvetica)
  const bold = await d.embedFont(StandardFonts.HelveticaBold)
  if (t.name === 'Certificate') {
    page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: rgb(0.2, 0.3, 0.6), borderWidth: 3 })
    page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: rgb(0.2, 0.3, 0.6), borderWidth: 1 })
  }
  for (const [label, key, x, y, size] of t.fields) {
    const v = vals[key] || ''
    page.drawText(label + ':', { x, y: y + size + 4, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
    page.drawText(String(v), { x, y, size: Math.min(size, 32), font: bold, color: rgb(0, 0, 0) })
  }
  d.setTitle(t.name); d.setAuthor('Otim Noah'); d.setProducer('BOTIM DOCSHUB by Otim Noah')
  window.__docName = t.name.replace(/[^\w\-]+/g, '-').toLowerCase() + '.pdf'
  await e.reloadFromBytes(await d.save())
  status(`Generated from template "${t.name}"`)
}

// ================= batch extras =================
async function batchExtras() {
  const files = await pickFiles('.pdf', true)
  if (!files.length) return
  const r = await openDialog(`Batch — ${files.length} file(s)`, [
    { key: 'op', label: 'Operation', type: 'select', value: 'numbers', options: [{ value: 'numbers', label: 'Add page numbers' }, { value: 'extract', label: 'Extract pages (same range each)' }, { value: 'strip', label: 'Strip personal metadata' }, { value: 'mergeone', label: 'Merge all into one PDF' }, { value: 'rename', label: 'Rename (prefix)' }] },
    { key: 'spec', label: 'Range (extract) / prefix (rename)', value: '1-3' }
  ], 'Run Batch')
  if (!r) return
  const e = E()
  const { PDFDocument, StandardFonts, rgb } = e.libs
  const t = taskBegin('Batch processing')
  let k = 0
  if (r.op === 'mergeone') {
    const nd = await PDFDocument.create()
    for (const f of files) {
      try {
        const d = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()))
        ;(await nd.copyPages(d, d.getPageIndices())).forEach((p) => nd.addPage(p))
        t.log(`+ ${f.name}`)
      } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
      setBar((++k / files.length) * 100)
    }
    downloadBytes(await nd.save(), 'batch-merged.pdf')
    t.done(`Merged ${files.length} files → batch-merged.pdf`)
    return
  }
  for (const f of files) {
    try {
      const d = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()))
      if (r.op === 'numbers') {
        const font = await d.embedFont(StandardFonts.Helvetica)
        const n = d.getPageCount()
        d.getPages().forEach((pg, i) => {
          const { width } = pg.getSize()
          const txt = `Page ${i + 1} of ${n}`
          pg.drawText(txt, { x: (width - font.widthOfTextAtSize(txt, 9)) / 2, y: 14, size: 9, font, color: rgb(0.3, 0.3, 0.3) })
        })
        downloadBytes(await d.save(), 'paged-' + f.name)
      } else if (r.op === 'extract') {
        const idx = parseRange(r.spec, d.getPageCount())
        if (!idx.length) throw new Error('empty range')
        const nd = await PDFDocument.create()
        ;(await nd.copyPages(d, idx)).forEach((p) => nd.addPage(p))
        downloadBytes(await nd.save(), 'extract-' + f.name)
      } else if (r.op === 'strip') {
        try { d.setTitle(''); d.setAuthor(''); d.setSubject(''); d.setKeywords([]); d.setCreator(''); d.setProducer('BOTIM DOCSHUB') } catch { /* ignore */ }
        downloadBytes(await d.save(), 'clean-' + f.name)
      } else if (r.op === 'rename') {
        downloadBytes(new Uint8Array(await f.arrayBuffer()), (r.spec || 'doc') + '-' + f.name)
      }
      t.log(`✓ ${f.name}`)
    } catch (err) { t.log(`✖ ${f.name}: ${err.message}`) }
    setBar((++k / files.length) * 100)
    await tick()
  }
  t.done(`Batch done: ${files.length} file${files.length > 1 ? 's' : ''}`)
}

// ================= accessibility =================
async function a11yCheck() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const d = e.pdfLibDoc
  const rows = []
  rows.push({ k: 'Document title', ok: !!d.getTitle(), fix: 'title' })
  let lang = ''
  try { lang = d.catalog.get(PDFName.of('Lang'))?.toString() || '' } catch { lang = '' }
  rows.push({ k: 'Language metadata', ok: !!lang, fix: 'lang', cur: lang })
  const data = await analyzeDoc(false)
  const heads = data ? data.sections.length : 0
  rows.push({ k: `Heading structure (${heads} detected)`, ok: heads >= 2, fix: null })
  const hasText = data ? data.pages.some((p) => p.text.trim().length > 20) : false
  rows.push({ k: 'Text layer / reading order', ok: hasText, fix: hasText ? null : 'ocr' })
  let unlabeled = 0
  try { for (const f of d.getForm().getFields()) { try { if (!f.getName()) unlabeled++ } catch { /* ignore */ } } } catch { /* ignore */ }
  rows.push({ k: `Form field labels (${unlabeled} unlabeled)`, ok: unlabeled === 0, fix: null })
  rows.push({ k: 'Image descriptions', ok: null, fix: null, note: 'alt-text cannot be verified with a local engine — check manually' })
  const body = showInfo('Accessibility Check (local)', `<div style="font-size:12px;line-height:2;">${rows.map((r) => `${r.ok === null ? '○' : r.ok ? '✓' : '✗'} ${r.k}${r.note ? ` — <small>${r.note}</small>` : ''}`).join('<br/>')}</div>
    <div style="display:flex;gap:4px;"><button id="axTitle" class="btn btn-small" style="flex:1;">Set title…</button><button id="axLang" class="btn btn-small" style="flex:1;">Set language: en</button></div>`)
  body.querySelector('#axTitle').onclick = async () => {
    const r = await openDialog('Set Title', [{ key: 't', label: 'Document title', value: d.getTitle() || window.__docName || '' }], 'Set')
    if (r && r.t) { try { d.setTitle(r.t); status('Title set — Save to keep') } catch (err) { status(err.message) } }
  }
  body.querySelector('#axLang').onclick = () => {
    try { d.catalog.set(PDFName.of('Lang'), PDFString.of('en')); status('Language set to en — Save to keep') }
    catch (err) { status('Could not set language: ' + err.message) }
  }
}

// ================= recipes =================
async function recipesUI() {
  const r = await openDialog('Automation Recipes (you approve every step)', [
    { key: 'which', label: 'Recipe', type: 'select', value: 'academic', options: [{ value: 'academic', label: 'Prepare Academic Paper' }, { value: 'sharing', label: 'Prepare Document for Sharing' }] }
  ], 'Load Recipe')
  if (!r) return
  const steps = r.which === 'academic'
    ? [
      { id: 'blanks', label: 'Remove blank pages', run: quickRemoveBlanks },
      { id: 'numbers', label: 'Add page numbers', run: () => document.getElementById('pageNumberBtn')?.click() },
      { id: 'intel', label: 'Detect title / authors / headings', run: async () => { await analyzeDoc(true); renderOverview(); showIntel() } },
      { id: 'toc', label: 'Insert table of contents page', run: insertTocPage },
      { id: 'meta', label: 'Review metadata', run: metadataCleaner },
      { id: 'a11y', label: 'Run accessibility check', run: a11yCheck },
    ]
    : [
      { id: 'privacy', label: 'Privacy scan', run: runPrivacy },
      { id: 'meta', label: 'Metadata scan + strip', run: metadataCleaner },
      { id: 'ann', label: 'List annotations/comments', run: () => { showIntel(); status('Comments are in Tools tab → Comments') } },
      { id: 'size', label: 'Report file size (+ compress option)', run: async () => { const e = E(); status(`Size: ${(e.originalBytes.length / 1024).toFixed(0)} KB — Tools → Compress to shrink`); } },
    ]
  const r2 = await openDialog(`Recipe: ${r.which === 'academic' ? 'Prepare Academic Paper' : 'Prepare for Sharing'}`, steps.map((s) => ({ key: s.id, label: s.label, type: 'check', value: true })), 'Run Selected')
  if (!r2) return
  for (const s of steps) {
    if (!r2[s.id]) continue
    status('Recipe step: ' + s.label)
    try { await s.run() } catch (err) { status(`Step failed (${s.label}): ${err.message}`) }
  }
  status('Recipe finished — review each result above')
}

// ================= command palette =================
function buildCommands() {
  const click = (sel) => () => document.querySelector(sel)?.click()
  return [
    { label: 'Open PDF', hint: 'File', run: click('#fileInput') },
    { label: 'Open Word (.docx)', hint: 'Docs', run: () => document.querySelector('.side-tab[data-tab="docs"]')?.click() || setTimeout(() => document.getElementById('dOpenWord')?.click(), 50) },
    { label: 'Open PowerPoint (.pptx)', hint: 'Docs', run: () => document.querySelector('.side-tab[data-tab="docs"]')?.click() || setTimeout(() => document.getElementById('dOpenPpt')?.click(), 50) },
    { label: 'Open Excel (.xlsx)', hint: 'Sheets', run: () => document.querySelector('.side-tab[data-tab="sheets"]')?.click() || setTimeout(() => document.getElementById('sheetOpen')?.click(), 50) },
    { label: 'New Spreadsheet', hint: 'Sheets', run: () => document.getElementById('sheetNew')?.click() },
    { label: 'Save PDF (Ctrl+S)', hint: 'File', run: () => E().saveBtn.click() },
    { label: 'New Blank PDF', hint: 'File', run: () => document.querySelector('#menubar [data-act="new"]')?.click() },
    { label: 'Print (Ctrl+P)', hint: 'File', run: () => document.querySelector('#menubar [data-act="print"]')?.click() },
    { label: 'Undo (Ctrl+Z)', hint: 'Edit', run: () => E().undo() },
    { label: 'Redo (Ctrl+Y)', hint: 'Edit', run: () => E().redo() },
    { label: 'Find / Replace (Ctrl+F)', hint: 'Edit', run: () => document.getElementById('findModal').classList.remove('hidden') },
    { label: 'Go to Page', hint: 'View', run: () => document.querySelector('#menubar [data-act="gotopage"]')?.click() },
    { label: 'Add Text', hint: 'Insert', run: () => document.getElementById('addTextBtn')?.click() },
    { label: 'Add Image', hint: 'Insert', run: () => document.getElementById('imageInput')?.click() },
    { label: 'Insert Table', hint: 'Insert', run: () => document.getElementById('insertTableBtn')?.click() },
    { label: 'Sign (draw pad)', hint: 'Sign', run: () => document.getElementById('sigPad')?.scrollIntoView({ block: 'center' }) },
    { label: 'Merge PDFs', hint: 'Document', run: () => document.querySelector('#menubar [data-act="pg-merge"]')?.click() },
    { label: 'Split PDF', hint: 'Document', run: () => document.querySelector('#menubar [data-act="pg-split"]')?.click() },
    { label: 'Compress PDF', hint: 'Tools', run: () => document.querySelector('#menubar [data-act="compress"]')?.click() },
    { label: 'OCR Page', hint: 'Tools', run: () => document.querySelector('#menubar [data-act="ocr"]')?.click() },
    { label: 'Document Intelligence', hint: 'Intelligence', run: () => { showIntel() } },
    { label: 'Quick Actions', hint: 'Intelligence', run: () => { showIntel(); document.getElementById('qaInput')?.focus() } },
    { label: 'Smart Search', hint: 'Intelligence', run: () => { showIntel(); smartSearchDlg() } },
    { label: 'Health Check', hint: 'Intelligence', run: runHealth },
    { label: 'Clean PDF', hint: 'Intelligence', run: openCleanup },
    { label: 'Privacy Scanner', hint: 'Intelligence', run: runPrivacy },
    { label: 'Quick Summary', hint: 'Intelligence', run: showSummary },
    { label: 'Detect Tables', hint: 'Intelligence', run: detectTablesUI },
    { label: 'Academic Mode', hint: 'Intelligence', run: academicMode },
    { label: 'Templates', hint: 'Intelligence', run: templatesUI },
    { label: 'Compare PDFs', hint: 'Tools', run: () => document.querySelector('#menubar [data-act="compare"]')?.click() },
    { label: 'Redact: Mark Area', hint: 'Tools', run: () => { E().tool = 'redact'; status('Redaction mode: press + drag') } },
    { label: 'Apply Redactions', hint: 'Tools', run: () => document.querySelector('#menubar [data-act="red-apply"]')?.click() },
    { label: 'Metadata', hint: 'Tools', run: () => document.querySelector('#menubar [data-act="metadata"]')?.click() },
    { label: 'Check for Updates', hint: 'Help', run: () => document.querySelector('#menubar [data-act="upd-check"]')?.click() },
  ]
}
function togglePalette(force) {
  let pal = document.getElementById('cmdPalette')
  if (pal && force !== true) { pal.remove(); return }
  if (!pal) {
    pal = document.createElement('div')
    pal.id = 'cmdPalette'
    pal.innerHTML = `<input id="cmdInput" placeholder="Type a command… (Esc closes)" /><div id="cmdList"></div>`
    document.body.appendChild(pal)
  }
  const inp = pal.querySelector('#cmdInput'), list = pal.querySelector('#cmdList')
  const cmds = buildCommands()
  const draw = (f) => {
    list.innerHTML = ''
    cmds.filter((c) => (c.label + ' ' + c.hint).toLowerCase().includes(f.toLowerCase())).slice(0, 14).forEach((c) => {
      const d = document.createElement('div')
      d.className = 'sr-item'
      d.innerHTML = `<b>${c.label}</b> <small style="color:#94a3b8;">${c.hint}</small>`
      d.onclick = () => { pal.remove(); c.run() }
      list.appendChild(d)
    })
    const first = list.querySelector('.sr-item')
    if (first && f) first.style.background = '#1e293b'
  }
  inp.value = ''
  draw('')
  inp.focus()
  inp.oninput = () => draw(inp.value)
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') { const f = list.querySelector('.sr-item'); if (f) { pal.remove(); f.click() } }
    if (e.key === 'Escape') pal.remove()
  }
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    const tag = (e.target.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
    e.preventDefault()
    togglePalette()
  }
})
async function smartSearchDlg() {
  const r = await openDialog('Smart Search (local index + related terms)', [{ key: 'q', label: 'Search', value: '' }], 'Search')
  if (r && r.q) { showIntel(); await smartSearch(r.q) }
}

// ================= registrations =================
window.__bx = {
  'bx-intel': async () => { showIntel(); await analyzeDoc(true); renderOverview(); renderSuggestions() },
  'bx-qa': () => { showIntel(); setTimeout(() => document.getElementById('qaInput')?.focus(), 50) },
  'bx-smart': smartSearchDlg,
  'bx-health': async () => { showIntel(); await runHealth() },
  'bx-autofix': async () => { showIntel(); await autoFixHealth(null) },
  'bx-clean': async () => { showIntel(); await openCleanup() },
  'bx-privacy': async () => { showIntel(); await runPrivacy() },
  'bx-summary': async () => { showIntel(); await showSummary() },
  'bx-tables': detectTablesUI,
  'bx-academic': academicMode,
  'bx-templates': templatesUI,
  'bx-batchx': batchExtras,
  'bx-a11y': a11yCheck,
  'bx-recipes': recipesUI,
  'bx-palette': () => togglePalette(true),
  'bx-redact-info': () => {
    showInfo('About True Redaction Here', `<div style="font-size:12px;line-height:1.8;">Marked pages are <b>rasterized on Apply</b>: vector text is replaced by flat pixels, then the app verifies zero extractable text remains. Form fields/links on those pages are removed too. This is genuine local redaction without paid SDKs — with the honest trade-off that redacted pages become images (like a scan).</div>`)
  },
  'bx-ocr-go': () => document.querySelector('#menubar [data-act="ocr"]')?.click(),
}
window.__bxComp = () => document.querySelector('#menubar [data-act="compress"]')?.click()
window.__bxMerge = () => document.querySelector('#menubar [data-act="pg-merge"]')?.click()
window.ProActMeta = () => document.querySelector('#menubar [data-act="metadata"]')?.click()
reg('bx-intel', window.__bx['bx-intel'])
