@echo off
echo ========================================
echo   AirDraw Vision - Frontend Server
echo ========================================
echo.

REM Navigate to frontend directory
cd /d "%~dp0frontend"

REM Start HTTP server
echo Starting frontend server...
echo URL: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

python -m http.server 3000

