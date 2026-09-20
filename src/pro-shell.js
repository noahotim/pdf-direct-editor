// pro-shell: menubar, sidebar tabs, statusbar, theme, shortcuts, properties, recent/IDB/recovery, file ops
import { E, status, Actions, reg, openDialog, showInfo, downloadBytes, pickFiles, idbPut, idbGet, idbDel, idbAll } from './pro-core.js'

const $ = (s) => document.querySelector(s)

// ---- modern adaptive ribbon — keyboard-first, 60fps, accessible ----
const menubar = document.getElementById('menubar')
if (menubar) menubar.setAttribute('role', 'menubar')
// Click to open
document.querySelectorAll('#menubar .menu').forEach((menu, idx) => {
  const btn = menu.querySelector('.menu-btn')
  if (!btn) return
  btn.setAttribute('role', 'menuitem')
  btn.setAttribute('aria-haspopup', 'true')
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('tabindex', idx === 0 ? '0' : '-1')
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const was = menu.classList.contains('open')
    document.querySelectorAll('#menubar .menu.open').forEach((m) => {
      m.classList.remove('open')
      m.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false')
    })
    if (!was) {
      menu.classList.add('open')
      btn.setAttribute('aria-expanded', 'true')
      // focus first item for keyboard nav
      const first = menu.querySelector('.menu-drop button')
      if (first) setTimeout(() => first.focus(), 0)
    }
  })
  btn.addEventListener('keydown', (e) => {
    const menus = [...document.querySelectorAll('#menubar .menu')]
    if (e.key === 'ArrowRight') { e.preventDefault(); const next = menus[(idx + 1) % menus.length].querySelector('.menu-btn'); next.focus() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); const prev = menus[(idx - 1 + menus.length) % menus.length].querySelector('.menu-btn'); prev.focus() }
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); btn.click()
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('#menubar .menu.open').forEach(m => m.classList.remove('open'))
      btn.blur()
    }
  })
})
// Alt+letter accelerators + Esc
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.shiftKey) {
    const map = { f: 'file', e: 'edit', v: 'view', i: 'insert', t: 'tools', d: 'document', h: 'help', n: 'intel' }
    const key = e.key.toLowerCase()
    if (map[key]) {
      const m = document.querySelector(`#menubar [data-menu="${map[key]}"]`)
      if (m) { e.preventDefault(); m.querySelector('.menu-btn')?.click(); }
    }
  }
})
document.addEventListener('click', (e) => {
  if (!e.target.closest('#menubar .menu')) document.querySelectorAll('#menubar .menu.open').forEach((m) => {
    m.classList.remove('open')
    m.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false')
  })
})
// Menu item keyboard nav
document.querySelectorAll('#menubar .menu-drop').forEach(drop => {
  drop.setAttribute('role', 'menu')
  drop.addEventListener('keydown', (e) => {
    const items = [...drop.querySelectorAll('button:not([disabled])')]
    const idx = items.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus() }
    if (e.key === 'Home') { e.preventDefault(); items[0]?.focus() }
    if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus() }
    if (e.key === 'Escape') {
      e.preventDefault()
      drop.closest('.menu')?.classList.remove('open')
      drop.closest('.menu')?.querySelector('.menu-btn')?.focus()
    }
  })
})
document.querySelectorAll('#menubar [data-act]').forEach((b) => {
  b.setAttribute('role', 'menuitem')
  b.setAttribute('tabindex', '-1')
  b.title = b.textContent.trim()
  b.addEventListener('click', () => {
    document.querySelectorAll('#menubar .menu.open').forEach((m) => {
      m.classList.remove('open')
      m.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false')
    })
    const fn = Actions[b.dataset.act]
    if (fn) fn(); else status(`Coming online: ${b.dataset.act}`)
  })
})

// ---- sidebar tabs (generic â€” handles tools/pages/marks/search/intel/convert/feedback and any future tabs) ----
function initTabs() {
  const tabs = document.querySelectorAll('.side-tab')
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'))
      t.classList.add('active')
      document.querySelectorAll('[id^="tab-"]').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + t.dataset.tab))
      if (t.dataset.tab === 'pages' && Actions['pages-refresh']) Actions['pages-refresh']()
      if (t.dataset.tab === 'marks' && Actions['bm-load']) Actions['bm-load']()
    })
  })
}
initTabs()
// re-init when new tabs are injected (Convert, Feedback, Intel) â€” observe side-tabs
new MutationObserver(() => {
  document.querySelectorAll('.side-tab').forEach((t) => {
    if (t._botimWired) return
    t._botimWired = true
    t.addEventListener('click', () => {
      document.querySelectorAll('.side-tab').forEach((x) => x.classList.remove('active'))
      t.classList.add('active')
      document.querySelectorAll('[id^="tab-"]').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + t.dataset.tab))
      if (t.dataset.tab === 'pages' && Actions['pages-refresh']) Actions['pages-refresh']()
      if (t.dataset.tab === 'marks' && Actions['bm-load']) Actions['bm-load']()
    })
  })
}).observe(document.querySelector('.side-tabs'), { childList: true })
export function showTab(name) { document.querySelector(`.side-tab[data-tab="${name}"]`)?.click() }

