# Update Channel — PDF Direct Editor by Otim Noah (GitHub Releases)

Installed PCs prompt the user to update whenever you publish. No server to maintain.

## How it works
1. App launches → fetches `version.json` through GitHub's stable latest-release URL:
   `https://github.com/noahotim/pdf-direct-editor/releases/latest/download/version.json`
2. If `version` there is newer than installed → green banner:
   **"Update available: vX.Y — Download Update"** (+ Help → Check for Updates)
3. User clicks Download → Setup.exe → run it → NSIS upgrades in place. Files untouched.
4. "Later" snoozes until the next version.

No silent auto-install (needs code-signing infrastructure); prompt-and-install
is reliable with the NSIS packaging.

## One-time setup (2 commands)
```powershell
winget install -e --id GitHub.cli
gh auth login
```
(The publish script creates the `noahotim/pdf-direct-editor` repo itself if missing.)

## Publish an update
```powershell
cd "C:\Users\GEMTECH 1\Documents\Default Project\pdf-direct-editor\deploy"
.\publish-update.ps1 -Notes "What changed in this version"
```
Auto-bumps patch (1.1.0 → 1.1.1), syncs version everywhere, rebuilds
web + desktop + Setup.exe + zip, creates GitHub release `vX.Y.Z` with
Setup.exe + zip + version.json attached.

Options: `-Version "1.2.0"` (explicit), `-SkipBuild` (release current build
as-is — version.json is still regenerated and uploaded).

## Change hosts later
Point `UPDATE_JSON_URL` in `src/pro-update.js` at any HTTPS URL serving
`version.json`, rebuild, publish.
