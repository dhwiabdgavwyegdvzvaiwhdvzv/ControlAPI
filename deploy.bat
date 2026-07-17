@echo off
cd /d "%~dp0"
echo Deploying fpspatch-api...
call npx wrangler deploy
echo.
echo Done. Press any key to close this window.
pause >nul