// ---- themes: dark / light / high-contrast — AAA accessible, customizable ----
const THEMES = ['dark', 'light', 'high-contrast']
let currentTheme = localStorage.getItem('pde-theme') || 'dark'
if (currentTheme === 'light') document.body.classList.add('light')
if (currentTheme === 'high-contrast') document.body.classList.add('high-contrast')
function applyTheme(t) {
  document.body.classList.remove('light', 'high-contrast')
  if (t === 'light') document.body.classList.add('light')
  if (t === 'high-contrast') document.body.classList.add('high-contrast')
  localStorage.setItem('pde-theme', t)
  currentTheme = t
  // live preview: update status bar + announce for screen readers
  const names = { dark: 'Dark — comfortable', light: 'Light — bright', 'high-contrast': 'High contrast — AAA' }
  status(`Theme: ${names[t]}`)
  // dispatch for other modules
  document.dispatchEvent(new CustomEvent('themechange', { detail: t }))
}
function toggleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length]
  applyTheme(next)
}
document.getElementById('themeToggle')?.addEventListener('click', toggleTheme)
// Keyboard shortcut: Ctrl+Shift+T cycles themes
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
    e.preventDefault(); toggleTheme()
  }
})

// ---- customizable panels — resizable, collapsible, persisted ----
;(() => {
  const sidebar = document.getElementById('sidebar')
  const props = document.getElementById('propsPanel')
  if (!sidebar) return
  // Restore widths
  try {
    const w = localStorage.getItem('pde-panel-sidebar-w')
    if (w) sidebar.style.width = w
    const pw = localStorage.getItem('pde-panel-props-w')
    if (pw && props) props.style.width = pw
    const collapsed = localStorage.getItem('pde-panel-collapsed')
    if (collapsed === 'sidebar' && sidebar) sidebar.style.display = 'none'
  } catch {}
  // Add collapse toggles
  const addToggle = (panel, key, label) => {
    if (!panel || panel.querySelector('.panel-toggle')) return
    const btn = document.createElement('button')
    btn.className = 'panel-toggle btn btn-small'
    btn.textContent = '◀'
    btn.title = `Collapse ${label} (double-click to restore)`
    btn.style.cssText = 'position:absolute;top:8px;right:8px;width:auto;padding:2px 6px;font-size:10px;opacity:0.6;'
    btn.onclick = () => {
      const hidden = panel.style.display === 'none'
      panel.style.display = hidden ? '' : 'none'
      try { localStorage.setItem('pde-panel-collapsed', hidden ? '' : key) } catch {}
      status(hidden ? `${label} restored` : `${label} collapsed — double-click menubar to restore`)
    }
    btn.ondblclick = () => {
      panel.style.display = ''
      try { localStorage.removeItem('pde-panel-collapsed') } catch {}
    }
    panel.style.position = 'relative'
    panel.appendChild(btn)
  }
  addToggle(sidebar, 'sidebar', 'Sidebar')
  if (props) addToggle(props, 'props', 'Properties')
  // Resizable via drag handle
  const makeResizable = (panel, key) => {
    if (!panel) return
    const handle = document.createElement('div')
    handle.style.cssText = 'position:absolute;top:0;right:0;width:6px;height:100%;cursor:ew-resize;background:transparent;z-index:5;'
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const startX = e.clientX, startW = panel.offsetWidth
      const onMove = (ev) => {
        const dw = ev.clientX - startX
        const newW = Math.max(180, Math.min(520, startW + dw))
        panel.style.width = newW + 'px'
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        try { localStorage.setItem(key, panel.style.width) } catch {}
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    panel.appendChild(handle)
  }
  makeResizable(sidebar, 'pde-panel-sidebar-w')
  if (props) makeResizable(props, 'pde-panel-props-w')
  // Double-click menubar to restore collapsed
  document.getElementById('menubar')?.addEventListener('dblclick', () => {
    if (sidebar) sidebar.style.display = ''
    if (props) props.style.display = ''
    try { localStorage.removeItem('pde-panel-collapsed') } catch {}
    status('Panels restored')
  })
})()

// ---- context menus — right-click on pages/elements, live preview ----
;(() => {
  let menu = null
  const hide = () => { if (menu) { menu.remove(); menu = null } }
  document.addEventListener('click', hide)
  document.addEventListener('contextmenu', (e) => {
    const pageWrap = e.target.closest && e.target.closest('.page-wrap')
    const editable = e.target.closest && e.target.closest('.editable-text,.editable-image,.shape,.thumb')
    if (!pageWrap && !editable) return
    // Don't interfere with native input context menus
    const tag = (e.target.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
    e.preventDefault()
    hide()
    menu = document.createElement('div')
    menu.style.cssText = 'position:fixed;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:6px;box-shadow:0 12px 32px rgba(0,0,0,0.5);z-index:90;min-width:180px;'
    const item = (label, fn) => {
      const b = document.createElement('button')
      b.textContent = label
      b.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:none;color:#e2e8f0;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:13px;'
      b.onmouseenter = () => b.style.background = '#334155'
      b.onmouseleave = () => b.style.background = 'transparent'
      b.onclick = () => { hide(); fn() }
      menu.appendChild(b)
    }
    if (editable) {
      item('✏️ Edit', () => editable.click())
      item('⧉ Copy (Ctrl+C)', () => { const fn = Actions['copy']; if (fn) fn() })
      item('🗑 Delete', () => { const fn = E().removeSelected?.bind(E()); if (fn) fn() })
      item('⬆ Bring forward', () => document.getElementById('propsFwd')?.click())
      item('⬇ Send backward', () => document.getElementById('propsBwd')?.click())
    } else if (pageWrap) {
      const idx = [...document.querySelectorAll('.page-wrap')].indexOf(pageWrap)
      item(`📄 Page ${idx + 1} — Add text`, () => document.getElementById('addTextBtn')?.click())
      item('🖼️ Add image', () => document.getElementById('imageInput')?.click())
      item('🔍 OCR this page', () => document.querySelector('#menubar [data-act="ocr"]')?.click())
      item('🖨️ Print page', () => { const fn = Actions['print']; if (fn) fn() })
    }
    item('🔍 Zoom in', () => { const fn = Actions['zin']; if (fn) fn() })
    item('🔍 Zoom out', () => { const fn = Actions['zout']; if (fn) fn() })
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px'
    menu.style.top = Math.min(e.clientY, window.innerHeight - 260) + 'px'
    document.body.appendChild(menu)
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) hide() })
})()

// ---- live previews — hover page numbers/thumbnails for larger preview ----
;(() => {
  let tip = null
  const show = (target, html) => {
    if (!tip) {
      tip = document.createElement('div')
      tip.className = 'live-preview'
      document.body.appendChild(tip)
    }
    tip.innerHTML = html
    tip.classList.add('visible')
    const r = target.getBoundingClientRect()
    tip.style.left = Math.min(r.right + 12, window.innerWidth - 300) + 'px'
    tip.style.top = Math.min(r.top, window.innerHeight - 180) + 'px'
  }
  const hide = () => { if (tip) tip.classList.remove('visible') }
  document.addEventListener('mouseover', (e) => {
    const thumb = e.target.closest && e.target.closest('.thumb')
    if (thumb) {
      const canvas = thumb.querySelector('canvas')
      if (canvas) {
        const dataUrl = canvas.toDataURL()
        show(thumb, `<img src="${dataUrl}" style="width:200px;border-radius:6px;display:block;" /><small style="color:#94a3b8;">Page preview — click to jump</small>`)
        return
      }
    }
    const pageNum = e.target.closest && e.target.closest('#sbPage')
    if (pageNum) {
      const e2 = E()
      if (e2 && e2.totalPages) show(pageNum, `<div style="font-size:12px;color:#e2e8f0;"><b>${e2.totalPages} pages</b> • ${Math.round(e2.currentZoom*100)}%<br/><small style="color:#94a3b8;">Scroll or use Go to Page (Ctrl+G)</small></div>`)
    }
  })
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && (e.target.closest('.thumb') || e.target.closest('#sbPage'))) hide()
  })
})()

