$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

# 自动寻找本机 Git 可执行文件
$gitCandidates = @(
    (Get-Command git -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "C:\Program Files\Git\cmd\git.exe",
    "E:\AzurLaneAutoScript\toolkit\Git\cmd\git.exe",
    "E:\NKAS_v1.0.5\toolkit\Git\cmd\git.exe"
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path $_) }

$gitExe = $gitCandidates | Select-Object -First 1
if (-not $gitExe) {
    Write-Host "未找到 git.exe，请先安装 Git for Windows。" -ForegroundColor Red
    exit 1
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  🚀 小红书翻页视频扒图助手 - 一键推送到 GitHub" -ForegroundColor Green
Write-Host "  使用 Git: $gitExe" -ForegroundColor Gray
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果你还没有在 GitHub 创建空仓库，请先在浏览器打开：" -ForegroundColor Yellow
Write-Host "  https://github.com/new" -ForegroundColor White
Write-Host "  （仓库名建议填：xhs-page-extractor ，不要勾选 Add a README file，直接点 Create repository）" -ForegroundColor Gray
Write-Host ""

$openNew = Read-Host "是否现在为你打开 GitHub 新建仓库页面？(输入 Y 打开，直接回车跳过)"
if ($openNew -match "^[Yy]") {
    Start-Process "https://github.com/new"
}

Write-Host ""
$repoUrl = Read-Host "请粘贴你的 GitHub 仓库地址 (例如 https://github.com/你的用户名/xhs-page-extractor.git)"
$repoUrl = $repoUrl.Trim()

if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    Write-Host "未输入仓库地址，已取消推送。" -ForegroundColor Red
    exit 1
}

# 检查是否已配置 git user.name / user.email
$userName = & $gitExe config user.name
if ([string]::IsNullOrWhiteSpace($userName)) {
    & $gitExe config user.name "Kamen"
    & $gitExe config user.email "kamen@users.noreply.github.com"
}

& $gitExe add -A
$status = & $gitExe status --porcelain
if (-not [string]::IsNullOrWhiteSpace($status)) {
    & $gitExe commit -m "chore: update project files"
}

& $gitExe branch -M main

$existingRemote = & $gitExe remote
if ($existingRemote -contains "origin") {
    & $gitExe remote set-url origin $repoUrl
} else {
    & $gitExe remote add origin $repoUrl
}

Write-Host ""
Write-Host "正在推送到 $repoUrl (分支: main)..." -ForegroundColor Cyan
& $gitExe push -u origin main

if ($LASTEXITCODE -eq 0) {
    $cleanWebUrl = $repoUrl -replace "\.git$", ""
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "🎉 推送成功！你的项目已经发布到 GitHub！" -ForegroundColor Green
    Write-Host "👉 仓库主页: $cleanWebUrl" -ForegroundColor Yellow
    Write-Host "👉 自动编译安卓 APK 进度: $cleanWebUrl/actions" -ForegroundColor Cyan
    Write-Host "👉 编译完成后下载 APK: $cleanWebUrl/releases" -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
    Start-Process "$cleanWebUrl/actions"
} else {
    Write-Host "推送过程中遇到认证或网络问题，请检查上方 Git 输出提示。" -ForegroundColor Red
}
