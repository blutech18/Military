@echo off
title ArmoryDB - 10RCDG Firearm Tracking System Setup
color 0A

echo ============================================================
echo    ArmoryDB - 10RCDG Firearm Tracking System
echo    Automated Setup Script
echo ============================================================
echo.
echo PREREQUISITES:
echo   1. XAMPP is installed (default: C:\xampp)
echo   2. Composer is installed
echo   3. Node.js and npm are installed
echo.
echo This script will automatically start MySQL if needed.
echo Safe to run multiple times - it will skip what's already done.
echo.
echo ============================================================
echo.
pause

:: -----------------------------------------------------------
:: Locate XAMPP
:: -----------------------------------------------------------
set "XAMPP_PATH=C:\xampp"
if not exist "%XAMPP_PATH%\mysql\bin\mysql.exe" (
    echo.
    echo ERROR: XAMPP not found at %XAMPP_PATH%
    echo If XAMPP is installed elsewhere, edit this script and change XAMPP_PATH.
    echo.
    pause
    exit /b 1
)

:: -----------------------------------------------------------
:: Start MySQL if not already running
:: -----------------------------------------------------------
echo [1/8] Checking MySQL...
tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I "mysqld.exe" >NUL
if %ERRORLEVEL% NEQ 0 (
    echo       MySQL is not running. Starting it now...
    start "" /B "%XAMPP_PATH%\mysql\bin\mysqld.exe" --defaults-file="%XAMPP_PATH%\mysql\bin\my.ini"
    :: Wait for MySQL to be ready
    echo       Waiting for MySQL to start...
    set /a attempts=0
    :wait_mysql
    timeout /t 2 /nobreak >NUL
    "%XAMPP_PATH%\mysql\bin\mysql.exe" -u root -e "SELECT 1;" >NUL 2>&1
    if %ERRORLEVEL% NEQ 0 (
        set /a attempts+=1
        if %attempts% GEQ 10 (
            echo.
            echo ERROR: MySQL failed to start after 20 seconds.
            echo Please start MySQL manually via XAMPP Control Panel.
            pause
            exit /b 1
        )
        goto wait_mysql
    )
    echo       MySQL started successfully!
) else (
    echo       MySQL is already running. OK!
)
echo.

:: -----------------------------------------------------------
:: Check PHP (use XAMPP's PHP)
:: -----------------------------------------------------------
echo [2/8] Checking PHP...
set "PATH=%XAMPP_PATH%\php;%PATH%"
php -v >NUL 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: PHP not found! Check your XAMPP installation.
    pause
    exit /b 1
)
echo       PHP found. OK!
echo.

:: -----------------------------------------------------------
:: Check Composer
:: -----------------------------------------------------------
echo [3/8] Checking Composer...
composer -V >NUL 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Composer is not installed or not in PATH!
    echo Download it from https://getcomposer.org
    pause
    exit /b 1
)
echo       Composer found. OK!
echo.

:: -----------------------------------------------------------
:: Check Node.js
:: -----------------------------------------------------------
echo [4/8] Checking Node.js...
node -v >NUL 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH!
    echo Download it from https://nodejs.org
    pause
    exit /b 1
)
echo       Node.js found. OK!
echo.

:: -----------------------------------------------------------
:: Create the MySQL database (IF NOT EXISTS = safe to re-run)
:: -----------------------------------------------------------
echo [5/8] Creating database "armorydb" (if not exists)...
"%XAMPP_PATH%\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS armorydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to create database.
    echo Please check if MySQL is running properly.
    pause
    exit /b 1
)
echo       Database "armorydb" ready!
echo.

:: -----------------------------------------------------------
:: Backend Setup
:: -----------------------------------------------------------
echo [6/8] Setting up Backend (Laravel)...
cd /d "%~dp0backend"

:: Copy .env only if it doesn't exist (won't overwrite)
if not exist .env (
    echo       Creating .env from .env.example...
    copy .env.example .env >NUL
) else (
    echo       .env already exists, skipping copy.
)

:: Install Composer dependencies (skips if already installed and lock unchanged)
echo       Installing Composer dependencies...
composer install --no-interaction --prefer-dist --optimize-autoloader
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Composer install failed!
    pause
    exit /b 1
)

:: Generate app key only if not already set
findstr /C:"APP_KEY=base64:" .env >NUL 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       Generating application key...
    php artisan key:generate --ansi
) else (
    echo       App key already set, skipping.
)

:: Run migrations (--force skips confirmation, migrate won't re-run existing)
echo       Running database migrations...
php artisan migrate --force
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Migrations failed! Check your database connection.
    pause
    exit /b 1
)

:: Seed only if the roles table is empty (prevents duplicate data)
echo       Checking if database needs seeding...
for /f %%i in ('"%XAMPP_PATH%\mysql\bin\mysql.exe" -u root -N -e "SELECT COUNT(*) FROM armorydb.roles;" 2^>NUL') do set ROW_COUNT=%%i
if "%ROW_COUNT%"=="" set ROW_COUNT=0
if %ROW_COUNT% EQU 0 (
    echo       Seeding database with default data...
    php artisan db:seed --force
    if %ERRORLEVEL% NEQ 0 (
        echo       WARNING: Seeding had issues but continuing...
    )
) else (
    echo       Database already seeded, skipping.
)

echo       Backend setup complete!
echo.

:: -----------------------------------------------------------
:: Frontend Setup
:: -----------------------------------------------------------
echo [7/8] Setting up Frontend (Next.js)...
cd /d "%~dp0frontend"

:: Create .env.local with defaults if it doesn't exist
if not exist .env.local (
    echo       Creating .env.local with defaults...
    (
        echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
        echo NEXT_PUBLIC_APP_NAME=ArmoryDB - 10RCDG Firearm Tracking
        echo NEXT_PUBLIC_INSTITUTION=10RCDG
        echo NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT=14.5995
        echo NEXT_PUBLIC_DEFAULT_MAP_CENTER_LON=120.9842
        echo NEXT_PUBLIC_GPS_POLL_SECONDS=30
        echo NEXT_PUBLIC_BIOMETRIC_BRIDGE_URL=http://127.0.0.1:8787
    ) > .env.local
) else (
    echo       .env.local already exists, skipping.
)

:: npm install is safe to re-run (uses package-lock, skips if up to date)
echo       Installing npm dependencies...
npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo       Frontend setup complete!
echo.

:: -----------------------------------------------------------
:: Done!
:: -----------------------------------------------------------
echo [8/8] Setup Complete!
echo.
echo ============================================================
echo    SETUP FINISHED SUCCESSFULLY!
echo ============================================================
echo.
echo To run the application:
echo.
echo   1. Start the Backend (open a terminal):
echo      cd backend
echo      php artisan serve
echo      (Runs at http://127.0.0.1:8000)
echo.
echo   2. Start the Frontend (open another terminal):
echo      cd frontend
echo      npm run dev
echo      (Runs at http://localhost:3000)
echo.
echo   NOTE: MySQL was started by this script. Keep this window
echo         open or start MySQL via XAMPP Control Panel instead.
echo.
echo ============================================================
echo.
pause
