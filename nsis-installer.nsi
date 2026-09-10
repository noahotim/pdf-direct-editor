; BOTIM PDF EDITOR by Otim Noah - Installer
!define PRODUCT_NAME "BOTIM PDF EDITOR"
!define PRODUCT_VERSION "1.2.0"
!define PRODUCT_PUBLISHER "Otim Noah"
!define PRODUCT_WEB_SITE "https://github.com/noahotim/pdf-direct-editor"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\BOTIM-PDF-EDITOR.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

SetCompressor zlib
RequestExecutionLevel admin

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "release\BOTIM-PDF-EDITOR-Setup-1.2.0.exe"
InstallDir "$PROGRAMFILES\BOTIM PDF EDITOR"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show

VIProductVersion "1.2.0.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "Otim Noah"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Otim Noah — BOTIM PDF EDITOR"
VIAddVersionKey "FileDescription" "BOTIM PDF EDITOR by Otim Noah - Direct PDF editing without Word conversion"
VIAddVersionKey "FileVersion" "1.2.0"
VIAddVersionKey "ProductVersion" "1.2.0"

Icon "public\icon.ico"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite try
  File /r "release\BOTIM-PDF-EDITOR-win32-x64\*.*"
  CreateDirectory "$SMPROGRAMS\BOTIM PDF EDITOR"
  CreateShortCut "$SMPROGRAMS\BOTIM PDF EDITOR\BOTIM PDF EDITOR.lnk" "$INSTDIR\BOTIM-PDF-EDITOR.exe" "" "$INSTDIR\BOTIM-PDF-EDITOR.exe" 0
  CreateShortCut "$DESKTOP\BOTIM PDF EDITOR.lnk" "$INSTDIR\BOTIM-PDF-EDITOR.exe" "" "$INSTDIR\BOTIM-PDF-EDITOR.exe" 0
SectionEnd

Section -AdditionalIcons
  WriteIniStr "$INSTDIR\${PRODUCT_NAME}.url" "InternetShortcut" "URL" "${PRODUCT_WEB_SITE}"
  CreateShortCut "$SMPROGRAMS\BOTIM PDF EDITOR\Website.lnk" "$INSTDIR\${PRODUCT_NAME}.url"
  CreateShortCut "$SMPROGRAMS\BOTIM PDF EDITOR\Uninstall.lnk" "$INSTDIR\uninst.exe"
SectionEnd

Section -Post
  WriteUninstaller "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\PDF-Direct-Editor.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "$(^Name)"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\PDF-Direct-Editor.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
SectionEnd

Section Uninstall
  Delete "$INSTDIR\uninst.exe"
  Delete "$INSTDIR\${PRODUCT_NAME}.url"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\BOTIM PDF EDITOR\Uninstall.lnk"
  Delete "$SMPROGRAMS\BOTIM PDF EDITOR\Website.lnk"
  Delete "$DESKTOP\BOTIM PDF EDITOR.lnk"
  Delete "$SMPROGRAMS\BOTIM PDF EDITOR\BOTIM PDF EDITOR.lnk"
  RMDir "$SMPROGRAMS\BOTIM PDF EDITOR"
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  SetAutoClose true
SectionEnd

