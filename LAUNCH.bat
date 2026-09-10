@echo off
REM BOTIM PDF EDITOR - Double click to launch (by Otim Noah)
REM Works without install
if exist "release\BOTIM-PDF-EDITOR-win32-x64\BOTIM-PDF-EDITOR.exe" (
  start "" "release\BOTIM-PDF-EDITOR-win32-x64\BOTIM-PDF-EDITOR.exe"
) else if exist "release\PDF-Direct-Editor-win32-x64\PDF-Direct-Editor.exe" (
  start "" "release\PDF-Direct-Editor-win32-x64\PDF-Direct-Editor.exe"
) else (
  echo Portable exe not found, launching web version...
  npx vite preview --port 5173 --open
)
