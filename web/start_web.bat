@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages, first run only...
  call npm install
)
if not exist .env.local copy .env.example .env.local
if not exist .next (
  echo Building...
  call npm run build
)
echo.
echo FireCensus web: http://localhost:3000   (keep this window open)
call npm run start
pause
