@echo off
REM ── Pandemonia TCG launcher ──────────────────────────────
REM Double-click this file to start the game in your browser.

cd /d "%~dp0"

echo Pulling the latest version...
git pull
if errorlevel 1 (
  echo.
  echo git pull failed - starting with the local copy instead.
  echo.
)

REM Install every launch so dependencies a pull added are picked up (quick when nothing changed).
echo Checking dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo Dependency install failed. Make sure Node.js is installed.
  pause
  exit /b 1
)

echo Starting Pandemonia dev server...
echo The game will open in your browser. Close this window to stop it.
echo.
call npm run dev -- --open
pause