// ---- clean status bar — live, polished, accessible ----
setInterval(() => {
  try {
    const e = E()
    const file = window.__docName || 'No document'
    const page = e.totalPages ? `Page ${e.visiblePageIndex() + 1} / ${e.totalPages}` : '—'
    const zoom = Math.round((e.currentZoom || 1) * 100) + '%'
    const n = e.edits ? e.edits.length : 0
    const del = e.pagesToDelete ? e.pagesToDelete.size : 0
    $('#sbFile').textContent = file
    $('#sbFile').title = file
    $('#sbPage').textContent = page
    $('#sbZoom').textContent = zoom
    $('#sbCount').textContent = `${e.totalPages || 0} pg • ${n} edit${n === 1 ? '' : 's'}${del ? ` • ${del} del` : ''}`
    // live a11y
    const bar = document.getElementById('statusbar')
    if (bar) bar.setAttribute('aria-live', 'polite')
  } catch { /* core not ready */ }
}, 700)

// ---- doc name tracking + recent docs (IDB with bytes) + autosave ----
async function recordRecent(file, bytes) {
  try {
    window.__docName = file.name
    $('#sbFile').textContent = file.name
    const all = await idbAll()
    const recents = all.filter((r) => r.id.startsWith('recent-')).sort((a, b) => b.mtime - a.mtime)
    for (const r of recents.slice(7)) await idbDel(r.id)
    await idbPut({ id: 'recent-' + Date.now(), name: file.name, size: file.size || bytes.length, mtime: Date.now(), bytes })
    await idbPut({ id: 'autosave', name: file.name, mtime: Date.now(), bytes, edits: [] })
  } catch (err) { console.warn('recent store failed', err) }
}
async function snapshotAutosave() {
  try {
    const e = E()
    if (!e.originalBytes || !window.__docName) return
    await idbPut({ id: 'autosave', name: window.__docName, mtime: Date.now(), bytes: e.originalBytes, edits: JSON.parse(JSON.stringify(e.edits)) })
  } catch { /* quota or size â€” skip */ }
}
setInterval(() => { const e = window.PDFE; if (e && e.edits.length) snapshotAutosave() }, 60000)
window.addEventListener('load', async () => {
  try {
    const auto = await idbGet('autosave')
    if (auto && auto.bytes && auto.bytes.length) {
      const bar = document.getElementById('recoverBar')
      bar.classList.remove('hidden')
      document.getElementById('recoverYes').onclick = async () => {
        bar.classList.add('hidden')
        const e = E()
        window.__docName = auto.name || 'recovered.pdf'
        await e.reloadFromBytes(new Uint8Array(auto.bytes))
        if (auto.edits && auto.edits.length) { e.edits = auto.edits; e.refreshOverlays() }
        status(`Recovered ${window.__docName}`)
      }
      document.getElementById('recoverNo').onclick = async () => { bar.classList.add('hidden'); await idbDel('autosave') }
    }
  } catch { /* no IDB */ }
})

