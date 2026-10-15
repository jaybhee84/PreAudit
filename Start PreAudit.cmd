@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "release\PBB PreAudit-win32-x64\PBB PreAudit.exe" (
  echo Packaged app not found. Build it with npm run package.
  pause
  exit /b 1
)
start "" "release\PBB PreAudit-win32-x64\PBB PreAudit.exe"
