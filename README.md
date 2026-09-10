# BOTIM DOCSHUB — Web + Desktop (No Word Conversion)

Edits **text, images, annotations, highlights, drawings, signatures, form fields** directly in PDF and saves as **PDF**.

## Run on this PC (Web)
```powershell
cd "pdf-direct-editor"
npm run dev
# open http://localhost:5173
```

## Build for production (static web — copy to any PC/server)
```powershell
npm run build
# output in dist/ — just open dist/index.html or serve with any static server
# copy dist/ folder to another PC/USB and open index.html — works offline (pdf-lib is bundled)
```

## Install as App (PWA) — on any PC
1. Run `npm run preview` or serve `dist/` via `npx serve dist`
2. Open in Chrome/Edge → address bar shows Install icon → click **Install**
3. Now runs like desktop app, offline, from Start Menu

## Desktop .exe Installer (Electron) — for another PC
```powershell
npm run dist
# creates release/BOTIM DOCSHUB Setup.exe  (installer)
# and release/PDF-Direct-Editor-Portable.exe (no install, just double-click)
```
Copy the `.exe` to any Windows PC and install/run. No Word needed.

Files generated:
- `release/BOTIM DOCSHUB Setup 1.0.0.exe` — installer (creates Start Menu shortcut)
- `release/PDF-Direct-Editor-Portable.exe` — portable, run from USB

## Usage
1. Click **Open PDF** or drag-drop PDF
2. Tools:
   - **Text**: click + Add Text Box → double-click to edit → drag to move
   - **Image**: + Add Image → drag/resize handle
   - **Highlight**: select highlight tool → click on page
   - **Draw**: select Draw → draw freehand (color picker)
   - **Note**: stamp tool → click → prompt
   - **Signature**: draw in Signature Pad → Add to PDF → drag/resize
   - **Form**: fields auto-detected in left panel → edit value → staged for save
3. **Save as PDF** → downloads `edited-direct.pdf` — opens in any PDF reader, never converted to Word

## Stack
- `pdfjs-dist` for rendering, `pdf-lib` for saving (no Word step), Vite, Electron, PWA