// ---- properties panel (right) ----
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function refreshProps() {
  const panel = document.getElementById('propsPanel')
  const box = document.getElementById('propsContent')
  const e = E()
  const ed = e.selectedEl ? e.getEditForEl(e.selectedEl) : null
  panel.classList.remove('hidden')
  if (!ed) {
    box.innerHTML = `<small style="color:#94a3b8">Click any object on the page to edit its properties here.</small>
      <div class="props-row"><label>Document</label><span>${esc(window.__docName || 'â€”')}</span></div>
      <div class="props-row"><label>Pages</label><span>${e.totalPages}</span></div>
      <div class="props-row"><label>Edits</label><span>${e.edits.length}</span></div>
      <button id="propsMeta" class="btn btn-small">Ã°Å¸ÂÂ·Ã¯Â¸Â Document Metadataâ€¦</button>`
    document.getElementById('propsMeta').onclick = () => { const fn = Actions['metadata']; if (fn) fn() }
    return
  }
  const num = (k, v, step = 1) => `<div class="props-row"><label>${k}</label><input data-k="${k}" type="number" step="${step}" value="${Math.round((v ?? 0) * 10) / 10}" /></div>`
  let h = `<div class="props-row"><label>Type</label><b>${esc(ed.type)}${ed.shape ? ' / ' + esc(ed.shape) : ''}${ed.field ? ' / ' + esc(ed.field) : ''}</b></div>`
  h += `<div class="props-row"><label>Page</label><span>${ed.pageIndex + 1}</span></div>`
  if (ed.x !== undefined) h += num('x', ed.x) + num('y', ed.y)
  if (ed.w !== undefined) h += num('w', ed.w) + (ed.h !== undefined ? num('h', ed.h) : '')
  if (ed.type === 'text' || ed.type === 'callout') {
    h += num('fontSize', ed.fontSize || 14)
    h += `<div class="props-row"><label>Color</label><input data-k="color" type="color" value="${esc(ed.color || '#000000')}" /></div>`
    h += `<div class="props-row"><label>Font</label><select data-k="fontFamily"><option${ed.fontFamily === 'Helvetica' ? ' selected' : ''}>Helvetica</option><option${ed.fontFamily === 'Times' ? ' selected' : ''}>Times</option><option${ed.fontFamily === 'Courier' ? ' selected' : ''}>Courier</option></select></div>`
    h += `<div class="props-row"><label>Bold</label><input data-k="bold" type="checkbox" ${ed.bold ? 'checked' : ''} /></div>`
    h += `<div class="props-row"><label>Italic</label><input data-k="italic" type="checkbox" ${ed.italic ? 'checked' : ''} /></div>`
    h += `<div class="props-row"><label>Underline</label><input data-k="underline" type="checkbox" ${ed.underline ? 'checked' : ''} /></div>`
  }
  if (ed.type === 'image' || ed.type === 'text' || ed.type === 'shape') {
    h += num('rotation', ed.rotation || 0)
    h += `<div class="props-row"><label>Opacity</label><input data-k="opacity" type="number" min="0" max="1" step="0.1" value="${ed.opacity === undefined ? 1 : ed.opacity}" /></div>`
  }
  if (ed.type === 'shape' || ed.type === 'arrow' || ed.type === 'uann' || ed.type === 'sann' || ed.type === 'line') {
    h += `<div class="props-row"><label>Line color</label><input data-k="linecolor" type="color" value="${esc(ed.color || ed.borderColor || '#000000')}" /></div>`
    h += num('width', ed.width || ed.borderWidth || 2, 0.5)
  }
  if (ed.type === 'shape' && ed.shape !== 'ellipse') {
    h += `<div class="props-row"><label>Fill</label><input data-k="fill" type="color" value="${esc(ed.fill || '#ffffff')}" /></div>`
    h += `<div class="props-row"><label>Fill on</label><input data-k="fillon" type="checkbox" ${ed.fill ? 'checked' : ''} /></div>`
  }
  if (ed.type === 'note' || ed.type === 'callout' || ed.type === 'stamp' || ed.type === 'headerFooter') {
    h += `<div class="props-row"><label>Text</label><input data-k="text" type="text" value="${esc(ed.text || '')}" style="width:150px" /></div>`
  }
  if (ed.type === 'image') {
    h += `<div class="props-row"><label>Locked</label><input data-k="locked" type="checkbox" ${ed.locked ? 'checked' : ''} /></div>`
  }
  h += `<div style="display:flex;gap:4px;margin-top:6px;"><button id="propsApply" class="btn btn-small btn-primary" style="flex:1">Apply</button><button id="propsFwd" class="btn btn-small" style="flex:1" title="Bring forward">Ã¢â€“Â²</button><button id="propsBwd" class="btn btn-small" style="flex:1" title="Send backward">Ã¢â€“Â¼</button><button id="propsDel" class="btn btn-small btn-danger" style="flex:1">Del</button></div>`
  box.innerHTML = h
  const get = (k) => box.querySelector(`[data-k="${k}"]`)
  document.getElementById('propsApply').onclick = () => {
    E().pushUndo()
    const gv = (k) => get(k) ? get(k).value : undefined
    const gn = (k) => get(k) ? parseFloat(get(k).value) : undefined
    const gc = (k) => get(k) ? get(k).checked : undefined
    if (get('x')) { ed.x = gn('x'); ed.y = gn('y') }
    if (get('w')) { ed.w = Math.max(4, gn('w')); if (get('h')) ed.h = Math.max(4, gn('h')) }
    if (ed.type === 'text' || ed.type === 'callout') {
      if (get('fontSize')) ed.fontSize = Math.max(4, gn('fontSize'))
      if (get('color')) ed.color = gv('color')
      if (get('fontFamily')) ed.fontFamily = gv('fontFamily')
      if (get('bold')) ed.bold = gc('bold')
      if (get('italic')) ed.italic = gc('italic')
      if (get('underline')) ed.underline = gc('underline')
    }
    if (get('rotation')) ed.rotation = ((gn('rotation') % 360) + 360) % 360
    if (get('opacity')) ed.opacity = Math.max(0, Math.min(1, parseFloat(gv('opacity'))))
    if (get('linecolor')) { const c = gv('linecolor'); if (ed.type === 'shape') ed.borderColor = c; else ed.color = c }
    if (get('width')) { if (ed.type === 'shape') ed.borderWidth = Math.max(0.5, gn('width')); else ed.width = Math.max(0.5, gn('width')) }
    if (get('fillon')) { ed.fill = gc('fillon') ? gv('fill') : null }
    if (get('text')) ed.text = gv('text')
    if (get('locked')) ed.locked = gc('locked')
    E().refreshOverlays()
    syncVisual(ed)
    status('Properties applied')
  }
  document.getElementById('propsDel').onclick = () => { E().removeSelected(); box.innerHTML = 'Deleted.' }
  document.getElementById('propsFwd').onclick = () => zMove(ed, 1)
  document.getElementById('propsBwd').onclick = () => zMove(ed, -1)
}
function syncVisual(ed) {
  const e = E()
  if (!e.selectedEl || e.selectedEl.dataset.id != ed.id) return
  const el = e.selectedEl
  el.style.left = ed.x + 'px'; el.style.top = ed.y + 'px'
  if (ed.w !== undefined) el.style.width = ed.w + 'px'
  if (ed.h !== undefined && !el.classList.contains('editable-text')) el.style.height = ed.h + 'px'
  if (ed.rotation !== undefined && (ed.type === 'image' || ed.type === 'text' || ed.type === 'shape')) el.style.transform = ed.rotation ? `rotate(${ed.rotation}deg)` : ''
  if (ed.opacity !== undefined) el.style.opacity = ed.opacity
}
function zMove(ed, dir) {
  const e = E()
  e.pushUndo()
  const i = e.edits.indexOf(ed)
  const j = i + dir
  if (i < 0 || j < 0 || j >= e.edits.length) return status('Already at ' + (dir > 0 ? 'front' : 'back'))
  ;[e.edits[i], e.edits[j]] = [e.edits[j], e.edits[i]]
  e.refreshOverlays()
  status(dir > 0 ? 'Brought forward' : 'Sent backward')
}
// refresh props whenever selection may have changed (capture clicks in viewer)
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('#pdfContainer')) setTimeout(refreshProps, 60)
}, true)

