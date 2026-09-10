@echo off
REM BOTIM DOCSHUB - Double click to launch (by Otim Noah)
REM Works without install
if exist "release\BOTIM-DOCSHUB-win32-x64\BOTIM-DOCSHUB.exe" (
  start "" "release\BOTIM-DOCSHUB-win32-x64\BOTIM-DOCSHUB.exe"
) else if exist "release\BOTIM-DOCSHUB-win32-x64\PDF-Direct-Editor.exe" (
  start "" "release\BOTIM-DOCSHUB-win32-x64\PDF-Direct-Editor.exe"
) else (
  echo Portable exe not found, launching web version...
  npx vite preview --port 5173 --open
)
