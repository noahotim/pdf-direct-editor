// pro-formsig: typed/uploaded signatures, date/name fields, form creation + validation + reset
import { E, status, reg, openDialog, pickFiles } from './pro-core.js'

// ---- signature upgrades (annotation-grade; NOT cryptographic — see report) ----
reg('ins-sign-type', async () => {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  const r = await openDialog('Type Signature', [{ key: 'name', label: 'Sign as (typed signature)', value: '' }], 'Place')
  if (!r || !r.name) return
  const pi = e.visiblePageIndex(), ov = e.visibleOverlay()
  e.pushUndo()
  const ed = { id: Date.now() + Math.random(), pageIndex: pi, type: 'text', x: 60, y: 120, w: 220, h: 34, text: r.name, fontSize: 30, color: '#1e3a8a', fontFamily: 'Helvetica', bold: false, italic: true, underline: false, align: 'left', lineSpacing: 1.1 }
  e.edits.push(ed); e.createTextEl(ov, ed)
  status(`Typed signature placed on page ${pi + 1} — drag to position`)
})
reg('ins-sign-upload', async () => {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  const files = await pickFiles('image/*', false)
  if (!files.length) return
  const e2 = E()
  const src = await e2.fileToDataUrl(files[0])
  const probe = new Image(); probe.src = src
  try { await probe.decode() } catch { /* still place */ }
  const iw = probe.naturalWidth || 300, ih = probe.naturalHeight || 120
  const w = Math.min(220, iw / 2), h = w * (ih / iw)
  const pi = e.visiblePageIndex(), ov = e.visibleOverlay()
  e.pushUndo()
  const ed = { id: Date.now() + Math.random(), pageIndex: pi, type: 'image', x: 60, y: 120, w, h: Math.min(h, 160), src }
  e.edits.push(ed); e.createImageEl(ov, ed)
  status(`Signature image placed on page ${pi + 1}`)
})
async function placeField(kind) {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  let text = ''
  if (kind === 'date') text = new Date().toLocaleDateString()
  else {
    const r = await openDialog('Name Field', [{ key: 'name', label: 'Full name', value: '' }], 'Place')
    if (!r || !r.name) return
    text = r.name
  }
  const pi = e.visiblePageIndex(), ov = e.visibleOverlay()
  e.pushUndo()
  const ed = { id: Date.now() + Math.random(), pageIndex: pi, type: 'text', x: 60, y: 160, w: 200, h: 22, text, fontSize: 12, color: '#000000', fontFamily: 'Helvetica' }
  e.edits.push(ed); e.createTextEl(ov, ed)
  status(`${kind === 'date' ? 'Date' : 'Name'} field placed on page ${pi + 1}`)
}

// ---- form creation (real AcroForm widgets via pdf-lib, created on Save) ----
async function createField(field) {
  const e = E()
  if (!e.pdfLibDoc) return status('Open a PDF first')
  const labels = { text: 'Text Field', check: 'Checkbox', drop: 'Dropdown', radio: 'Radio Group' }
  const r = await openDialog(`New ${labels[field]}`, [
    { key: 'name', label: 'Field name (unique)', value: `field_${e.edits.filter((x) => x.type === 'formCreate').length + 1}` },
    ...(field === 'drop' || field === 'radio' ? [{ key: 'options', label: 'Options (comma separated)', value: field === 'drop' ? 'Yes,No,N/A' : 'Yes,No' }] : []),
    { key: 'required', label: 'Required field', type: 'check', value: false }
  ], 'Place')
  if (!r || !r.name) return
  const name = r.name.trim()
  if (e.pdfLibDoc.getForm().getFields().some((f) => { try { return f.getName() === name } catch { return false } }) || e.edits.some((x) => x.type === 'formCreate' && x.name === name)) {
    return status(`Field name "${name}" already exists — pick a unique name`)
  }
  const pi = e.visiblePageIndex(), ov = e.visibleOverlay()
  e.pushUndo()
  const ed = {
    id: Date.now() + Math.random(), pageIndex: pi, type: 'formCreate', field, name,
    x: 60, y: 100, w: field === 'check' ? 24 : 200, h: 24,
    options: r.options ? r.options.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    required: !!r.required
  }
  e.edits.push(ed)
  window.ProRenderEdit(ov, ed)
  status(`${labels[field]} "${name}" staged on page ${pi + 1} — created in PDF on Save`)
}
reg('ins-form-text', () => createField('text'))
reg('ins-form-check', () => createField('check'))
reg('ins-form-drop', () => createField('drop'))
reg('ins-form-radio', () => createField('radio'))

