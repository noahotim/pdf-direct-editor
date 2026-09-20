// pro-view: zoom modes, page modes, go-to-page, search+highlight, bookmarks, links
import { E, status, reg, openDialog } from './pro-core.js'

function needDoc() { if (!E().pdfLibDoc) { status('Open a PDF first'); return false } return true }

// ---- 60fps zoom — transform preview + debounced crisp render, virtualized ----
let zoomRaf = null, zoomDebounce = null
async function setZoom(z, opts = {}) {
  const e = E()
  const target = Math.max(0.3, Math.min(3, z))
  const instant = opts.instant
  // 60fps transform preview: scale container without re-rendering every page
  const container = document.getElementById('pdfContainer')
  if (container && !instant) {
    const from = e.currentZoom || 1
    const scale = target / from
    container.style.willChange = 'transform'
    container.style.transformOrigin = 'top center'
    container.style.transform = `scale(${scale})`
    container.style.transition = 'transform 0.12s ease'
    if (zoomRaf) cancelAnimationFrame(zoomRaf)
    zoomRaf = requestAnimationFrame(() => {
      // let transition run, then clear
      setTimeout(() => {
        container.style.transform = ''
        container.style.transition = ''
        container.style.willChange = ''
      }, 140)
    })
  }
  e.currentZoom = target
  // Debounce full crisp re-render (virtualized) — 60fps feel, no jank on large docs
  if (zoomDebounce) clearTimeout(zoomDebounce)
  zoomDebounce = setTimeout(async () => {
    await e.renderAll()
    // virtualized: only render visible + buffer (handled in main.js via IntersectionObserver)
    if (e.renderVisible) await e.renderVisible()
  }, instant ? 0 : 120)
  // Update UI immediately
  const totalPages = e.totalPages || 0
  const pageInfo = document.getElementById('pageInfo')
  const zoomLabel = document.getElementById('zoomLabel')
  if (pageInfo) pageInfo.textContent = `${totalPages} pages • ${Math.round(target*100)}%`
  if (zoomLabel) zoomLabel.textContent = Math.round(target*100)+'%'
}
reg('zin', async () => { if (needDoc()) setZoom(E().currentZoom + 0.15) })
reg('zout', async () => { if (needDoc()) setZoom(E().currentZoom - 0.15) })
reg('actual', async () => { if (needDoc()) setZoom(1) })
reg('fitwidth', async () => {
  if (!needDoc()) return
  const e = E()
  const wrap = document.querySelector('.page-wrap')
  const avail = document.getElementById('viewer').clientWidth - 60
  const cur = wrap ? wrap.clientWidth : 600
  setZoom(e.currentZoom * (avail / cur))
})
reg('fitpage', async () => {
  if (!needDoc()) return
  const e = E()
  const wrap = document.querySelector('.page-wrap')
  const v = document.getElementById('viewer')
  const availW = v.clientWidth - 60, availH = v.clientHeight - 80
  const curW = wrap ? wrap.clientWidth : 600, curH = wrap ? wrap.clientHeight : 800
  setZoom(e.currentZoom * Math.min(availW / curW, availH / curH))
})
// ---- page modes ----
reg('single', () => { document.getElementById('pdfContainer').classList.remove('twopage'); status('Single-page continuous mode') })
reg('twopage', () => { document.getElementById('pdfContainer').classList.add('twopage'); status('Two-page mode (scroll to read)') })
reg('full', () => {
  const v = document.getElementById('viewer')
  if (document.fullscreenElement) document.exitFullscreen()
  else v.requestFullscreen?.()
})
async function gotoPage() {
  if (!needDoc()) return
  const e = E()
  const r = await openDialog('Go to Page', [{ key: 'n', label: `Page (1–${e.totalPages})`, type: 'number', value: e.visiblePageIndex() + 1, min: 1, max: e.totalPages }], 'Go')
  if (!r) return
  const i = Math.max(1, Math.min(e.totalPages, r.n | 0)) - 1
  document.querySelectorAll('.page-wrap')[i]?.scrollIntoView({ block: 'center' })
}
reg('gotopage', gotoPage)
reg('goto-page', gotoPage)

