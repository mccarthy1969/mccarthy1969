@echo off
setlocal
cd /d "%~dp0"
set "SPY_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "SPY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%SPY_NODE%" server.mjs --open
if errorlevel 1 echo SPY Lab could not start. It needs Node.js 24 or newer. Check whether port 8787 is already in use.
pause
