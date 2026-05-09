@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo      ARIN BILLBOT - PACKAGING TOOL
echo ==========================================
echo.
echo This tool will create a clean ZIP file for sharing.
echo It will exclude node_modules and other temporary files.
echo.

set ZIP_NAME=Arin_Billbot_Shareable.zip

if exist %ZIP_NAME% (
    echo [!] Deleting old zip...
    del %ZIP_NAME%
)

echo [1/2] Creating ZIP file...
echo (This may take a moment, excluding node_modules, .git, and .venv)

powershell -Command "$exclude = @('node_modules', '.git', '.venv', 'dist', '.gemini', 'Arin_Billbot_Shareable.zip'); Get-ChildItem -Path . -Exclude $exclude | Compress-Archive -DestinationPath %ZIP_NAME% -Force"

echo.
echo [DONE] Created: %ZIP_NAME%
echo.
echo IMPORTANT: Tell the recipient to:
echo 1. Install Python (python.org)
echo 2. Install Node.js (nodejs.org)
echo 3. Extract the ZIP and run 'START_ARIN.bat'
echo.
pause
