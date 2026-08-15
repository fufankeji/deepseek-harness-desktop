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

  # The public 0.1.0-rc.5 uninstaller can time out while atomically moving the
  # staged Host's large dependency tree during an update. Skip that one known
  # uninstaller and overwrite the application in place; the new installer
  # recreates both uninstall values after its payload has been written.
  ReadRegStr $1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $1 == "0.1.0-rc.5"
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    SetOverwrite on
  ${EndIf}
!macroend

!macro customCheckAppRunning
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /T /F /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 1000
!macroend