// ---- clipboard: copy / paste / duplicate ----
let clipboard = null
function copySel() {
  // If there's a text selection (PDF text, highlight text, etc.), let the browser handle it and also copy to system clipboard
  const sel = window.getSelection()
  const selText = sel ? sel.toString().trim() : ''
  if (selText) {
    // Also copy to clipboard for reliability, then let browser do its thing
    navigator.clipboard.writeText(selText).then(() => status(`Copied text: "${selText.slice(0,40)}"`)).catch(() => {})
    return
  }
  const e = E()
  const el = e.selectedEl
  const ed = el ? e.getEditForEl(el) : null
  if (!ed) return status('Nothing selected to copy — select text or an object')
  // Highlights: copy their text content directly
  if (ed.type === 'highlight' && ed.text) {
    navigator.clipboard.writeText(ed.text).then(() => status(`Copied highlighted text: "${ed.text.slice(0,40)}"`)).catch(() => status('Copy failed'))
    return
  }
  // For text boxes, also copy the text
  if (ed.type === 'text' && ed.text) {
    navigator.clipboard.writeText(ed.text).catch(() => {})
  }
  clipboard = JSON.parse(JSON.stringify(ed))
  status(`Copied ${ed.type} (page ${ed.pageIndex + 1}) — Ctrl+V to paste`)
}
function pasteClip() {
  const e = E()
  if (!clipboard) return status('Clipboard empty â€” copy something first')
  e.pushUndo()
  const c = JSON.parse(JSON.stringify(clipboard))
  c.id = Date.now() + Math.random()
  c.x = (c.x || 40) + 24; c.y = (c.y || 40) + 24
  e.edits.push(c)
  e.refreshOverlays()
  status(`Pasted ${c.type} on page ${c.pageIndex + 1}`)
}

