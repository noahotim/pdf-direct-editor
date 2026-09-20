; BOTIM DOCSHUB by Otim Noah - Installer (per-user, seamless updates)
; Per-user install => no admin prompt => updates can install silently & relaunch.
!define PRODUCT_NAME "BOTIM DOCSHUB"
!define PRODUCT_VERSION "2.1.1"
!define PRODUCT_PUBLISHER "Otim Noah"
!define PRODUCT_WEB_SITE "https://github.com/noahotim/pdf-direct-editor"
!define PRODUCT_EXE "BOTIM-DOCSHUB.exe"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\${PRODUCT_EXE}"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

SetCompressor zlib
RequestExecutionLevel user

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "release\BOTIM-DOCSHUB-Setup-2.1.1.exe"
InstallDir "$LOCALAPPDATA\Programs\BOTIM DOCSHUB"
InstallDirRegKey HKCU "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show

VIProductVersion "2.1.1.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "Otim Noah"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Otim Noah — BOTIM DOCSHUB"
VIAddVersionKey "FileDescription" "BOTIM DOCSHUB by Otim Noah - PDF, Word, PowerPoint Editor, Converter & AI"
VIAddVersionKey "FileVersion" "2.1.1"
VIAddVersionKey "ProductVersion" "2.1.1"

Icon "public\icon.ico"

; Silent-update helper: when run with /S the app is closed first by the updater,
; but wait briefly to be safe against file locks.
!macro WaitForUnlock
  Sleep 1500
!macroend

Section "MainSection" SEC01
  !insertmacro WaitForUnlock
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File /r "release\BOTIM-DOCSHUB-win32-x64\*.*"
  CreateDirectory "$SMPROGRAMS\BOTIM DOCSHUB"
  CreateShortCut "$SMPROGRAMS\BOTIM DOCSHUB\BOTIM DOCSHUB.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0
  CreateShortCut "$DESKTOP\BOTIM DOCSHUB.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0
SectionEnd

Section -AdditionalIcons
  WriteIniStr "$INSTDIR\${PRODUCT_NAME}.url" "InternetShortcut" "URL" "${PRODUCT_WEB_SITE}"
  CreateShortCut "$SMPROGRAMS\BOTIM DOCSHUB\Website.lnk" "$INSTDIR\${PRODUCT_NAME}.url"
  CreateShortCut "$SMPROGRAMS\BOTIM DOCSHUB\Uninstall.lnk" "$INSTDIR\uninst.exe"
SectionEnd

Section -Post
  WriteUninstaller "$INSTDIR\uninst.exe"
  WriteRegStr HKCU "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\${PRODUCT_EXE}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayName" "$(^Name)"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\${PRODUCT_EXE}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  ; file associations — so double-clicking a document opens with BOTIM DOCSHUB (per-user, no admin)
  WriteRegStr HKCU "Software\Classes\.pdf" "" "BOTIM_DOCSHUB.pdf"
  WriteRegStr HKCU "Software\Classes\.docx" "" "BOTIM_DOCSHUB.docx"
  WriteRegStr HKCU "Software\Classes\.pptx" "" "BOTIM_DOCSHUB.pptx"
  WriteRegStr HKCU "Software\Classes\.txt" "" "BOTIM_DOCSHUB.txt"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.pdf" "" "BOTIM DOCSHUB Document"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.pdf\DefaultIcon" "" "$INSTDIR\${PRODUCT_EXE},0"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.pdf\shell\open\command" "" '"$INSTDIR\${PRODUCT_EXE}" "%1"'
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.docx" "" "BOTIM DOCSHUB Document"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.docx\DefaultIcon" "" "$INSTDIR\${PRODUCT_EXE},0"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.docx\shell\open\command" "" '"$INSTDIR\${PRODUCT_EXE}" "%1"'
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.pptx" "" "BOTIM DOCSHUB Presentation"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.pptx\DefaultIcon" "" "$INSTDIR\${PRODUCT_EXE},0"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.pptx\shell\open\command" "" '"$INSTDIR\${PRODUCT_EXE}" "%1"'
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.txt" "" "BOTIM DOCSHUB Text"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.txt\DefaultIcon" "" "$INSTDIR\${PRODUCT_EXE},0"
  WriteRegStr HKCU "Software\Classes\BOTIM_DOCSHUB.txt\shell\open\command" "" '"$INSTDIR\${PRODUCT_EXE}" "%1"'
  System::Call 'SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ; relaunch the app so an update applies seamlessly (no manual step)
  Exec '"$INSTDIR\${PRODUCT_EXE}"'
SectionEnd

Section Uninstall
  Delete "$INSTDIR\uninst.exe"
  Delete "$INSTDIR\${PRODUCT_NAME}.url"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\BOTIM DOCSHUB\Uninstall.lnk"
  Delete "$SMPROGRAMS\BOTIM DOCSHUB\Website.lnk"
  Delete "$DESKTOP\BOTIM DOCSHUB.lnk"
  Delete "$SMPROGRAMS\BOTIM DOCSHUB\BOTIM DOCSHUB.lnk"
  RMDir "$SMPROGRAMS\BOTIM DOCSHUB"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.pdf"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.pdf\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.pdf\shell"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.docx"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.docx\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.docx\shell"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.pptx"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.pptx\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.pptx\shell"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.txt"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.txt\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\BOTIM_DOCSHUB.txt\shell"
  ; remove file associations only if they still point to BOTIM
  ReadRegStr $0 HKCU "Software\Classes\.pdf" ""
  StrCmp $0 "BOTIM_DOCSHUB.pdf" 0 +2
    DeleteRegKey HKCU "Software\Classes\.pdf"
  ReadRegStr $0 HKCU "Software\Classes\.docx" ""
  StrCmp $0 "BOTIM_DOCSHUB.docx" 0 +2
    DeleteRegKey HKCU "Software\Classes\.docx"
  ReadRegStr $0 HKCU "Software\Classes\.pptx" ""
  StrCmp $0 "BOTIM_DOCSHUB.pptx" 0 +2
    DeleteRegKey HKCU "Software\Classes\.pptx"
  ReadRegStr $0 HKCU "Software\Classes\.txt" ""
  StrCmp $0 "BOTIM_DOCSHUB.txt" 0 +2
    DeleteRegKey HKCU "Software\Classes\.txt"
  System::Call 'SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  DeleteRegKey HKCU "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKCU "${PRODUCT_DIR_REGKEY}"
  SetAutoClose true
SectionEnd
