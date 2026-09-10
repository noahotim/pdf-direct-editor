# BOTIM DOCSHUB — publish an update to all installed PCs (via GitHub Releases).
#
# One-time setup (run once):
#   winget install -e --id GitHub.cli
#   gh auth login
#
# Publish an update:
#   .\publish-update.ps1 -Notes "Fixed X, added Y"
#   .\publish-update.ps1 -Version "1.2.0" -Notes "..."   (explicit version instead of auto patch-bump)
#
# What it does:
#  1. Bumps version in package.json + src/pro-update.js + nsis-installer.nsi + About text
#  2. Rebuilds web (vite), desktop (electron-packager), installer (NSIS), portable zip
#  3. Creates repo noahotim/pdf-direct-editor if missing
#  4. Creates GitHub release vX.Y.Z with Setup.exe + zip + version.json attached
# Installed apps fetch version.json through the stable "latest" URL on launch
# and prompt the user to update. No server to maintain.

param(
  [string]$Version = "",
  [string]$Notes = "",
  [string]$Repo = "noahotim/pdf-direct-editor",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir
Write-Host "== BOTIM DOCSHUB publisher (GitHub) ==" -ForegroundColor Cyan

# Write UTF-8 WITHOUT BOM (BOM breaks package.json for vite, and strict JSON parsers)
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
function Write-Utf8NoBom([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText((Join-Path $ProjectDir $Path), $Text, $Utf8NoBom)
}

# --- 0. gh CLI + auth ---
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Installing GitHub CLI..." -ForegroundColor Yellow
  winget install -e --id GitHub.cli --silent --accept-package-agreements --accept-source-agreements
}
gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Not logged in. Run 'gh auth login' once, then re-run this script." }
try { gh repo view $Repo 2>&1 | Out-Null } catch { }
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating repo $Repo..." -ForegroundColor Yellow
  gh repo create $Repo --public --description "BOTIM DOCSHUB by Otim Noah - direct PDF editing without Word conversion"
}

# --- 1. version ---
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
if (-not $Version) {
  $parts = $pkg.version.Split('.')
  $parts[2] = [string]([int]$parts[2] + 1)
  $Version = $parts -join '.'
}
Write-Host "Publishing version $Version"
$pkg.version = $Version
Write-Utf8NoBom "package.json" ($pkg | ConvertTo-Json -Depth 10)

Write-Utf8NoBom "src/pro-update.js" ((Get-Content "src/pro-update.js" -Raw) -replace "export const APP_VERSION = '[^']+'", "export const APP_VERSION = '$Version'")
Write-Utf8NoBom "src/pro-shell.js" ((Get-Content "src/pro-shell.js" -Raw) -replace "BOTIM DOCSHUB v\d+\.\d+\.\d+", "BOTIM DOCSHUB v$Version")
  $nsi = Get-Content "nsis-installer.nsi" -Raw
  $nsi = $nsi -replace '!define PRODUCT_VERSION "[^"]+"', "!define PRODUCT_VERSION `"$Version`""
  $nsi = $nsi -replace 'BOTIM-DOCSHUB-Setup-[\d\.]+exe', "BOTIM-DOCSHUB-Setup-$Version.exe"
  $nsi = $nsi -replace 'PDF-Direct-Editor-Setup-by-Otim-Noah-[\d\.]+exe', "BOTIM-DOCSHUB-Setup-$Version.exe"
$vv = (($Version + ".0").Split('.')[0..3] -join '.')
$nsi = $nsi -replace 'VIProductVersion "[^"]*"', "VIProductVersion `"$vv`""
$nsi = $nsi -replace 'VIAddVersionKey "FileVersion" "[^"]+"', "VIAddVersionKey `"FileVersion`" `"$Version`""
$nsi = $nsi -replace 'VIAddVersionKey "ProductVersion" "[^"]+"', "VIAddVersionKey `"ProductVersion`" `"$Version`""
Write-Utf8NoBom "nsis-installer.nsi" $nsi

  $SetupName = "BOTIM-DOCSHUB-Setup-$Version.exe"
  $Tag = "v$Version"

  # --- 2. build ---
  if (-not $SkipBuild) {
    Write-Host "-- vite build" -ForegroundColor Yellow
    .\node_modules\.bin\vite build 2>&1 | Select-Object -Last 4
    Write-Host "-- electron-packager" -ForegroundColor Yellow
    Get-Process | Where-Object { $_.ProcessName -like "*BOTIM*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process | Where-Object { $_.ProcessName -like "*PDF-Direct*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Remove-Item -Recurse -Force "release\BOTIM-DOCSHUB-win32-x64","release\BOTIM-DOCSHUB-win32-x64" -ErrorAction SilentlyContinue
    .\node_modules\.bin\electron-packager . "BOTIM-PDF-EDITOR" --platform=win32 --arch=x64 --out=release --overwrite --ignore="^/release" --ignore="^/.git" 2>&1 | Select-Object -Last 3
    Write-Host "-- NSIS installer" -ForegroundColor Yellow
    & "C:\Program Files (x86)\NSIS\makensis.exe" "nsis-installer.nsi" 2>&1 | Select-Object -Last 4
    Write-Host "-- portable zip" -ForegroundColor Yellow
    $ZipName = "BOTIM-DOCSHUB-Portable-$Version.zip"
    Remove-Item -Force "release\$ZipName","release\PDF-Direct-Editor-Portable-$Version.zip" -ErrorAction SilentlyContinue
    & "$ProjectDir\node_modules\7zip-bin\win\x64\7za.exe" a -tzip -mx=1 "$ProjectDir\release\$ZipName" "$ProjectDir\release\BOTIM-DOCSHUB-win32-x64\*" 2>&1 | Select-Object -Last 3
    if (-not (Test-Path "release\$SetupName")) { throw "Build failed: release\$SetupName not found" }
  }

  # --- 3. version.json (points at THIS release's permanent asset URLs) ---
  $base = "https://github.com/$Repo/releases/download/$Tag"
  $ZipName = "BOTIM-DOCSHUB-Portable-$Version.zip"
$ver = @{
  version    = $Version
  name       = "BOTIM DOCSHUB by Otim Noah"
  url        = "$base/$SetupName"
  zip        = "$base/$ZipName"
  released   = (Get-Date).ToString("yyyy-MM-dd")
  minVersion = "1.0.0"
  notes      = $Notes
} | ConvertTo-Json
Write-Utf8NoBom "deploy\version.json" $ver
Write-Host $ver

# --- 4. GitHub release ---
Write-Host "-- creating release $Tag" -ForegroundColor Yellow
if ($Notes) { $ReleaseNotes = $Notes } else { $ReleaseNotes = "BOTIM DOCSHUB v$Version" }
gh release create $Tag --repo $Repo --title "v$Version" --notes "$ReleaseNotes" "release\$SetupName" "release\$ZipName" "deploy\version.json"
Write-Host "== Published v$Version ==" -ForegroundColor Green
Write-Host "Check: https://github.com/$Repo/releases/tag/$Tag"
Write-Host "Installed PCs will prompt to update on next launch (Help -> Check for Updates forces it)."
