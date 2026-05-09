@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo       ARIN BILLBOT - STARTUP MANAGER
echo ==========================================
echo.

:: 1. Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python from python.org and try again.
    pause
    exit /b
)

:: 2. Check for Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from nodejs.org and try again.
    pause
    exit /b
)

:: 3. Setup Virtual Environment
echo [1/3] Setting up Python environment...
if not exist .venv (
    echo [!] Creating virtual environment (.venv)...
    python -m venv .venv
)

echo [!] Activating environment and checking dependencies...
call .venv\Scripts\activate

:: Install/Update dependencies in venv
python -m pip install --upgrade pip
cd backend
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [WARNING] Some dependencies could not be installed. 
    echo Please check your internet connection.
)
cd ..

echo.
echo [2/3] Starting Backend Server...
start "Billbot Backend" cmd /k "call .venv\Scripts\activate && cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 5000"

timeout /t 5

:: 4. Setup Frontend
echo.
echo [3/3] Checking Frontend Dashboard...
if not exist node_modules (
    echo [!] node_modules missing. This may take 2-3 minutes...
    call npm install
)

echo.
echo Starting Frontend Dashboard...
start "Billbot Frontend" cmd /k "npm run dev -- --host"

:: Fetch IP for display
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"IP Address"') do (
    set IP=%%i
    set IP=!IP: =!
)

echo.
echo ==========================================
echo        SOFTWARE IS NOW RUNNING!
echo   Local:   http://localhost:5173
echo   Network: http://!IP!:5173
echo ==========================================
echo.
echo [NOTE] If the website doesn't open, wait 10 seconds and refresh.
echo [NOTE] Keep these windows open while using the software.
echo.
pause
