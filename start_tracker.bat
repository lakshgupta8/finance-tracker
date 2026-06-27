@echo off
title Finance Tracker Launcher
color 0B

echo ===============================================================================
echo                 FINANCE TRACKER AUTOMATED STARTUP SCRIPT
echo ===============================================================================
echo.

:: Ensure working directory is resolved correctly when run as administrator or double-clicked
cd /d "%~dp0"

:: 1. Start the Python Flask backend server in a minimized separate command window
echo [1/3] Launching local Flask backend server directly via venv python.exe...
cd server
start "Finance Tracker Backend Server" /MIN cmd /k "venv\Scripts\python.exe app.py"
cd ..

:: 2. Start the Vite client development server in a minimized separate command window
echo [2/3] Launching Vite frontend client server (bun dev)...
cd client
start "Finance Tracker Frontend Client" /MIN cmd /k "bun dev"
cd ..

:: 3. Give the background web servers a few seconds to fully initialize local host bindings
echo [3/3] Initializing network sockets... Please wait...
timeout /t 0 /nobreak > nul

:: 4. Automatically open the default web browser pointing directly to the GUI interface
echo.
echo Launching default web browser to http://localhost:5173 ...
start http://localhost:5173

exit /b