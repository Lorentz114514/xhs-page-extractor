$ErrorActionPreference = "Continue"
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
Write-Host "[1/4] 已将最新前端代码同步至 android-app/app/src/main/assets/" -ForegroundColor Green

# 2. 生成单文件手机离线版 HTML
$html = Get-Content (Join-Path $RootDir "index.html") -Raw -Encoding UTF8
$css = Get-Content (Join-Path $RootDir "style.css") -Raw -Encoding UTF8
$js = Get-Content (Join-Path $RootDir "app.js") -Raw -Encoding UTF8
$standaloneHtml = $html -replace '<link\s+rel="stylesheet"\s+href="style\.css"\s*/?>', "<style>`n$css`n</style>"
$standaloneHtml = $standaloneHtml -replace '<script\s+src="app\.js"\s*></script>', "<script>`n$js`n</script>"
$standaloneOut = Join-Path $RootDir "小红书翻页扒图_手机离线版.html"
[System.IO.File]::WriteAllText($standaloneOut, $standaloneHtml, [System.Text.Encoding]::UTF8)
Write-Host "[2/4] 已生成手机离线单文件版: $standaloneOut" -ForegroundColor Green

# 3. 查找本机安装的 Android Studio (含注册表与常见盘符)
$studioPath = $null
try {
    $regStudio = Get-ItemProperty "HKLM:\SOFTWARE\Android Studio*", "HKCU:\SOFTWARE\Android Studio*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($regStudio -and $regStudio.Path -and (Test-Path $regStudio.Path)) {
        $studioPath = $regStudio.Path
    }
} catch {}

if (-not $studioPath) {
    $studioCandidates = @(
        "H:\Andorid Studio",
        "H:\Android Studio",
        "C:\Program Files\Android\Android Studio",
        "D:\Android Studio",
        "E:\Android Studio"
    ) | Where-Object { Test-Path $_ }
    $studioPath = $studioCandidates | Select-Object -First 1
}

if (-not $studioPath) {
    Write-Host "未检测到 Android Studio 安装目录。" -ForegroundColor Red
    exit 1
}

Write-Host "[3/4] 检测到 Android Studio: $studioPath ，正在调用内置 R8 与构建引擎编译 APK..." -ForegroundColor Cyan

$jbrBin = Join-Path $studioPath "jbr\bin"
$javaExe = Join-Path $jbrBin "java.exe"
$javacExe = Join-Path $jbrBin "javac.exe"
$keytoolExe = Join-Path $jbrBin "keytool.exe"
$jarsignerExe = Join-Path $jbrBin "jarsigner.exe"

$layoutlibJar = Join-Path $studioPath "plugins\design-tools\lib\layoutlib.jar"
$r8Jar = Join-Path $studioPath "plugins\android\lib\r8.jar"
$sdkToolsJar = Join-Path $studioPath "plugins\android\lib\sdk-tools.jar"
$sdkCommonJar = Join-Path $studioPath "plugins\android\lib\sdk-common.jar"
$commonJar = Join-Path $studioPath "plugins\android\lib\android-base-common.jar"
$binaryResJar = Join-Path $studioPath "plugins\android\lib\libbinary-resources.jar"
$studioLibWildcard = Join-Path $studioPath "lib\*"

$buildWork = Join-Path $RootDir "android-app\build_fast"
if (Test-Path $buildWork) { Remove-Item -Recurse -Force $buildWork }
New-Item -ItemType Directory -Force -Path "$buildWork\stubs" | Out-Null
New-Item -ItemType Directory -Force -Path "$buildWork\app_classes" | Out-Null
New-Item -ItemType Directory -Force -Path "$buildWork\packager" | Out-Null

# 3.1 编译补充 API Stub
$stubFiles = Get-ChildItem (Join-Path $RootDir "android-app\stubs") -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
& $javacExe --release 8 -encoding UTF-8 -cp $layoutlibJar -d "$buildWork\stubs" $stubFiles

# 3.2 编译 MainActivity.java
$mainJava = Join-Path $RootDir "android-app\app\src\main\java\com\xhs\pageextractor\MainActivity.java"
$compileCp = "$buildWork\stubs;$layoutlibJar"
& $javacExe --release 8 -encoding UTF-8 -nowarn -cp $compileCp -d "$buildWork\app_classes" $mainJava

# 3.3 调用 Google 官方 R8/D8 将字节码转换为 Android classes.dex
$appClassFiles = Get-ChildItem "$buildWork\app_classes" -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& $javaExe -cp $r8Jar com.android.tools.r8.D8 --min-api 24 --lib $layoutlibJar --classpath "$buildWork\stubs" --output $buildWork $appClassFiles

# 3.4 编译并运行二进制 AXML 与 APK 打包器
$packagerJava = Join-Path $RootDir "android-app\ApkPackager.java"
$verifierCp = "$sdkToolsJar;$sdkCommonJar;$commonJar;$binaryResJar;$studioLibWildcard"
& $javacExe --release 11 -encoding UTF-8 -d "$buildWork\packager" $packagerJava

$unsignedApk = Join-Path $buildWork "unsigned.apk"
& $javaExe -cp "$buildWork\packager;$verifierCp" ApkPackager "$buildWork\classes.dex" $AssetsDir $unsignedApk

# 4. 生成签名密钥并对 APK 进行数字签名
Write-Host "[4/4] 正在对 APK 进行数字签名..." -ForegroundColor Cyan
$keystore = Join-Path $buildWork "release.keystore"
& $keytoolExe -genkeypair -keystore $keystore -storepass android -alias releasekey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=XHS Page Extractor,O=OpenSource,C=CN" 2>$null

$finalApk = Join-Path $RootDir "小红书翻页扒图助手.apk"
if (Test-Path $finalApk) { Remove-Item -Force $finalApk }
Copy-Item $unsignedApk $finalApk

& $jarsignerExe -keystore $keystore -storepass android -keypass android -sigalg SHA256withRSA -digestalg SHA-256 $finalApk releasekey | Out-Null

$apkInfo = Get-Item $finalApk
$sizeKB = [math]::Round($apkInfo.Length / 1KB, 1)

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host "🎉 安卓安装包编译并签名成功！" -ForegroundColor Green
Write-Host "📦 APK 文件路径: $finalApk ($sizeKB KB)" -ForegroundColor Yellow
Write-Host "👉 你现在可以直接在浏览器「📱 手机端 App」弹窗中点击下载该 APK 到手机安装！" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Green
