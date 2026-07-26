@echo off
setlocal enabledelayedexpansion
title Pandemonia MP Server
cd /d "%~dp0"

REM --- Toggle the Pandemonia multiplayer server on port 8787 ---------------------
REM   Double-click to START the server (this window becomes the server).
REM   Double-click again (or run from another prompt) to STOP it.
REM ------------------------------------------------------------------------------

set "RUNNING="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do (
  set "RUNNING=1"
  taskkill /PID %%p /T /F >nul 2>&1
)

if defined RUNNING (
  echo.
  echo Pandemonia multiplayer server stopped.
  ping -n 3 127.0.0.1 >nul
  goto :eof
)

echo.
echo Starting Pandemonia multiplayer server on port 8787...
echo Run this file again to STOP it (or close this window / press Ctrl+C).
echo.
call npm run server

REM npm exited (Ctrl+C) - clear any lingering node still holding the port.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
endlocal
