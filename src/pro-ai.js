// pro-ai: FREE / OPEN-SOURCE local AI (no paid APIs, no cloud keys).
// Uses transformers.js (Apache-2.0) with the all-MiniLM-L6-v2 sentence model
// (~23 MB, downloaded once from Hugging Face, then runs 100% locally via WASM).
// Provides: AI Semantic Search + Extractive Q&A + topic clusters.
// OCR in this app uses Tesseract.js (Apache-2.0) — also free/open-source.
import { E, status, showInfo } from './pro-core.js'

const CDNS = [
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2',
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm',
  'https://unpkg.com/@xenova/transformers@2.17.2/dist/transformers.min.js',
]
let tfLib = null
let embedder = null
let aiIndex = null // { proxy, chunks:[{text,page,vec}] }

async function loadEngine(onLog) {
  if (embedder) return embedder
  let lastErr = null
  for (const cdn of CDNS) {
    try {
      onLog && onLog('Loading transformers.js from ' + cdn.split('/')[2] + ' …')
      tfLib = await import(/* @vite-ignore */ cdn)
      if (tfLib && (tfLib.pipeline || tfLib.default?.pipeline)) { if (!tfLib.pipeline) tfLib = tfLib.default; break }
    } catch (e) { lastErr = e; tfLib = null }
  }
  if (!tfLib) throw new Error('Could not load the open-source AI engine (need internet once): ' + (lastErr && lastErr.message))
  const { pipeline, env } = tfLib
  env.allowLocalModels = false
  env.useBrowserCache = true
  if (env.backends && env.backends.onnx && env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1
  onLog && onLog('Downloading model all-MiniLM-L6-v2 (~23 MB, once)…')
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
    progress_callback: (p) => { if (p && p.status === 'progress' && p.progress) onLog && onLog(`model download ${Math.round(p.progress)}%`) }
  })
  onLog && onLog('Model ready — runs locally & offline from now on.')
  return embedder
}
// preload button: download the model once while online
async function preloadModel() {
  const { taskBegin } = await import('./pro-core.js')
  const t = taskBegin('Preloading local AI model')
  try { await loadEngine((m) => t.log(m)); await embedder('warmup', { pooling: 'mean', normalize: true }); t.done('Local AI ready — works offline now') }
  catch (e) { t.done('Preload failed: ' + e.message) }
}
function cos(a, b) {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}
async function embed(text) {
  const out = await embedder(text, { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}
// chunk page text into ~sentence groups for better matching
function chunkPages(pages) {
  const chunks = []
  for (const p of pages) {
    const sents = (p.text.match(/[^.!?]{30,300}[.!?]/g) || [p.text]).map((s) => s.trim()).filter(Boolean)
    for (let i = 0; i < sents.length; i += 3) {
      const text = sents.slice(i, i + 3).join(' ')
      if (text.trim().length > 40) chunks.push({ text, page: p.n })
    }
  }
  return chunks.slice(0, 600)
}
async function buildIndex(onLog) {
  const e = E()
  if (!e.pdfDocProxy) { status('Open a PDF first'); return null }
  if (aiIndex && aiIndex.proxy === e.pdfDocProxy) return aiIndex
  onLog && onLog('Reading document text…')
  const pages = []
  for (let i = 1; i <= e.totalPages; i++) {
    const tc = await (await e.pdfDocProxy.getPage(i)).getTextContent()
    pages.push({ n: i, text: (tc.items || []).map((it) => it.str || '').join(' ') })
  }
  const chunks = chunkPages(pages)
  onLog && onLog(`Embedding ${chunks.length} passages with local AI…`)
  let k = 0
  for (const c of chunks) {
    c.vec = await embed(c.text)
    if (++k % 15 === 0) onLog && onLog(`Embedded ${k}/${chunks.length}…`)
  }
  aiIndex = { proxy: e.pdfDocProxy, chunks }
  onLog && onLog(`Index ready (${chunks.length} passages).`)
  return aiIndex
}

// ---------- public features ----------
async function semanticSearch() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const q = await import('./pro-core.js').then((m) => m.openDialog('AI Semantic Search (local model)', [
    { key: 'q', label: 'Search meaning, not just words', value: '', placeholder: 'e.g. payment problems' },
    { key: 'top', label: 'Results', type: 'number', value: 8, min: 1, max: 20 }
  ], 'Search'))
  if (!q || !q.q) return
  const { taskBegin, setBar } = await import('./pro-core.js')
  const t = taskBegin('AI Semantic Search')
  try {
    await loadEngine((m) => t.log(m))
    const idx = await buildIndex((m) => t.log(m))
    t.log('Ranking passages…'); setBar(70)
    const qv = await embed(q.q)
    const ranked = idx.chunks.map((c) => ({ ...c, score: cos(qv, c.vec) })).sort((a, b) => b.score - a.score).slice(0, q.top | 0 || 8)
    setBar(100)
    const body = showInfo('🧠 AI Semantic Search — Local (open-source model)', `<div style="font-size:12px;">
      <b>Query:</b> ${q.q.replace(/</g, '&lt;')}<br/><small style="color:#94a3b8;">all-MiniLM-L6-v2 embeddings • cosine similarity • 100% local</small>
      <div style="margin-top:8px;">${ranked.map((r) => `<div class="form-item" style="cursor:pointer" data-pg="${r.page}"><b>Page ${r.page}</b> · ${(r.score * 100).toFixed(0)}% match<br/><small>${r.text.slice(0, 240).replace(/</g, '&lt;')}</small></div>`).join('')}</div>
    </div>`)
    body.querySelectorAll('[data-pg]').forEach((d) => d.onclick = () => document.querySelectorAll('.page-wrap')[+d.dataset.pg - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    t.done(`Top ${ranked.length} semantic matches`)
  } catch (err) { t.done('AI search failed: ' + err.message + ' (needs internet for first model download)') }
}

async function askDoc() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const q = await import('./pro-core.js').then((m) => m.openDialog('Ask this document (local AI, extractive)', [
    { key: 'q', label: 'Your question', value: '', placeholder: 'e.g. What are the main causes?' },
    { key: 'top', label: 'Passages to show', type: 'number', value: 5, min: 1, max: 15 }
  ], 'Ask'))
  if (!q || !q.q) return
  const { taskBegin, setBar } = await import('./pro-core.js')
  const t = taskBegin('Local Q&A')
  try {
    await loadEngine((m) => t.log(m))
    const idx = await buildIndex((m) => t.log(m))
    const qv = await embed(q.q)
    const ranked = idx.chunks.map((c) => ({ ...c, score: cos(qv, c.vec) })).sort((a, b) => b.score - a.score).slice(0, q.top | 0 || 5)
    setBar(100)
    const body = showInfo('🧠 Ask Document — Local extractive answer', `<div style="font-size:12px;">
      <b>Q:</b> ${q.q.replace(/</g, '&lt;')}<br/><small style="color:#94a3b8;">Extractive: the most relevant passages are quoted — no fabricated text (local model, no paid API).</small>
      <div style="margin-top:8px;">${ranked.map((r, i) => `<div class="form-item" style="cursor:pointer" data-pg="${r.page}"><b>#${i + 1} · Page ${r.page}</b> (${(r.score * 100).toFixed(0)}%)<br/><small>${r.text.slice(0, 300).replace(/</g, '&lt;')}</small></div>`).join('')}</div>
    </div>`)
    body.querySelectorAll('[data-pg]').forEach((d) => d.onclick = () => document.querySelectorAll('.page-wrap')[+d.dataset.pg - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    t.done('Answer passages shown')
  } catch (err) { t.done('Q&A failed: ' + err.message + ' (needs internet for first model download)') }
}

async function topicClusters() {
  const e = E()
  if (!e.pdfDocProxy) return status('Open a PDF first')
  const { taskBegin, setBar } = await import('./pro-core.js')
  const t = taskBegin('AI topics (local)')
  try {
    await loadEngine((m) => t.log(m))
    const idx = await buildIndex((m) => t.log(m))
    setBar(60)
    // greedy clustering by cosine similarity
    const clusters = []
    for (const c of idx.chunks) {
      let best = null, bestS = 0
      for (const cl of clusters) { const s = cos(c.vec, cl.center); if (s > bestS) { bestS = s; best = cl } }
      if (best && bestS > 0.55) { best.items.push(c); best.center = best.center.map((v, i) => v * 0.8 + c.vec[i] * 0.2) }
      else clusters.push({ center: c.vec.slice(), items: [c] })
    }
    clusters.sort((a, b) => b.items.length - a.items.length)
    setBar(100)
    const body = showInfo('🧠 Topic Clusters — Local AI', `<div style="font-size:12px;"><small style="color:#94a3b8;">Passages grouped by meaning (local embeddings).</small>
      ${clusters.slice(0, 8).map((cl, i) => `<div class="form-item" style="cursor:pointer" data-pg="${cl.items[0].page}"><b>Cluster ${i + 1}</b> — ${cl.items.length} passages · pages ${[...new Set(cl.items.map(x => x.page))].slice(0, 8).join(', ')}<br/><small>${cl.items[0].text.slice(0, 200).replace(/</g, '&lt;')}</small></div>`).join('')}</div>`)
    body.querySelectorAll('[data-pg]').forEach((d) => d.onclick = () => document.querySelectorAll('.page-wrap')[+d.dataset.pg - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    t.done(`${clusters.length} topic clusters`)
  } catch (err) { t.done('Topics failed: ' + err.message) }
}

// ---------- UI: add AI section to the Intelligence tab + menu ----------
function setupAI() {
  const tab = document.getElementById('tab-intel')
  if (tab && !document.getElementById('aiSection')) {
    const div = document.createElement('div')
    div.className = 'tool-group'
    div.id = 'aiSection'
    div.style.borderColor = '#a855f7'
    div.innerHTML = `<h4>🧠 Local AI (free, open-source)</h4>
      <small style="color:#94a3b8;">transformers.js + MiniLM (Apache-2.0). Downloads ~23 MB once, then offline.</small>
      <button id="aiSearch" class="btn btn-small" style="background:#7c3aed;color:#fff;">🔍 AI Semantic Search…</button>
      <button id="aiAsk" class="btn btn-small" style="background:#9333ea;color:#fff;">💬 Ask Document…</button>
      <button id="aiTopics" class="btn btn-small" style="background:#a855f7;color:#fff;">🗂 Topic Clusters…</button>
      <button id="aiPreload" class="btn btn-small">⬇️ Preload AI model (once)</button>
      <button id="aiOcr" class="btn btn-small">🔎 OCR Page (Tesseract.js)</button>`
    tab.appendChild(div)
  }
  document.getElementById('aiSearch')?.addEventListener('click', semanticSearch)
  document.getElementById('aiAsk')?.addEventListener('click', askDoc)
  document.getElementById('aiTopics')?.addEventListener('click', topicClusters)
  document.getElementById('aiPreload')?.addEventListener('click', preloadModel)
  document.getElementById('aiOcr')?.addEventListener('click', () => document.querySelector('#menubar [data-act="ocr"]')?.click())
  // menu entries
  const menu = document.querySelector('#menubar [data-menu="intel"] .menu-drop')
  if (menu && !menu.querySelector('[data-act="ai-search"]')) {
    const sep = document.createElement('hr')
    const mk = (act, label) => { const b = document.createElement('button'); b.dataset.act = act; b.textContent = label; b.addEventListener('click', () => { document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open')); ({ 'ai-search': semanticSearch, 'ai-ask': askDoc, 'ai-topics': topicClusters }[act])() }); return b }
    menu.append(sep, mk('ai-search', '🔍 AI Semantic Search (local)'), mk('ai-ask', '💬 Ask Document (local)'), mk('ai-topics', '🗂 Topic Clusters (local)'))
  }
}
;(() => { const t = document.getElementById('tab-intel'); if (t) setupAI(); else new MutationObserver(() => { if (document.getElementById('tab-intel')) { setupAI(); } }).observe(document.getElementById('sidebar'), { childList: true }) })()

// reusable: return the top-k most relevant passages for a query (for RAG / AI chat)
async function semanticTopK(q, k = 4, onLog) {
  await loadEngine(onLog)
  const idx = await buildIndex(onLog)
  const qv = await embed(q)
  return idx.chunks.map((c) => ({ ...c, score: cos(qv, c.vec) })).sort((a, b) => b.score - a.score).slice(0, k)
}
async function docFullText() {
  const e = E()
  if (!e.pdfDocProxy) return ''
  let out = ''
  for (let i = 1; i <= e.totalPages; i++) {
    const tc = await (await e.pdfDocProxy.getPage(i)).getTextContent()
    out += (tc.items || []).map((it) => it.str || '').join(' ') + '\n'
  }
  return out
}

export { semanticSearch, askDoc, topicClusters, buildIndex, loadEngine, preloadModel, semanticTopK, docFullText }