// ---- search with on-page highlight ----
let searchHits = [] // {pageIndex, x,y,w,h}
function clearHits() {
  searchHits = []
  document.querySelectorAll('.search-hit').forEach((n) => n.remove())
  document.getElementById('sideSearchResults').textContent = 'No search yet'
}
async function runSearch(q) {
  clearHits()
  q = (q || '').trim().toLowerCase()
  if (!q) return status('Enter search text')
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  status(`Searching ${e.totalPages} page(s)…`)
  const results = document.getElementById('sideSearchResults')
  results.innerHTML = ''
  let total = 0
  const wantHl = document.getElementById('sideHlCheck').checked
  for (let i = 1; i <= e.totalPages; i++) {
    try {
      const page = await e.pdfDocProxy.getPage(i)
      const tc = await page.getTextContent()
      const items = tc.items || []
      const full = items.map((it) => it.str || '').join(' ')
      const low = full.toLowerCase()
      let at = 0, count = 0
      while ((at = low.indexOf(q, at)) !== -1 && count < 20) { count++; at += q.length }
      if (count > 0) {
        total += count
        const div = document.createElement('div')
        div.className = 'sr-item'
        const si = low.indexOf(q)
        div.innerHTML = `<b>Page ${i}</b> (${count}) — …${full.slice(Math.max(0, si - 30), si + 60).replace(/</g, '&lt;')}…`
        div.onclick = () => document.querySelectorAll('.page-wrap')[i - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        results.appendChild(div)
        if (wantHl) {
          // highlight matching text items using their transforms
          const vp = page.getViewport({ scale: e.currentZoom })
          const ov = document.querySelectorAll('.overlay')[i - 1]
          if (ov) {
            const U = e.libs.pdfjsLib.Util
            for (const it of items) {
              if (!it.str || !it.str.toLowerCase().includes(q)) continue
              try {
                const tx = U.transform(vp.transform, it.transform)
                const fs = Math.hypot(tx[2], tx[3]) || 10
                const w = (it.width || it.str.length * fs * 0.55) * e.currentZoom
                const h = fs * e.currentZoom * 1.1
                const x = tx[4], y = tx[5] - h * 0.85
                const s = document.createElement('div')
                s.className = 'search-hit'
                s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.width = Math.max(6, w) + 'px'; s.style.height = h + 'px'
                ov.appendChild(s)
                searchHits.push({ pageIndex: i - 1 })
              } catch { /* skip item */ }
            }
          }
        }
      }
    } catch { /* next page */ }
  }
  if (!total) { results.textContent = 'No matches'; return status(`No matches for "${q}"`) }
  status(`Found ${total} match${total > 1 ? 'es' : ''} — click a result to jump`)
}
document.getElementById('sideSearchBtn')?.addEventListener('click', () => runSearch(document.getElementById('sideSearchInput').value))
document.getElementById('sideSearchInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(e.target.value) })
document.getElementById('sideClearHlBtn')?.addEventListener('click', () => { clearHits(); status('Search cleared') })

// ---- bookmarks (existing outlines, read-only via pdf.js) ----
async function loadBookmarks() {
  const list = document.getElementById('bmList')
  const e = E()
  if (!e.pdfDocProxy) { list.textContent = 'No PDF loaded'; return }
  list.innerHTML = 'Loading…'
  try {
    const outline = await e.pdfDocProxy.getOutline()
    if (!outline || !outline.length) { list.textContent = 'No bookmarks in this PDF'; return }
    list.innerHTML = ''
    const addItems = (items, depth) => {
      for (const it of items) {
        const d = document.createElement('div')
        d.className = 'bm-item'
        d.style.paddingLeft = 8 + depth * 14 + 'px'
        d.textContent = (it.title || 'Untitled')
        d.title = 'Jump to bookmark'
        d.onclick = async () => {
          try {
            let dest = it.dest
            if (typeof dest === 'string') dest = await e.pdfDocProxy.getDestination(dest)
            if (Array.isArray(dest)) {
              const ref = dest[0]
              const idx = await e.pdfDocProxy.getPageIndex(ref)
              document.querySelectorAll('.page-wrap')[idx]?.scrollIntoView({ block: 'center' })
              status(`Bookmark → page ${idx + 1}`)
            } else status('Bookmark has no page destination')
          } catch (err) { status('Cannot jump: ' + err.message) }
        }
        list.appendChild(d)
        if (it.items && it.items.length) addItems(it.items, depth + 1)
      }
    }
    addItems(outline, 0)
  } catch (err) { list.textContent = 'Bookmarks unavailable: ' + err.message }
}
document.getElementById('bmReloadBtn')?.addEventListener('click', loadBookmarks)
reg('bm-load', loadBookmarks)

// ---- links on visible page (read via pdf.js annotations) ----
document.getElementById('linkScanBtn')?.addEventListener('click', async () => {
  const list = document.getElementById('linkList')
  const e = E()
  if (!e.pdfDocProxy) { list.textContent = 'No PDF loaded'; return }
  const i = e.visiblePageIndex() + 1
  list.innerHTML = 'Scanning…'
  try {
    const page = await e.pdfDocProxy.getPage(i)
    const annots = await page.getAnnotations()
    const links = annots.filter((a) => a.subtype === 'Link' && (a.url || a.dest))
    if (!links.length) { list.textContent = `No links on page ${i}`; return }
    list.innerHTML = ''
    links.slice(0, 30).forEach((l) => {
      const d = document.createElement('div')
      d.className = 'sr-item'
      d.textContent = l.url ? `🌐 ${l.url.slice(0, 60)}` : `📄 → internal link`
      if (l.url) d.onclick = () => window.open(l.url, '_blank')
      list.appendChild(d)
    })
    status(`${links.length} link${links.length > 1 ? 's' : ''} on page ${i}`)
  } catch (err) { list.textContent = 'Scan failed: ' + err.message }
})
