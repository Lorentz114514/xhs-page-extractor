$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AssetsDir = Join-Path $RootDir "android-app\app\src\main\assets"

New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null

# 1. 同步最新网页端资源到 Android 工程 assets 目录
$filesToSync = @("index.html", "style.css", "app.js", "manifest.json", "icon.svg", "sw.js")
foreach ($f in $filesToSync) {
    $src = Join-Path $RootDir $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $AssetsDir $f) -Force
    }
}
Write-Host "[1/3] 已将最新前端代码同步至 android-app/app/src/main/assets/" -ForegroundColor Green

# 2. 生成单文件手机离线版 HTML（方便直接发到手机微信/文件管理离线使用）
$html = Get-Content (Join-Path $RootDir "index.html") -Raw -Encoding UTF8
$css = Get-Content (Join-Path $RootDir "style.css") -Raw -Encoding UTF8
$js = Get-Content (Join-Path $RootDir "app.js") -Raw -Encoding UTF8
$standaloneHtml = $html -replace '<link\s+rel="stylesheet"\s+href="style\.css"\s*/?>', "<style>`n$css`n</style>"
$standaloneHtml = $standaloneHtml -replace '<script\s+src="app\.js"\s*></script>', "<script>`n$js`n</script>"
$standaloneOut = Join-Path $RootDir "小红书翻页扒图_手机离线版.html"
[System.IO.File]::WriteAllText($standaloneOut, $standaloneHtml, [System.Text.Encoding]::UTF8)
Write-Host "[2/3] 已生成手机离线单文件版: $standaloneOut" -ForegroundColor Green

# 3. 检查本地 Android SDK 环境并执行快速 APK 编译
$sdkCandidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
    (Join-Path $RootDir "android-sdk")
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path $_) }

$sdkRoot = $sdkCandidates | Select-Object -First 1

if (-not $sdkRoot) {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Yellow
    Write-Host "提示：未检测到本机已安装 Android SDK。" -ForegroundColor Yellow
    Write-Host "你可以通过以下任一方式在手机上立即使用：" -ForegroundColor Cyan
    Write-Host "  ① 【最推荐】手机连同一个 Wi-Fi，扫码打开 http://电脑局域网IP:18765/ 并添加到桌面（PWA 全屏 App）；" -ForegroundColor White
    Write-Host "  ② 将刚生成的「小红书翻页扒图_手机离线版.html」发到手机上直接用浏览器打开；" -ForegroundColor White
    Write-Host "  ③ 用 Android Studio 打开本目录下的 android-app 文件夹，点击 Build -> Build APK 即可生成安装包。" -ForegroundColor White
    Write-Host "==================================================================" -ForegroundColor Yellow
    exit 0
}

Write-Host "[3/3] 检测到 Android SDK: $sdkRoot ，正在编译 APK..." -ForegroundColor Cyan

$buildToolsDir = Get-ChildItem (Join-Path $sdkRoot "build-tools") -Directory | Sort-Object Name -Descending | Select-Object -First 1
$platformDir = Get-ChildItem (Join-Path $sdkRoot "platforms") -Directory | Sort-Object Name -Descending | Select-Object -First 1

if (-not $buildToolsDir -or -not $platformDir) {
    Write-Host "未在 $sdkRoot 下找到完整的 build-tools 或 platforms 目录，请通过 Android Studio SDK Manager 安装。" -ForegroundColor Red
    exit 1
}

$aapt2 = Join-Path $buildToolsDir.FullName "aapt2.exe"
$d8 = Join-Path $buildToolsDir.FullName "d8.bat"
$zipalign = Join-Path $buildToolsDir.FullName "zipalign.exe"
$apksigner = Join-Path $buildToolsDir.FullName "apksigner.bat"
$androidJar = Join-Path $platformDir.FullName "android.jar"

$buildWork = Join-Path $RootDir "android-app\build_fast"
if (Test-Path $buildWork) { Remove-Item -Recurse -Force $buildWork }
New-Item -ItemType Directory -Force -Path "$buildWork\classes" | Out-Null

$manifestPath = Join-Path $RootDir "android-app\app\src\main\AndroidManifest.xml"
$javaFile = Join-Path $RootDir "android-app\app\src\main\java\com\xhs\pageextractor\MainActivity.java"
$unalignedApk = Join-Path $buildWork "unaligned.apk"
$alignedApk = Join-Path $buildWork "aligned.apk"
$finalApk = Join-Path $RootDir "小红书翻页扒图助手.apk"

& $aapt2 link -o $unalignedApk -I $androidJar --manifest $manifestPath -A $AssetsDir --auto-add-overlay
& javac --release 8 -encoding UTF-8 -cp $androidJar -d "$buildWork\classes" $javaFile
$classFiles = Get-ChildItem "$buildWork\classes" -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& $d8 --lib $androidJar --output $buildWork $classFiles

Push-Location $buildWork
& jar uf $unalignedApk "classes.dex"
Pop-Location

& $zipalign -f 4 $unalignedApk $alignedApk

$keystore = Join-Path $buildWork "debug.keystore"
& keytool -genkeypair -v -keystore $keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" 2>$null
& $apksigner sign --ks $keystore --ks-pass pass:android --key-pass pass:android --out $finalApk $alignedApk

Write-Host "🎉 编译成功！安装包已生成: $finalApk" -ForegroundColor Green
