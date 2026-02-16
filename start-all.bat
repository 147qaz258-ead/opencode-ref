@echo off
echo Starting OpenCode (Frontend + Backend)...
echo.

REM Start backend server
start "OpenCode Backend" cmd /k "cd /d %~dp0\packages\opencode && bun run serve"

REM Wait a moment for backend to initialize
timeout /t 3 /nobreak > nul

REM Start frontend server
start "OpenCode Frontend" cmd /k "cd /d %~dp0\packages\app && bun run dev"

echo.
echo Both servers are starting...
echo - Backend: http://localhost:4096
echo - Frontend: http://localhost:3000
echo.
echo Press any key to close this window...
pause > nul