// ---- file ops ----
async function newBlank() {
  const r = await openDialog('New Blank PDF', [
    { key: 'pages', label: 'Pages', type: 'number', value: 1, min: 1, max: 200 },
    { key: 'size', label: 'Page size', type: 'select', value: 'A4', options: ['A4', 'Letter', 'Legal'] }
  ], 'Create')
  if (!r) return
  const e = E()
  const sizes = { A4: [595, 842], Letter: [612, 792], Legal: [612, 1008] }
  const { PDFDocument } = e.libs
  const d = await PDFDocument.create()
  const [w, h] = sizes[r.size] || sizes.A4
  for (let i = 0; i < Math.min(200, Math.max(1, r.pages | 0)); i++) d.addPage([w, h])
  d.setTitle('Untitled'); d.setAuthor('Otim Noah'); d.setProducer('BOTIM DOCSHUB by Otim Noah')
  window.__docName = 'untitled.pdf'
  await e.reloadFromBytes(await d.save())
  recordRecent({ name: 'untitled.pdf', size: 0 }, e.originalBytes)
  status(`New ${r.size} document (${r.pages} page${r.pages > 1 ? 's' : ''})`)
}
async function closeDoc() {
  const e = E()
  if (e.edits.length) {
    const r = await openDialog('Close Document', [{ key: 'ok', label: 'Discard unsaved edits and close?', type: 'check', value: false }], 'Close')
    if (!r || !r.ok) return
  }
  e.edits = []; e.pdfLibDoc = null; e.pdfDocProxy = null; e.originalBytes = null; e.totalPages = 0
  e.pdfContainer.innerHTML = ''
  document.getElementById('dropZone').style.display = ''
  e.saveBtn.disabled = true
  e.renderPageList(); window.__docName = null
  status('Document closed')
}
async function saveAs() {
  const r = await openDialog('Save As', [{ key: 'name', label: 'File name (.pdf)', value: (window.__docName || 'edited').replace(/\.pdf$/i, '') + '-edited.pdf' }], 'Save')
  if (!r || !r.name) return
  let n = r.name.trim(); if (!/\.pdf$/i.test(n)) n += '.pdf'
  window.__saveAsName = n
  E().saveBtn.click()
}
async function showRecent() {
  const all = (await idbAll()).filter((r) => r.id.startsWith('recent-')).sort((a, b) => b.mtime - a.mtime)
  if (!all.length) return status('No recent documents yet')
  const r = await openDialog('Recent Documents', [{ key: 'pick', label: `Pick (${all.length})`, type: 'select', value: all[0].id, options: all.map((x) => ({ value: x.id, label: `${x.name} â€” ${(x.size / 1024).toFixed(0)} KB â€” ${new Date(x.mtime).toLocaleString()}` })) }], 'Open')
  if (!r) return
  const rec = await idbGet(r.pick)
  if (!rec || !rec.bytes) return status('Recent file data missing')
  window.__docName = rec.name
  await E().reloadFromBytes(new Uint8Array(rec.bytes))
  status(`Reopened ${rec.name}`)
}

