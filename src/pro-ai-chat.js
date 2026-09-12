// pro-ai-chat: on-device AI Assistant — free & open-source large language models.
// Primary engine: WebLLM (runs Meta Llama 3.2 / Microsoft Phi / Google Gemma locally on WebGPU).
// Fallback engine: transformers.js (LaMini-Flan-T5) on WASM when WebGPU is unavailable.
// 100% local after the one-time model download. No paid API, no keys, no cloud.
import { E, status, reg, showInfo, taskBegin } from './pro-core.js'
import { semanticTopK } from './pro-ai.js'

const state = {
  engine: null, kind: null,
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  messages: [],           // chat history [{role, content}]
  ready: false,
}
const WEBLLM_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B (fast, ~0.7 GB)' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B (balanced, ~2 GB)' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Microsoft Phi-3.5 mini (strong, ~2.2 GB)' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', label: 'Google Gemma 2 2B (~1.4 GB)' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B (~0.9 GB)' },
]

// ---------- engines ----------
async function loadLLM(onProgress) {
  if (state.ready) return state.engine
  const log = (t) => onProgress && onProgress(t)
  if (navigator.gpu) {
    try {
      log('WebGPU detected — loading WebLLM (open-source)…')
      const webllm = await import(/* @vite-ignore */ 'https://esm.run/@mlc-ai/web-llm')
      state.engine = await webllm.CreateMLCEngine(state.model, {
        initProgressCallback: (r) => { if (r && r.text) log(r.text) }
      })
      state.kind = 'webllm'; state.ready = true
      log('Model ready — running fully on your device (offline).')
      return state.engine
    } catch (e) { log('WebGPU engine unavailable, using WASM fallback…'); console.warn('webllm failed', e) }
  } else { log('No WebGPU — using WASM fallback engine…') }
  // fallback: transformers.js instruction model (works everywhere, smaller)
  const cdns = ['https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2', 'https://unpkg.com/@xenova/transformers@2.17.2/dist/transformers.min.js']
  let tf = null
  for (const c of cdns) { try { tf = await import(/* @vite-ignore */ c); if (tf && !tf.pipeline && tf.default) tf = tf.default; if (tf && tf.pipeline) break } catch (e) { tf = null } }
  if (!tf) throw new Error('AI engine could not load (needs internet once to download).')
  tf.env.allowLocalModels = false; tf.env.useBrowserCache = true
  log('Downloading LaMini-Flan-T5 (instruction model, ~250 MB)…')
  state.engine = await tf.pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
    quantized: true,
    progress_callback: (p) => { if (p && p.status === 'progress' && p.progress) log(`model ${Math.round(p.progress)}%`) }
  })
  state.kind = 't5'; state.ready = true
  log('Model ready — running locally (offline).')
  return state.engine
}
async function generate(messages, maxTokens = 700) {
  if (!state.ready) throw new Error('Load the AI model first')
  if (state.kind === 'webllm') {
    const r = await state.engine.chat.completions.create({ messages, temperature: 0.6, max_tokens: maxTokens })
    return (r.choices && r.choices[0] && r.choices[0].message.content || '').trim()
  }
  // t5: flatten to a single instruction
  const sys = messages.find((m) => m.role === 'system')
  const convo = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n')
  const prompt = (sys ? sys.content + '\n\n' : '') + convo
  const out = await state.engine(prompt, { max_new_tokens: maxTokens })
  return (out && out[0] && out[0].generated_text || '').trim()
}
async function contextFor(question, k = 4) {
  try {
    const e = E()
    if (!e.pdfDocProxy) return ''
    const hits = await semanticTopK(question, k, () => {})
    return hits.map((h, i) => `[Page ${h.page}] ${h.text}`).join('\n')
  } catch { return '' }
}

// ---------- core actions ----------
async function askAI(question, { useDoc = true } = {}) {
  const t = taskBegin('AI Assistant')
  try {
    await loadLLM((m) => t.log(m))
    let sys = 'You are BOTIM Assistant, a precise, professional writing and research helper. Be clear, correct and concise. If you are unsure, say so.'
    let user = question
    if (useDoc) {
      const ctx = await contextFor(question)
      if (ctx) { sys += ' Use ONLY the following document excerpts when the question is about the document; cite page numbers like (p3).'; user = `Document excerpts:\n${ctx}\n\nQuestion: ${question}` }
    }
    const reply = await generate([{ role: 'system', content: sys }, ...state.messages.slice(-6), { role: 'user', content: user }])
    state.messages.push({ role: 'user', content: question }, { role: 'assistant', content: reply })
    t.done('Done')
    return reply
  } catch (e) { t.done('AI error: ' + e.message); return '⚠ ' + e.message }
}

