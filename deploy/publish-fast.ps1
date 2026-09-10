# PDF Direct Editor — FAST publish via GitHub Actions.
#
# You ONLY push small source code (few hundred KB). GitHub builds the 136 MB
# installer + portable zip on ITS fast servers and publishes the release.
# No more slow uploads from this PC.
#
# Usage:
#   .\publish-fast.ps1 -Notes "Fixed X"
#   .\publish-fast.ps1 -Version "1.2.0" -Notes "..."   (explicit version)
#
# Prereqs (once):  winget install -e --id GitHub.cli ; gh auth login ; gh auth setup-git

param(
  [string]$Version = "",
  [string]$Notes = "",
  [string]$Branch = "main"
)
$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
function Write-Utf8NoBom([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText((Join-Path $ProjectDir $Path), $Text, $Utf8NoBom)
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "Install GitHub CLI first: winget install -e --id GitHub.cli" }
gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Not logged in. Run: gh auth login  then  gh auth setup-git" }

# --- bump version ---
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
if (-not $Version) {
  $parts = $pkg.version.Split('.')
  $parts[2] = [string]([int]$parts[2] + 1)
  $Version = $parts -join '.'
}
Write-Host "Version: $Version  (notes: $Notes)"
$pkg.version = $Version
Write-Utf8NoBom "package.json" ($pkg | ConvertTo-Json -Depth 10)
Write-Utf8NoBom "src/pro-update.js" ((Get-Content "src/pro-update.js" -Raw) -replace "export const APP_VERSION = '[^']+'", "export const APP_VERSION = '$Version'")
Write-Utf8NoBom "src/pro-shell.js" ((Get-Content "src/pro-shell.js" -Raw) -replace "PDF Direct Editor v\d+\.\d+\.\d+", "PDF Direct Editor v$Version")

$nsi = Get-Content "nsis-installer.nsi" -Raw
$nsi = $nsi -replace '!define PRODUCT_VERSION "[^"]+"', "!define PRODUCT_VERSION `"$Version`""
$nsi = $nsi -replace 'PDF-Direct-Editor-Setup-by-Otim-Noah-[\d\.]+exe', "PDF-Direct-Editor-Setup-by-Otim-Noah-$Version.exe"
$vv = (($Version + ".0").Split('.')[0..3] -join '.')
$nsi = $nsi -replace 'VIProductVersion "[^"]*"', "VIProductVersion `"$vv`""
$nsi = $nsi -replace 'VIAddVersionKey "FileVersion" "[^"]+"', "VIAddVersionKey `"FileVersion`" `"$Version`""
$nsi = $nsi -replace 'VIAddVersionKey "ProductVersion" "[^"]+"', "VIAddVersionKey `"ProductVersion`" `"$Version`""
Write-Utf8NoBom "nsis-installer.nsi" $nsi

# --- commit + tag + push (small source only) ---
$Tag = "v$Version"
$CommitMsg = if ($Notes) { $Notes } else { "release v$Version" }
git add -A
git commit -m $CommitMsg --allow-empty 2>&1 | Select-Object -Last 2
git tag -f $Tag
git push -u origin $Branch 2>&1 | Select-Object -Last 3
git push origin $Tag -f 2>&1 | Select-Object -Last 3

Write-Host "== Pushed v$Version to GitHub ==" -ForegroundColor Green
Write-Host "GitHub Actions is now building the installer + zip and publishing the release (fast servers)."
Write-Host "Track it: gh run list --repo noahotim/pdf-direct-editor --watch"
Write-Host "Installed PCs will prompt to update once the release is live (~5-8 min)."