// ---- help ----
function showShortcuts() {
  showInfo('Keyboard Shortcuts', `<div style="font-size:12px;line-height:1.9;">
    <b>Ctrl+S</b> Save (PDF / Word / PowerPoint / Excel) &bull; <b>Ctrl+P</b> Print &bull; <b>Ctrl+Z</b> Undo &bull; <b>Ctrl+Y</b> Redo &bull; <b>Ctrl+F</b> Find<br/>
    <b>Ctrl+B / I / U</b> Bold / Italic / Underline (Word) &bull; <b>Ctrl+C / V / D</b> Copy / Paste / Duplicate &bull; <b>Del</b> Delete &bull; <b>Arrows</b> Nudge<br/>
    <b>Ctrl+K</b> Command Palette &bull; <b>Esc</b> Close dialogs &bull; <b>Enter</b> on welcome to continue</div>`)
}
function showAbout() {
  showInfo('About', `<div style="font-size:12px;line-height:1.8;">
    <b>BOTIM DOCSHUB v2.0.0</b><br/>Developed by <b>Otim Noah</b><br/>
    Direct PDF editing &mdash; text, images, annotations, signatures, forms, pages, cover merge &mdash; saved as PDF without Word conversion.<br/>
    Rendering: pdf.js &bull; Writing: pdf-lib &bull; OCR: Tesseract.js (online) &bull; Runs 100% locally otherwise.</div>`)
}

// ---- register file/edit/view actions (pages/tools/document actions live in their modules) ----
reg('open', () => E().fileInput.click())
reg('new', newBlank)
reg('close', closeDoc)
reg('save', () => E().saveBtn.click())
reg('saveas', saveAs)
reg('download', () => E().saveBtn.click())
reg('recent', showRecent)
reg('undo', () => E().undo())
reg('redo', () => E().redo())
reg('copy', copySel)
reg('paste', pasteClip)
reg('duplicate', () => { copySel(); pasteClip() })
reg('delsel', () => { if (!E().removeSelected()) status('Nothing selected') })
reg('find', () => document.getElementById('findModal').classList.remove('hidden'))
reg('theme', toggleTheme)
reg('shortcuts', showShortcuts)
reg('about', showAbout)
reg('pages-tab', () => showTab('pages'))
reg('gotopage', () => { const fn = Actions['goto-page']; if (fn) fn() })

