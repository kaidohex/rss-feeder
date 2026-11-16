@echo off
rem Launcher for the portable Windows build. The real app lives in
rem release\win-unpacked\; an exe cannot run apart from its runtime files,
rem so this simply starts it from there.
start "" "%~dp0release\win-unpacked\Marginalia.exe"
