@echo off
echo ====================================
echo Starting CodeMap Development Stack
echo ====================================
echo.

echo [1/3] Starting Python RAG Service...
cd mock-service
start "Python RAG Service" cmd /k "call .venv\Scripts\activate & uvicorn app:app --reload --port 5001"
timeout /t 3 /nobreak >nul

echo [2/3] Starting Node.js Backend...
cd ..\backend
start "Node.js Backend" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul

echo [3/3] Starting Frontend...
cd ..\frontend
start "Frontend" cmd /k "npm run dev"

echo.
echo ====================================
echo All services started!
echo ====================================
echo Python RAG Service: http://localhost:5001
echo Node.js Backend:    http://localhost:5000
echo Frontend:           http://localhost:5173
echo.
echo Press any key to stop all services...
pause >nul
taskkill /FI "WindowTitle eq Python RAG Service*" /T /F
taskkill /FI "WindowTitle eq Node.js Backend*" /T /F
taskkill /FI "WindowTitle eq Frontend*" /T /F
