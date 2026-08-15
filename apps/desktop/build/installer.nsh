!macro customInit
  nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
  Pop $0
  ${If} $0 == 0
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --dsh-installer-quit'
    Sleep 7000
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /T /F /IM "${APP_EXECUTABLE_FILENAME}"'
    Pop $0
    Sleep 1000
  ${EndIf}
!macroend

!macro customCheckAppRunning
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /T /F /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 1000
!macroend
