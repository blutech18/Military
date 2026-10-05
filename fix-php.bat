@echo off
title ArmoryDB - PHP Configuration Fixer
color 0A

echo ============================================================
echo    ArmoryDB - Auto-Enabling PHP Extensions
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-php.ps1"

echo.
echo ============================================================
echo Done! Please restart 'php artisan serve' now.
echo ============================================================
pause
