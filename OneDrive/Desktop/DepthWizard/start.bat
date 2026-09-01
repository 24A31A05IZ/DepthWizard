@echo off
echo ============================================================
echo   DepthWizard -- SIH26175 -- ISRO
echo   Single-View Height Estimation and 3D Flythrough
echo ============================================================
echo.
echo [1/2] Starting backend (Flask on port 5000)...
start "DepthWizard Backend" cmd /k "cd /d %~dp0backend && python app.py"
timeout /t 2 /nobreak > nul

echo [2/2] Starting frontend (Vite on port 5173)...
start "DepthWizard Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 3 /nobreak > nul

echo.
echo ============================================================
echo   Application is starting up!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:5000/api/health
echo ============================================================
echo.
echo   NOTE: First-time depth estimation will download the
echo         Depth Anything v2 model (~99 MB) automatically.
echo.
start http://localhost:5173
