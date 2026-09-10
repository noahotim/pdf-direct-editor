@echo off
REM PDF Direct Editor - Double click to launch
REM Works without install
if exist "release\PDF-Direct-Editor-win32-x64\PDF-Direct-Editor.exe" (
  start "" "release\PDF-Direct-Editor-win32-x64\PDF-Direct-Editor.exe"
) else (
  echo Portable exe not found, launching web version...
  npx vite preview --port 5173 --open
)
