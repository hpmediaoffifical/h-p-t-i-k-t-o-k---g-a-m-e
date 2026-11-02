@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai tai https://nodejs.org roi chay lai file nay.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8090"
node server\server.mjs
pause
