@echo off
title ArmoryDB - Biometric Bridge
cd /d "%~dp0"

if not exist "bridge.settings.json" (
    echo [bridge] bridge.settings.json is missing.
    echo          Copy bridge.settings.example.json to bridge.settings.json and set hmac_secret
    echo          to the same value as BIOMETRIC_BRIDGE_HMAC_SECRET in backend\.env
    pause
    exit /b 1
)

if not exist "bin\Release\ArmoryBiometricBridge.exe" (
    echo [bridge] First run - building...
    dotnet build -c Release || ( pause & exit /b 1 )
)

:: Keep the runtime copy of the settings in sync with the one you edit.
copy /y "bridge.settings.json" "bin\Release\bridge.settings.json" >NUL

if /i "%~1"=="test" (
    "bin\Release\ArmoryBiometricBridge.exe" --test
    pause
    exit /b
)

"bin\Release\ArmoryBiometricBridge.exe"
pause
