@echo off
title ArmoryDB - Launcher
color 0B

echo ============================================================
echo    ArmoryDB - 10RCDG Firearm Tracking System
echo    Starting Servers...
echo ============================================================
echo.

:: -----------------------------------------------------------
:: Check XAMPP & MySQL
:: -----------------------------------------------------------
set "XAMPP_PATH=C:\xampp"
if not exist "%XAMPP_PATH%\mysql\bin\mysql.exe" (
    if exist "D:\xampp\mysql\bin\mysql.exe" (
        set "XAMPP_PATH=D:\xampp"
    ) else if exist "E:\xampp\mysql\bin\mysql.exe" (
        set "XAMPP_PATH=E:\xampp"
    )
)

if exist "%XAMPP_PATH%\php\php.exe" (
    set "PATH=%XAMPP_PATH%\php;%XAMPP_PATH%\mysql\bin;%PATH%"
)

:: Check the port, not the process name: another MySQL (e.g. on 3307) may be running.
netstat -an | find ":3306 " | find "LISTENING" >NUL
if %ERRORLEVEL% NEQ 0 (
    echo [1/3] Starting MySQL server...
    if exist "%XAMPP_PATH%\mysql\bin\mysqld.exe" (
        start "" /B "%XAMPP_PATH%\mysql\bin\mysqld.exe" --defaults-file="%XAMPP_PATH%\mysql\bin\my.ini"
    ) else (
        net start mysql >NUL 2>&1
    )
    timeout /t 2 /nobreak >NUL
) else (
    echo [1/3] MySQL server is running. OK!
)

:: -----------------------------------------------------------
:: Start Backend (Laravel) in a new window
:: -----------------------------------------------------------
:: --host 0.0.0.0 lets the ESP32 GPS tracker on the same Wi-Fi reach the API.
echo [2/3] Starting Backend Server (http://127.0.0.1:8000, LAN-reachable for IoT)...
start "ArmoryDB - Backend (Laravel :8000)" cmd /k "cd /d "%~dp0backend" && php artisan serve --host 0.0.0.0 --port 8000"

:: -----------------------------------------------------------
:: Start Frontend (Next.js) in a new window
:: -----------------------------------------------------------
echo [3/3] Starting Frontend Server (http://localhost:3000)...
start "ArmoryDB - Frontend (Next.js :3000)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: -----------------------------------------------------------
:: Start Biometric Bridge (DigitalPersona reader) if it is set up
:: -----------------------------------------------------------
if exist "%~dp0biometric-bridge\bridge.settings.json" (
    netstat -an | find "127.0.0.1:8787 " | find "LISTENING" >NUL
    if errorlevel 1 (
        echo [+] Starting Biometric Bridge [http://127.0.0.1:8787]...
        start "ArmoryDB - Biometric Bridge" cmd /c ""%~dp0biometric-bridge\start-bridge.bat""
    )
)

:: -----------------------------------------------------------
:: Open Browser
:: -----------------------------------------------------------
echo.
echo Waiting 4 seconds for servers to initialize...
timeout /t 4 /nobreak >NUL

start http://localhost:3000

echo.
echo ============================================================
echo    Both servers have started!
echo ============================================================
echo.
echo - Backend API:  http://127.0.0.1:8000
echo - Frontend Web: http://localhost:3000
echo.
echo DO NOT CLOSE the opened terminal windows while using the system.
echo Press any key to exit this launcher window.
echo.
pause >NUL
