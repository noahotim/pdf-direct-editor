; BOTIM DOCSHUB by Otim Noah - Installer (PDF â€¢ Word â€¢ PowerPoint)
!define PRODUCT_NAME "BOTIM DOCSHUB"
!define PRODUCT_VERSION "1.3.1"
!define PRODUCT_PUBLISHER "Otim Noah"
!define PRODUCT_WEB_SITE "https://github.com/noahotim/pdf-direct-editor"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\BOTIM-DOCSHUB.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

SetCompressor zlib
RequestExecutionLevel admin

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "release\BOTIM-DOCSHUB-Setup-1.3.1.exe"
InstallDir "$PROGRAMFILES\BOTIM DOCSHUB"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show

VIProductVersion "1.3.1.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "Otim Noah"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Otim Noah â€” BOTIM DOCSHUB"
VIAddVersionKey "FileDescription" "BOTIM DOCSHUB by Otim Noah - PDF, Word, PowerPoint Editor & Converter"
VIAddVersionKey "FileVersion" "1.3.1"
VIAddVersionKey "ProductVersion" "1.3.1"

Icon "public\icon.ico"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite try
  File /r "release\BOTIM-DOCSHUB-win32-x64\*.*"
  CreateDirectory "$SMPROGRAMS\BOTIM DOCSHUB"
  CreateShortCut "$SMPROGRAMS\BOTIM DOCSHUB\BOTIM DOCSHUB.lnk" "$INSTDIR\BOTIM-DOCSHUB.exe" "" "$INSTDIR\BOTIM-DOCSHUB.exe" 0
  CreateShortCut "$DESKTOP\BOTIM DOCSHUB.lnk" "$INSTDIR\BOTIM-DOCSHUB.exe" "" "$INSTDIR\BOTIM-DOCSHUB.exe" 0
SectionEnd

Section -AdditionalIcons
  WriteIniStr "$INSTDIR\${PRODUCT_NAME}.url" "InternetShortcut" "URL" "${PRODUCT_WEB_SITE}"
  CreateShortCut "$SMPROGRAMS\BOTIM DOCSHUB\Website.lnk" "$INSTDIR\${PRODUCT_NAME}.url"
  CreateShortCut "$SMPROGRAMS\BOTIM DOCSHUB\Uninstall.lnk" "$INSTDIR\uninst.exe"
SectionEnd

Section -Post
  WriteUninstaller "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\BOTIM-DOCSHUB.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "$(^Name)"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\BOTIM-DOCSHUB.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
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
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  SetAutoClose true
SectionEnd

