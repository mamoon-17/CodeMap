@echo off
REM Quick start script for CodeMap development
REM Run from backend directory: .\start-dev.bat

echo.
echo =====================================
echo   CodeMap Development Environment
echo =====================================
echo.

REM Check if services are already running
netstat -an | findstr ":5001" >nul
if %errorlevel% equ 0 (
    echo [WARNING] Port 5001 already in use. Mock service may already be running.
    echo.
)

netstat -an | findstr ":5000" >nul
if %errorlevel% equ 0 (
    echo [WARNING] Port 5000 already in use. Backend may already be running.
    echo.
)

echo Starting services...
echo.

REM Start mock service (from root/mock-service)
echo [1/2] Starting Mock Embedding Service...
start "Mock Service" cmd /k "cd ..\mock-service && .venv\Scripts\activate && python app.py"
timeout /t 2 /nobreak >nul

REM Start backend (current directory)
echo [2/2] Starting Backend API...
start "Backend" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo =====================================
echo Services starting in new windows:
echo   Mock Service: http://localhost:5001
echo   Backend API:  http://localhost:5000
echo =====================================
echo.
echo To run tests: npm test
echo   or: node tests/integration.spec.js
echo.
pause
