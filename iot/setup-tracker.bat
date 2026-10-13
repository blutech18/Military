@echo off
rem ArmoryDB tracker setup (see tools\setup-tracker.ps1).
rem   setup-tracker.bat           window: hotspot name + password, laptop IP and USB port detected,
rem                               then flashes the tracker; afterwards shows live tracker status here
rem   setup-tracker.bat monitor   live tracker status only (Ctrl+C to stop)
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0tools\setup-tracker.ps1" %1
