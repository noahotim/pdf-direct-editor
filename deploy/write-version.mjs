// Writes deploy/version.json for the release. Runs on CI after build.
// Version is read from package.json (already bumped by publish-fast.ps1).
import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const version = pkg.version || '1.0.0'
const repo = process.env.GITHUB_REPOSITORY || 'noahotim/pdf-direct-editor'
const setup = `BOTIM-PDF-EDITOR-Setup-${version}.exe`
const zip = `BOTIM-PDF-EDITOR-Portable-${version}.zip`
const base = `https://github.com/${repo}/releases/download/v${version}`

const info = {
  version,
  name: 'BOTIM PDF EDITOR by Otim Noah',
  url: `${base}/${setup}`,
  zip: `${base}/${zip}`,
  released: new Date().toISOString().slice(0, 10),
  minVersion: '1.0.0',
  notes: process.env.NOTES || '',
}
fs.writeFileSync('deploy/version.json', JSON.stringify(info, null, 2))
console.log('version.json written for', version)
