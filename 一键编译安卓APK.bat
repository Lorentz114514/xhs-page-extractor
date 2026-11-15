@echo off
chcp 65001 >nul
title 编译小红书翻页扒图安卓安装包
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"
pause
