; PDF Direct Editor by Otim Noah - Installer
!define PRODUCT_NAME "PDF Direct Editor by Otim Noah"
!define PRODUCT_VERSION "1.1.0"
!define PRODUCT_PUBLISHER "Otim Noah"
!define PRODUCT_WEB_SITE "https://github.com/otimnoah/pdf-direct-editor"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\PDF-Direct-Editor.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

SetCompressor zlib
RequestExecutionLevel admin

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "release\PDF-Direct-Editor-Setup-by-Otim-Noah-1.1.0.exe"
InstallDir "$PROGRAMFILES\PDF Direct Editor by Otim Noah"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show

VIProductVersion "1.1.0.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "Otim Noah"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Otim Noah"
VIAddVersionKey "FileDescription" "PDF Direct Editor - Direct PDF editing without Word conversion"
VIAddVersionKey "FileVersion" "1.1.0"
VIAddVersionKey "ProductVersion" "1.1.0"

Icon "public\icon.ico"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite try
  File /r "release\PDF-Direct-Editor-win32-x64\*.*"
  CreateDirectory "$SMPROGRAMS\PDF Direct Editor by Otim Noah"
  CreateShortCut "$SMPROGRAMS\PDF Direct Editor by Otim Noah\PDF Direct Editor.lnk" "$INSTDIR\PDF-Direct-Editor.exe" "" "$INSTDIR\PDF-Direct-Editor.exe" 0
  CreateShortCut "$DESKTOP\PDF Direct Editor by Otim Noah.lnk" "$INSTDIR\PDF-Direct-Editor.exe" "" "$INSTDIR\PDF-Direct-Editor.exe" 0
SectionEnd

Section -AdditionalIcons
  WriteIniStr "$INSTDIR\${PRODUCT_NAME}.url" "InternetShortcut" "URL" "${PRODUCT_WEB_SITE}"
  CreateShortCut "$SMPROGRAMS\PDF Direct Editor by Otim Noah\Website.lnk" "$INSTDIR\${PRODUCT_NAME}.url"
  CreateShortCut "$SMPROGRAMS\PDF Direct Editor by Otim Noah\Uninstall.lnk" "$INSTDIR\uninst.exe"
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
  Delete "$SMPROGRAMS\PDF Direct Editor by Otim Noah\Uninstall.lnk"
  Delete "$SMPROGRAMS\PDF Direct Editor by Otim Noah\Website.lnk"
  Delete "$DESKTOP\PDF Direct Editor by Otim Noah.lnk"
  Delete "$SMPROGRAMS\PDF Direct Editor by Otim Noah\PDF Direct Editor.lnk"
  RMDir "$SMPROGRAMS\PDF Direct Editor by Otim Noah"
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  SetAutoClose true
SectionEnd

