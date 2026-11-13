@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :no_node

if not exist "node_modules\sharp" goto :install
if not exist "node_modules\tsup" goto :install
goto :build

:install
echo Installing dependencies...
call npm install
if errorlevel 1 goto :failed

:build
echo Preparing Deckicons...
call npm run build >nul 2>&1
if errorlevel 1 (
    echo Build failed. Showing details...
    call npm run build
    goto :failed
)

node "dist\cli.js" %*
if errorlevel 1 goto :failed

pause
exit /b 0

:no_node
echo.
echo Node.js is required but was not found on PATH.
echo Install Node.js 20.12 or newer from https://nodejs.org/ and try again.
pause
exit /b 1

:failed
echo.
echo Deckicons failed to start. Check the messages above.
pause
exit /b 1