// ---- form panel extras: date/name shortcut, clear staged, reset, validate ----
;(() => {
  const panel = document.getElementById('formPanel')
  if (!panel || document.getElementById('proFormExtras')) return
  const d = document.createElement('div')
  d.id = 'proFormExtras'
  d.innerHTML = `<div style="display:flex;gap:4px;">
      <button id="fxDate" class="btn btn-small" style="flex:1">📅 Date</button>
      <button id="fxName" class="btn btn-small" style="flex:1">👤 Name</button>
    </div>
    <div style="display:flex;gap:4px;">
      <button id="fxClear" class="btn btn-small" style="flex:1">Clear Staged</button>
      <button id="fxReset" class="btn btn-small" style="flex:1">Reset Fields</button>
    </div>
    <button id="fxValidate" class="btn btn-small">✓ Validate Required</button>
    <small style="font-size:10px;color:#94a3b8;">Signatures here are annotations, not cryptographic signatures.</small>`
  panel.appendChild(d)
  document.getElementById('fxDate').onclick = () => placeField('date')
  document.getElementById('fxName').onclick = () => placeField('name')
  document.getElementById('fxClear').onclick = () => {
    const e = E()
    const n = e.edits.filter((x) => x.type === 'form' && x.pageIndex === -1).length
    e.pushUndo()
    e.edits = e.edits.filter((x) => !(x.type === 'form' && x.pageIndex === -1))
    status(n ? `Cleared ${n} staged value${n > 1 ? 's' : ''}` : 'No staged values')
  }
  document.getElementById('fxReset').onclick = async () => {
    const e = E()
    if (!e.pdfLibDoc) return status('Open a PDF first')
    try {
      const form = e.pdfLibDoc.getForm()
      for (const f of form.getFields()) {
        try {
          const t = f.constructor.name
          if (t === 'PDFTextField') form.getTextField(f.getName()).setText('')
          else if (t === 'PDFCheckBox') form.getCheckBox(f.getName()).uncheck()
          else if (t === 'PDFDropdown') { const dd = form.getDropdown(f.getName()); const o = dd.getOptions(); if (o.length) dd.select(o[0]) }
        } catch { /* next */ }
      }
      form.updateFieldAppearances()
      await e.listFormFields()
      status('Form fields reset to defaults (Save to keep)')
    } catch (err) { status('Reset failed: ' + err.message) }
  }
  document.getElementById('fxValidate').onclick = async () => {
    const e = E()
    if (!e.pdfLibDoc) return status('Open a PDF first')
    const missing = []
    try {
      const form = e.pdfLibDoc.getForm()
      for (const f of form.getFields()) {
        let req = false
        try { req = f.isRequired() } catch { req = false }
        if (!req) continue
        try {
          const t = f.constructor.name
          if (t === 'PDFTextField' && !(form.getTextField(f.getName()).getText() || '').trim()) missing.push(f.getName())
          if (t === 'PDFCheckBox' && !form.getCheckBox(f.getName()).isChecked()) missing.push(f.getName())
        } catch { /* next */ }
      }
    } catch { /* ignore */ }
    for (const x of e.edits) {
      if (x.type === 'formCreate' && x.required && !x.value) missing.push(x.name + ' (new)')
      if (x.type === 'form' && x.pageIndex === -1 && x.fieldType === 'PDFTextField' && !String(x.value || '').trim()) {
        try { if (e.pdfLibDoc.getForm().getField(x.name).isRequired()) missing.push(x.name) } catch { /* ignore */ }
      }
    }
    status(missing.length ? `⚠ ${missing.length} required empty: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` : '✓ All required fields have values')
  }
})()
