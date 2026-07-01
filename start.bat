@echo off
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

start "Frontend" cmd /k "cd /d ""%PROJECT_ROOT%"" && npm run dev"
start "Backend" cmd /k "cd /d ""%PROJECT_ROOT%"" && uvicorn backend.main:app --reload"

timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"
