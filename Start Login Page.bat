@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Install Node.js and run this file again.
  pause
  exit /b 1
)
if not exist node_modules\express\ (
  echo Installing Node.js packages...
  call npm install
  if errorlevel 1 (
    echo Package installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
if not exist .env (
  echo Missing .env. Copy .env.example to .env and configure your MongoDB Atlas URI first.
  pause
  exit /b 1
)
call npm start
pause