// ---------- writing tools (used on selected/pasted text) ----------
const TOOLS = {
  grammar: 'Fix all spelling, grammar and punctuation. Keep the meaning and tone. Output only the corrected text.',
  rewrite: 'Rewrite the following text to be clearer and more engaging while keeping the meaning. Output only the rewritten text.',
  professional: 'Rewrite the following text in a formal, professional tone. Output only the revised text.',
  simplify: 'Rewrite the following text in simple, plain English for a general audience. Output only the simplified text.',
  shorten: 'Summarise the following text into a concise version. Output only the shortened text.',
  expand: 'Expand the following text with relevant detail and better structure. Output only the expanded text.',
  keypoints: 'Extract the 5 most important points from the following text as a short bullet list.',
  translate: 'Translate the following text into {LANG}. Output only the translation.',
  summarize: 'Write a clear summary of the following text in about 120 words.',
}

// ---------- UI ----------
function el(id) { return document.getElementById(id) }
function addMsg(role, text) {
  const box = el('aiMessages'); if (!box) return
  const d = document.createElement('div')
  d.style.cssText = `margin:6px 0;padding:8px 10px;border-radius:10px;font-size:12.5px;line-height:1.55;white-space:pre-wrap;${role === 'user' ? 'background:#1e3a8a;color:#fff;margin-left:18%;' : role === 'system' ? 'background:#0f172a;color:#94a3b8;' : 'background:#0f172a;color:#e2e8f0;border:1px solid #1e293b;'}`
  d.textContent = (role === 'user' ? '🧑 ' : role === 'assistant' ? '🤖 ' : 'ℹ️ ') + text
  box.appendChild(d); box.scrollTop = box.scrollHeight
  return d
}
function setupAITab() {
  const tab = el('tab-ai'); if (!tab) return
  tab.innerHTML = `
    <h3>AI Assistant <span style="color:#a855f7;font-size:11px;">local • free</span></h3>
    <div class="tool-group" style="border-color:#a855f7;">
      <h4>Model</h4>
      <select id="aiModel" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">
        ${WEBLLM_MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}
      </select>
      <button id="aiLoad" class="btn btn-small" style="background:#a855f7;color:#fff;">⬇️ Load AI model (once)</button>
      <small id="aiEngineInfo" style="color:#94a3b8;font-size:10px;">Runs on your device. Downloads once, then works offline.</small>
    </div>
    <div class="tool-group"><h4>💬 Chat about your document</h4>
      <div id="aiMessages" style="max-height:38vh;overflow:auto;background:#0b1220;border:1px solid #1e293b;border-radius:8px;padding:8px;"><div style="color:#64748b;font-size:12px;">Load the model, then ask anything — answers cite your PDF pages.</div></div>
      <div style="display:flex;gap:4px;margin-top:6px;"><input id="aiInput" placeholder="Ask about this document…" style="flex:1;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;" /><button id="aiSend" class="btn btn-small" style="width:auto;background:#a855f7;color:#fff;">▶</button></div>
      <label style="font-size:11px;"><input type="checkbox" id="aiUseDoc" checked /> Use document as context (RAG)</label>
    </div>
    <div class="tool-group" style="border-color:#f59e0b;"><h4>✍️ Writing tools</h4>
      <textarea id="aiText" rows="4" placeholder="Paste or type text here, then pick a tool…" style="width:100%;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;"></textarea>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn btn-small" data-tool="grammar">Fix grammar</button>
        <button class="btn btn-small" data-tool="rewrite">Rewrite</button>
        <button class="btn btn-small" data-tool="professional">Professional</button>
        <button class="btn btn-small" data-tool="simplify">Simplify</button>
        <button class="btn btn-small" data-tool="shorten">Shorten</button>
        <button class="btn btn-small" data-tool="keypoints">Key points</button>
        <button class="btn btn-small" data-tool="summarize">Summarise</button>
      </div>
      <div style="display:flex;gap:4px;margin-top:4px;align-items:center;">
        <select id="aiLang" style="flex:1;padding:6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">
          <option>French</option><option>Spanish</option><option>Arabic</option><option>Swahili</option><option>Chinese</option><option>German</option><option>Portuguese</option><option>Hindi</option>
        </select>
        <button class="btn btn-small" data-tool="translate" style="width:auto;background:#0ea5e9;color:#fff;">Translate</button>
      </div>
      <div id="aiOut" style="margin-top:6px;font-size:12px;color:#e2e8f0;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:8px;white-space:pre-wrap;min-height:40px;"></div>
      <div style="display:flex;gap:4px;margin-top:4px;"><button id="aiCopyOut" class="btn btn-small" style="flex:1;">📋 Copy result</button><button id="aiUseOut" class="btn btn-small" style="flex:1;">↪ Put back in box</button></div>
    </div>`
  el('aiLoad').onclick = async () => {
    state.model = el('aiModel').value
    const t = taskBegin('Loading on-device AI')
    try { await loadLLM((m) => t.log(m)); el('aiEngineInfo').textContent = '✓ Ready (' + (state.kind === 'webllm' ? 'WebLLM / WebGPU' : 'transformers.js / WASM') + ') — works offline now'; t.done('AI ready') }
    catch (e) { t.done('AI load failed: ' + e.message) }
  }
  const send = async () => {
    const q = el('aiInput').value.trim(); if (!q) return
    el('aiInput').value = ''; addMsg('user', q)
    const ph = addMsg('assistant', '…thinking (local model)')
    const r = await askAI(q, { useDoc: el('aiUseDoc').checked })
    ph.textContent = '🤖 ' + r
  }
  el('aiSend').onclick = send
  el('aiInput').onkeydown = (e) => { if (e.key === 'Enter') send() }
  tab.querySelectorAll('[data-tool]').forEach((b) => b.onclick = async () => {
    const src = el('aiText').value.trim() || (window.getSelection && window.getSelection().toString().trim()) || ''
    if (!src) return status('Type or select some text first')
    let instr = TOOLS[b.dataset.tool]
    if (b.dataset.tool === 'translate') instr = instr.replace('{LANG}', el('aiLang').value)
    const t = taskBegin('AI writing tool')
    try {
      await loadLLM((m) => t.log(m))
      const out = await generate([{ role: 'system', content: 'You are a professional editor.' }, { role: 'user', content: instr + '\n\n' + src }], 800)
      el('aiOut').textContent = out || '(no output)'
      t.done('Done')
    } catch (e) { el('aiOut').textContent = '⚠ ' + e.message; t.done('Failed: ' + e.message) }
  })
  el('aiCopyOut').onclick = async () => { try { await navigator.clipboard.writeText(el('aiOut').textContent); status('Copied') } catch { status('Clipboard blocked') } }
  el('aiUseOut').onclick = () => { el('aiText').value = el('aiOut').textContent }
}
;(() => {
  const tabs = document.querySelector('.side-tabs')
  if (tabs && !tabs.querySelector('[data-tab="ai"]')) {
    const b = document.createElement('button'); b.className = 'side-tab'; b.dataset.tab = 'ai'; b.textContent = 'AI'
    const docs = tabs.querySelector('[data-tab="docs"]'); if (docs) docs.after(b); else tabs.appendChild(b)
    const p = document.createElement('div'); p.id = 'tab-ai'; p.className = 'hidden'
    el('sidebar').appendChild(p)
  }
  setupAITab()
  // menu
  let m = document.querySelector('#menubar [data-menu="ai"]')
  if (!m) {
    m = document.createElement('div'); m.className = 'menu'; m.dataset.menu = 'ai'
    m.innerHTML = `<button class="menu-btn">AI</button><div class="menu-drop">
      <button data-act="ai-tab">🤖 AI Assistant</button>
      <button data-act="ai-summarize-doc">📝 Summarise document (AI)</button>
      <button data-act="ai-fix-grammar">✍️ Fix grammar (selected text)</button>
      <button data-act="ai-translate">🌍 Translate (selected text)</button>
    </div>`
    const docs = document.querySelector('#menubar [data-menu="docs"]')
    if (docs) docs.before(m); else document.getElementById('menubar').appendChild(m)
    m.querySelector('.menu-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      const was = m.classList.contains('open')
      document.querySelectorAll('#menubar .menu.open').forEach((x) => x.classList.remove('open'))
      if (!was) m.classList.add('open')
    })
    m.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      document.querySelectorAll('#menubar .menu.open').forEach((x) => x.classList.remove('open'))
      document.querySelector('.side-tab[data-tab="ai"]')?.click()
      const act = btn.dataset.act
      if (act === 'ai-summarize-doc') { el('aiInput').value = 'Summarise this whole document with key points and conclusion.'; el('aiSend')?.click() }
      if (act === 'ai-fix-grammar') { el('aiText').value = window.getSelection().toString(); tab_tool('grammar') }
      if (act === 'ai-translate') { el('aiText').value = window.getSelection().toString(); tab_tool('translate') }
    }))
  }
  function tab_tool(name) { el('tab-ai')?.querySelector(`[data-tool="${name}"]`)?.click() }
})()

reg('ai-tab', () => document.querySelector('.side-tab[data-tab="ai"]')?.click())

export { askAI, loadLLM, generate }