// ---- global shortcuts — works for PDF + Word + PowerPoint + Excel + all dialogs ----
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase()
  const inWordDoc = !!(e.target.closest && e.target.closest('.doc-page'))
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable || inWordDoc
  if (e.key === 'Escape') { document.querySelectorAll('.modal:not(.hidden)').forEach((m) => m.classList.add('hidden')); return }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
    const k = e.key.toLowerCase()
    if (k === 's') {
      e.preventDefault();
      // Smart save: Word/PPT/Excel or PDF depending on active view
      const isWord = document.getElementById('docWordCanvas')?.style.display !== 'none' && document.getElementById('docCanvasWrap')?.style.display !== 'none'
      const isPpt = document.getElementById('docSlides')?.style.display !== 'none' && document.getElementById('docCanvasWrap')?.style.display !== 'none'
      const isSheet = document.getElementById('sheetCanvas')?.style.display !== 'none' && document.getElementById('sheetCanvas')?.style.display !== ''
      if (isWord) { document.getElementById('dSaveWord')?.click(); status('Saving Word (Ctrl+S)…') }
      else if (isPpt) { document.getElementById('dSavePpt')?.click(); status('Saving PowerPoint (Ctrl+S)…') }
      else if (isSheet) { document.getElementById('sheetSaveXlsx')?.click() || document.getElementById('sheetSave')?.click(); status('Saving spreadsheet (Ctrl+S)…') }
      else E().saveBtn.click()
    }
    else if (k === 'p') { e.preventDefault(); const fn = Actions['print']; if (fn) fn(); else window.print() }
    else if (k === 'z') { // Undo — works for PDF edits and Word contentEditable
      if (inWordDoc) { /* let browser handle Word undo, but keep status */ return }
      e.preventDefault(); E().undo && E().undo(); status('Undo (Ctrl+Z)')
    }
    else if (k === 'y') {
      if (inWordDoc) return
      e.preventDefault(); E().redo && E().redo(); status('Redo (Ctrl+Y)')
    }
    else if (k === 'f') { e.preventDefault(); document.getElementById('findModal')?.classList.remove('hidden'); document.getElementById('findInput')?.focus() }
    else if (k === 'b' && inWordDoc) { e.preventDefault(); document.execCommand('bold', false, null) }
    else if (k === 'i' && inWordDoc) { e.preventDefault(); document.execCommand('italic', false, null) }
    else if (k === 'u' && inWordDoc) { e.preventDefault(); document.execCommand('underline', false, null) }
    else if (!typing && k === 'c') {
      const sel = window.getSelection()
      if (sel && sel.toString().trim()) return
      e.preventDefault(); copySel()
    }
    else if (!typing && k === 'v') {
      const sel = window.getSelection()
      if (sel && !E().selectedEl) return
      e.preventDefault(); pasteClip()
    }
    else if (!typing && k === 'd') { e.preventDefault(); copySel(); pasteClip() }
    else if (k === 'k' && !typing) { e.preventDefault(); const fn = Actions['cmd-palette']; if (fn) fn() }
  } else if (!typing) {
    if (e.key === 'Delete' || e.key === 'Backspace') { if (E().removeSelected()) { e.preventDefault(); status('Deleted selection') } }
    else if (e.key.startsWith('Arrow') && E().selectedEl) {
      const ed = E().getEditForEl(E().selectedEl)
      if (ed && ed.x !== undefined) {
        e.preventDefault()
        const s = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') ed.x = Math.max(0, ed.x - s)
        if (e.key === 'ArrowRight') ed.x += s
        if (e.key === 'ArrowUp') ed.y = Math.max(0, ed.y - s)
        if (e.key === 'ArrowDown') ed.y += s
        E().selectedEl.style.left = ed.x + 'px'; E().selectedEl.style.top = ed.y + 'px'
      }
    }
  }
})

// track opened file names + record recent (main.js loads via same input)
E().fileInput.addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return
  try { recordRecent(f, new Uint8Array(await f.arrayBuffer())) } catch { window.__docName = f.name }
})
// hook drag-drop too (main.js handles the load; we record)
E().viewer.addEventListener('drop', async (ev) => {
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0]
  if (f && /pdf$/i.test(f.type || f.name)) {
    try { recordRecent(f, new Uint8Array(await f.arrayBuffer())) } catch { window.__docName = f.name }
  }
}, true)

// lock support: prevent dragging locked objects (wrap selectEl? patch makeDraggable via blocker)
document.addEventListener('mousedown', (e) => {
  const t = e.target.closest && e.target.closest('.editable-text,.editable-image,.table-wrap')
  if (!t || !t.dataset.id) return
  try {
    const ed = E().getEditForEl(t)
    if (ed && ed.locked && !e.target.classList.contains('del-x')) { e.stopPropagation(); e.preventDefault(); status('Object is locked (unlock in Properties)') }
  } catch { /* ignore */ }
}, true)

export { refreshProps }

