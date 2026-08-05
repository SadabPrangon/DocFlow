@echo off
start "DocFlow Backend" cmd /k "cd /d %~dp0server && npm run dev"
start "DocFlow Frontend" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 4 >nul
start http://localhost:5173
