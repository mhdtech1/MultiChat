!macro customInit
  ; Best-effort process cleanup so reinstall acts as an in-place update.
  nsExec::ExecToLog 'taskkill /IM "MultiChat.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "Update.exe" /T /F'
  Pop $0
!macroend

!macro customUnInstallCheck
  IfErrors 0 +4
    DetailPrint "Previous installer metadata could not be read. Continuing with overwrite install."
    ClearErrors
    StrCpy $R0 0
    Return

  StrCmp $R0 0 +3
    DetailPrint "Previous uninstall returned code $R0. Continuing with overwrite install."
    StrCpy $R0 0
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend
