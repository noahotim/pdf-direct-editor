// brain-utils: PURE local algorithms (no DOM, no network, no paid APIs).
// Used by pro-brain.js in the app and by verify-brain.mjs under Node.
// Everything here is deterministic and works fully offline.

// ---------- patterns ----------
export const RX = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  url: /https?:\/\/[^\s)>\]]+/gi,
  doi: /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/gi,
  phone: /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?|\d{2,4}[\s-])?\d{3,4}[\s-]?\d{3,4}(?:[\s-]?\d{2,4})?/g,
  date: /\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi,
  longDigits: /\b\d{8,}\b/g,
  headingNum: /^\s*(\d+(?:\.\d+)*\.?)\s+(.+)$/,
  refNum: /^\s*\[(\d+)\]\s*(.+)$/,
  captionTable: /^\s*table\s+\d+[:.\s]/i,
  captionFig: /^\s*(figure|fig\.)\s+\d+[:.\s]/i,
}
const SECTION_WORDS = ['abstract', 'introduction', 'background', 'methodology', 'methods', 'materials', 'results', 'discussion', 'conclusion', 'conclusions', 'references', 'acknowledg', 'appendix', 'literature review', 'related work', 'evaluation', 'experiments', 'limitations', 'future work', 'keywords']
const AFFIL_WORDS = ['university', 'college', 'institute', 'department', 'faculty', 'school of', 'laboratory', 'centre', 'center for', 'hospital', 'ministry', 'polytechnic']

