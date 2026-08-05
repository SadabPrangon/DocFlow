@echo off
echo Installing DocFlow dependencies...
start "DocFlow Server Setup" cmd /k "cd /d %~dp0server && npm install && npm run seed"
start "DocFlow Client Setup" cmd /k "cd /d %~dp0client && npm install"
echo Two setup windows were opened. Wait until both finish.
pause
