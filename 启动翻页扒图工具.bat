@echo off
chcp 65001 >nul
title 小红书翻页视频扒图工具
echo 正在启动本地服务，请稍候...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