export function uniq(arr) {
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))]
}
export function extractContacts(text) {
  const t = String(text || '')
  return {
    emails: uniq(t.match(RX.email) || []),
    urls: uniq(t.match(RX.url) || []).slice(0, 200),
    dois: uniq(t.match(RX.doi) || []),
    dates: uniq(t.match(RX.date) || []).slice(0, 200),
    longDigits: uniq(t.match(RX.longDigits) || []).slice(0, 200),
  }
}
export function extractPhones(text) {
  // conservative: require at least 9 digits and a separator or leading +
  const out = []
  for (const m of String(text || '').matchAll(RX.phone)) {
    const s = m[0].trim()
    const digits = s.replace(/\D/g, '')
    if (digits.length >= 9 && digits.length <= 15 && (/[+\-().\s]/.test(s))) out.push(s)
  }
  return uniq(out)
}
// lines: [{text, size, page}] size = dominant font size of the line
export function detectSections(pages) {
  const secs = []
  const seen = new Set()
  for (const pg of pages) {
    for (const ln of pg.lines || []) {
      const t = ln.text.trim()
      if (!t || t.length > 90) continue
      let title = null
      const hm = t.match(RX.headingNum)
      if (hm && hm[2].length > 2 && /^[A-Z]/.test(hm[2].trim())) title = t
      else {
        const low = t.toLowerCase().replace(/[:.\s\d]+$/g, '').trim()
        if (SECTION_WORDS.some((w) => low === w || low.startsWith(w + ' ')) && (ln.big || /^[A-Z]/.test(t))) title = t
      }
      if (title) {
        const key = title.toLowerCase()
        if (!seen.has(key)) { seen.add(key); secs.push({ title, page: pg.n }) }
      }
    }
  }
  return secs
}
export function detectTitleAuthors(lines) {
  // lines of page 1 with sizes; title = largest line(s), authors = next non-affiliation lines
  const ls = (lines || []).filter((l) => l.text.trim().length > 3)
  if (!ls.length) return { title: '', authors: [], affiliations: [] }
  const max = Math.max(...ls.map((l) => l.size || 0))
  const titleLines = ls.filter((l) => (l.size || 0) >= max * 0.92 && l.text.trim().length > 8).slice(0, 3)
  const title = titleLines.map((l) => l.text.trim()).join(' ')
  const rest = ls.filter((l) => !titleLines.includes(l)).slice(0, 6)
  const authors = [], affiliations = []
  for (const l of rest) {
    const t = l.text.trim()
    if (!t || /^abstract|^keywords/i.test(t)) break
    const low = t.toLowerCase()
    if (AFFIL_WORDS.some((w) => low.includes(w)) || /@/.test(t)) affiliations.push(t)
    else if (t.split(/\s+/).length <= 8 && /[A-Z][a-z]+/.test(t) && !/[.!?]$/.test(t)) authors.push(t)
    if (authors.length >= 6) break
  }
  return { title, authors: authors.slice(0, 8), affiliations: affiliations.slice(0, 6) }
}
// ---------- extractive summary (term-frequency, labeled LOCAL) ----------
const STOP = new Set('the,a,an,and,or,of,to,in,on,for,with,as,by,at,from,is,are,was,were,be,been,this,that,these,those,it,its,into,over,under,than,then,so,such,no,not,only,also,between,through,during,each,all,any,both,few,more,most,other,some,can,will,just,should,now,have,has,had,do,does,did,but,if,about,up,out,who,which,when,where,how,what,why,because,while,per,via,et,al,fig,table,ie,eg'.split(','))
export function stem(w) {
  w = w.toLowerCase()
  if (w.length < 5) return w
  for (const s of ['ational', 'ization', 'fulness', 'ousness', 'iveness', 'ement', 'ance', 'ence', 'able', 'ible', 'tion', 'sion', 'ness', 'ment', 'ing', 'ied', 'ies', 'ed', 'es', 'ly', 'er', 'or', 's']) {
    if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length)
  }
  return w
}
export function tokens(text) {
  return (String(text || '').toLowerCase().match(/[a-z][a-z\-]{2,}/g) || []).filter((w) => !STOP.has(w))
}
export function summarize(pages, maxSent = 6, maxTerms = 10) {
  const full = pages.map((p) => p.text).join('\n')
  const freq = new Map()
  for (const t of tokens(full)) freq.set(stem(t), (freq.get(stem(t)) || 0) + 1)
  const sents = []
  pages.forEach((p, pi) => {
    for (const m of full.matchAll(/[^.!?]{40,280}[.!?]/g)) {
      void pi
      const s = m[0].trim()
      if (/^(table|figure|fig\.)\s+\d/i.test(s)) continue
      let sc = 0
      for (const t of tokens(s)) sc += freq.get(stem(t)) || 0
      sc = sc / Math.sqrt(s.split(/\s+/).length)
      sents.push({ s, sc })
      if (sents.length > 4000) break
    }
  })
  const top = sents.sort((a, b) => b.sc - a.sc).slice(0, maxSent).map((x) => x.s)
  const terms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTerms).map((x) => x[0])
  return { top, terms, stats: { pages: pages.length, words: tokens(full).length } }
}
// ---------- smart search: related terms from local index ----------
const SYN = {
  payment: ['billing', 'invoice', 'remuneration', 'settlement', 'disbursement'],
  problems: ['issues', 'difficulties', 'challenges', 'delays', 'defects'],
  delay: ['late', 'overdue', 'postpone', 'lag'],
  financial: ['fiscal', 'monetary', 'economic', 'budget'],
  audit: ['review', 'inspection', 'examination', 'assessment'],
  report: ['statement', 'document', 'account'],
  risk: ['threat', 'hazard', 'exposure', 'vulnerability'],
  management: ['administration', 'governance', 'oversight'],
  quality: ['standard', 'grade', 'caliber'],
  cost: ['expense', 'price', 'expenditure', 'budget'],
}
export function buildIndex(fullText) {
  const set = new Set(tokens(fullText).map(stem))
  return set
}
export function relatedTerms(query, indexSet) {
  const out = []
  for (const q of tokens(query)) {
    const s = stem(q)
    const cands = new Set([q, ...(SYN[q] || []), ...(SYN[s] || [])])
    for (const c of cands) {
      if (c !== q && (indexSet.has(c) || indexSet.has(stem(c)))) out.push(c)
    }
    // morphological variants present in doc
    for (const w of indexSet) {
      if (w !== s && w.length > 4 && (w.startsWith(s.slice(0, 5)) || s.startsWith(w.slice(0, 5))) && out.length < 12 && !out.includes(w)) out.push(w)
    }
  }
  return out.slice(0, 10)
}
// ---------- table grid from positioned items ----------
// items: [{str, x, y, h}] (overlay coords). Groups rows by y, columns by x-gaps.
export function tableFromItems(items, yTol = 4) {
  const rows = []
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
  for (const it of sorted) {
    const cy = it.y + (it.h || 10) / 2
    let row = rows.find((r) => Math.abs(r.y - cy) <= yTol)
    if (!row) { row = { y: cy, cells: [] }; rows.push(row) }
    row.cells.push(it)
    row.y = (row.y + cy) / 2
  }
  rows.forEach((r) => r.cells.sort((a, b) => a.x - b.x))
  // column split: uniform gaps => every cell is its own column; mixed gaps => split at large gaps
  const gaps = []
  rows.forEach((r) => { for (let i = 1; i < r.cells.length; i++) gaps.push(r.cells[i].x - (r.cells[i - 1].x + (r.cells[i - 1].w || 40))) })
  gaps.sort((a, b) => a - b)
  let splitAt = 14
  if (gaps.length) {
    splitAt = (gaps[gaps.length - 1] - gaps[0] <= 10) ? -Infinity : gaps[Math.floor(gaps.length / 2)]
  }
  const grid = rows.map((r) => {
    const out = []
    let cur = ''
    r.cells.forEach((c, i) => {
      if (i > 0) {
        const gap = c.x - (r.cells[i - 1].x + (r.cells[i - 1].w || 40))
        if (gap > Math.max(splitAt, 12)) { out.push(cur.trim()); cur = '' }
        else cur += ' '
      }
      cur += c.str
    })
    out.push(cur.trim())
    return out
  })
  const cols = Math.max(...grid.map((g) => g.length))
  const looksTable = grid.length >= 2 && cols >= 2
  return { rows: grid.length, cols, grid, looksTable }
}
export function gridToCsv(grid) {
  return grid.map((r) => r.map((c) => /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',')).join('\n')
}
export function gridToJson(grid, headers) {
  const h = headers && headers.length ? headers : grid[0] || []
  return grid.slice(headers ? 0 : 1).map((r) => Object.fromEntries(h.map((k, i) => [k || `col${i + 1}`, r[i] || ''])))
}
// ---------- health / duplicates / blanks ----------
export function normHash(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)
}
export function healthScore(f) {
  // f: {blanks, rotated, sizes, missingMeta, brokenLinks, bigImages, dups, noText, scanned, odd}
  let score = 100
  const items = []
  const bad = (pts, label, kind) => { score -= pts; items.push({ kind, label }) }
  if (f.blanks) bad(Math.min(20, f.blanks * 5), `${f.blanks} blank page${f.blanks > 1 ? 's' : ''}`, 'warn')
  if (f.rotated) bad(Math.min(10, f.rotated * 3), `${f.rotated} rotated page${f.rotated > 1 ? 's' : ''}`, 'warn')
  if (f.sizes) bad(8, 'Inconsistent page sizes', 'warn')
  if (f.missingMeta) bad(6, 'Metadata incomplete (title/author)', 'warn')
  if (f.brokenLinks) bad(8, `${f.brokenLinks} broken link${f.brokenLinks > 1 ? 's' : ''}`, 'bad')
  if (f.bigImages) bad(8, `${f.bigImages} very large image${f.bigImages > 1 ? 's' : ''}`, 'warn')
  if (f.dups) bad(Math.min(15, f.dups * 5), `${f.dups} duplicate page${f.dups > 1 ? 's' : ''}`, 'warn')
  if (f.noText) bad(12, 'No extractable text layer', 'bad')
  if (f.scanned) bad(Math.min(15, f.scanned * 3), `${f.scanned} scanned-image page${f.scanned > 1 ? 's' : ''}`, 'warn')
  if (!f.blanks && !f.dups) items.push({ kind: 'ok', label: 'Page structure' })
  if (!f.bigImages && !f.scanned) items.push({ kind: 'ok', label: 'Images' })
  return { score: Math.max(0, score), items }
}
// ---------- privacy patterns ----------
export function privacyScan(text) {
  const t = String(text || '')
  const out = []
  const push = (kind, vals) => vals.forEach((v) => { if (v) out.push({ kind, value: String(v).slice(0, 80) }) })
  push('email', uniq(t.match(RX.email) || []))
  push('phone', extractPhones(t))
  push('url', uniq(t.match(RX.url) || []).slice(0, 100))
  push('date', uniq(t.match(RX.date) || []).slice(0, 100))
  push('id-like', uniq(t.match(RX.longDigits) || []).slice(0, 100))
  // address-ish: number + street keyword
  const addr = t.match(/\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Close|Estate|Plaza|Way)\b/g) || []
  push('address?', uniq(addr).slice(0, 50))
  return out
}
// ---------- natural-language command parser (deterministic, local) ----------
export function parseCommand(input, pageCount) {
  const raw = String(input || '').trim()
  const s = ' ' + raw.toLowerCase().trim() + ' '
  const num = (m) => (m ? parseInt(m[1]) : null)
  const clamp = (n) => Math.max(1, Math.min(pageCount || 1, n))
  let m
  if (/remove blank pages|delete blank pages/.test(s)) return { action: 'removeBlanks', params: {}, summary: 'Remove all blank pages' }
  if (/delete (the )?last pages?/.test(s)) return { action: 'deletePages', params: { pages: [pageCount] }, summary: `Delete page ${pageCount} (last page)` }
  if (/delete (the )?first pages?/.test(s)) return { action: 'deletePages', params: { pages: [1] }, summary: 'Delete page 1 (first page)' }
  if ((m = s.match(/delete pages? (\d+)\s*(to|-|through)\s*(\d+)/))) {
    const a = clamp(+m[1]), b = clamp(+m[3])
    const [x, y] = a <= b ? [a, b] : [b, a]
    const pages = []
    for (let i = x; i <= y; i++) pages.push(i)
    return { action: 'deletePages', params: { pages }, summary: `Delete pages ${x}–${y} (${pages.length} pages)` }
  }
  if ((m = s.match(/delete pages? ([\d,\s\-]+)/))) {
    const pages = parseList(m[1], pageCount)
    if (pages.length) return { action: 'deletePages', params: { pages }, summary: `Delete page${pages.length > 1 ? 's' : ''} ${pages.join(', ')}` }
  }
  if ((m = s.match(/rotate pages? (\d+)(.*)/))) {
    const p = clamp(+m[1])
    const dir = /counter|left|ccw|-90/.test(m[2]) ? -90 : 90
    return { action: 'rotatePage', params: { page: p, dir }, summary: `Rotate page ${p} ${dir > 0 ? '+90°' : '−90°'}` }
  }
  if (/add page numbers|number (the )?pages|paginate/.test(s)) return { action: 'pageNumbers', params: {}, summary: 'Add "Page n of total" footers to every page' }
  if ((m = s.match(/find all occurrences of (.+)/)) || (m = s.match(/find (.+)/))) {
    const q = m[1].trim()
    if (q) return { action: 'findAll', params: { q }, summary: `Find all occurrences of "${q}"` }
  }
  if ((m = s.match(/replace (.+?) with (.+)/))) {
    const f = m[1].trim(), r = m[2].trim()
    if (f && r) return { action: 'replaceText', params: { find: f, repl: r }, summary: `Replace "${f}" with "${r}" in added text (native PDF words: erase + retype)` }
  }
  if ((m = s.match(/add (a )?blank pages? after pages? (\d+)/)) || (m = s.match(/add (a )?blank pages?$/))) {
    const after = m[2] ? clamp(+m[2]) : (pageCount || 1)
    return { action: 'addBlank', params: { after }, summary: `Add a blank page after page ${after}` }
  }
  if ((m = s.match(/extract pages? (.+)/))) {
    const pages = parseList(m[1].replace(/to/g, '-'), pageCount)
    if (pages.length) return { action: 'extractPages', params: { pages }, summary: `Extract page${pages.length > 1 ? 's' : ''} ${pages.join(', ')} to a new PDF` }
  }
  if (/merge/.test(s)) return { action: 'openMerge', params: {}, summary: 'Open the Merge PDFs workflow' }
  if (/compress/.test(s)) return { action: 'compress', params: {}, summary: 'Open Compress PDF (choose quality)' }
  if (/watermark/.test(s)) return { action: 'watermark', params: {}, summary: 'Open Batch Watermark' }
  if (/add (a )?header/.test(s)) return { action: 'header', params: {}, summary: 'Add a header to the document' }
  if (/add (a )?footer/.test(s)) return { action: 'footer', params: {}, summary: 'Add a footer to the document' }
  if (/table of contents|^toc/.test(s)) return { action: 'toc', params: {}, summary: 'Generate + insert a table of contents page' }
  if (/summar/.test(s)) return { action: 'summary', params: {}, summary: 'Show the local document summary' }
  if (/health/.test(s)) return { action: 'health', params: {}, summary: 'Run the PDF health check' }
  if (/privacy|personal data|sensitive/.test(s)) return { action: 'privacy', params: {}, summary: 'Run the privacy scanner' }
  if (/clean/.test(s)) return { action: 'clean', params: {}, summary: 'Open one-click cleanup' }
  if (/ocr|scanned|recognize/.test(s)) return { action: 'ocr', params: {}, summary: 'Run OCR on a page' }
  if (/compare/.test(s)) return { action: 'compare', params: {}, summary: 'Open PDF comparison' }
  return { action: 'unknown', params: { raw }, summary: '', hint: suggestHint(s) }
}
function parseList(part, max) {
  const out = new Set()
  for (const p of String(part).split(',')) {
    const t = p.trim()
    const m = t.match(/(\d+)\s*[-\s]\s*(\d+)/)
    if (m) { const a = +m[1], b = +m[2]; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= max) out.add(i) }
    else { const n = parseInt(t); if (n >= 1 && n <= max) out.add(n) }
  }
  return [...out].sort((a, b) => a - b)
}
function suggestHint(s) {
  const keys = ['delete', 'rotate', 'page numbers', 'find', 'replace', 'blank', 'extract', 'merge', 'compress', 'watermark', 'header', 'footer', 'summary', 'health', 'privacy', 'clean', 'ocr', 'compare', 'contents']
  const hits = keys.filter((k) => s.includes(k.split(' ')[0]))
  return hits.length ? `Did you mean something with: ${hits.slice(0, 3).join(', ')}?` : 'Try "delete pages 2-4", "rotate page 5", "add page numbers", "find 2025".'
}
