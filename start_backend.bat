@echo off
echo ========================================
echo   AirDraw Vision - Backend Server
echo ========================================
echo.

REM Check if GROQ_API_KEY is set
if "%GROQ_API_KEY%"=="" (
    echo ERROR: GROQ_API_KEY environment variable is not set!
    echo.
    echo Please set it using:
    echo     set GROQ_API_KEY=your-api-key-here
    echo.
    echo Or add it to your system environment variables.
    echo.
    pause
    exit /b 1
)

echo Groq API Key: Found!
echo.

REM Navigate to backend directory
cd /d "%~dp0backend"

REM Check if virtual environment exists
if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo.
echo Installing dependencies...
pip install -r requirements.txt --quiet

REM Start the server
echo.
echo ========================================
echo   Starting Backend Server...
echo   URL: http://localhost:8000
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.

uvicorn main:app --reload --host 0.0.0.0 --port 8000

