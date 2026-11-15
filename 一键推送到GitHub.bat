@echo off
chcp 65001 >nul
title 一键推送到 GitHub
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-github.ps1"
pause
