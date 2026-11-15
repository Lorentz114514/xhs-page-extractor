param(
    [int]$Port = 18765,
    [switch]$NoOpenBrowser
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExportRoot = Join-Path $RootDir "exports"
$CacheRoot = Join-Path $RootDir "temp_cache"

if (-not (Test-Path $ExportRoot)) { New-Item -ItemType Directory -Force -Path $ExportRoot | Out-Null }
if (-not (Test-Path $CacheRoot)) { New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null }

# 获取本机局域网 Wi-Fi / 以太网 IP（优先 192.168.* 方便手机同 Wi-Fi 扫码访问）
function Get-PreferredLanIp {
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notmatch "^127\." -and $_.IPAddress -notmatch "^169\.254\." }
        $wifiIp = $ips | Where-Object { $_.IPAddress -match "^192\.168\." } | Select-Object -First 1
        if ($wifiIp) { return $wifiIp.IPAddress }
        $anyIp = $ips | Select-Object -First 1
        if ($anyIp) { return $anyIp.IPAddress }
    } catch {}
    return "127.0.0.1"
}

$LanIp = Get-PreferredLanIp

# 免管理员权限的局域网 TCP 转发器（将 <LanIp>:<Port> 转发至 127.0.0.1:<Port> 并重写 Host 头以兼容 HttpListener）
$forwarderCode = @"
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

public class LanForwarder {
    private TcpListener _listener;
    private int _targetPort;
    private volatile bool _running;

    public LanForwarder(string bindIp, int port, int targetPort) {
        _targetPort = targetPort;
        _listener = new TcpListener(IPAddress.Parse(bindIp), port);
    }

    public void Start() {
        _running = true;
        _listener.Start();
        Task.Run(() => AcceptLoop());
    }

    public void Stop() {
        _running = false;
        try { _listener.Stop(); } catch {}
    }

    private async Task AcceptLoop() {
        while (_running) {
            try {
                var client = await _listener.AcceptTcpClientAsync();
                Task.Run(() => HandleClient(client));
            } catch {
                if (!_running) break;
            }
        }
    }

    private async Task HandleClient(TcpClient client) {
        using (client)
        using (var target = new TcpClient()) {
            try {
                await target.ConnectAsync("127.0.0.1", _targetPort);
                var cStream = client.GetStream();
                var tStream = target.GetStream();

                // 读取首个数据包并替换 Host 请求头，使 HttpListener 接受非 127.0.0.1 来源请求
                byte[] buf = new byte[16384];
                int n = await cStream.ReadAsync(buf, 0, buf.Length);
                if (n <= 0) return;

                int headerEnd = FindHeaderEnd(buf, n);
                if (headerEnd > 0) {
                    string headerStr = Encoding.ASCII.GetString(buf, 0, headerEnd);
                    string rewritten = Regex.Replace(
                        headerStr,
                        @"Host:\s*[^\r\n]+",
                        "Host: 127.0.0.1:" + _targetPort,
                        RegexOptions.IgnoreCase
                    );
                    byte[] newHeaderBytes = Encoding.ASCII.GetBytes(rewritten);
                    await tStream.WriteAsync(newHeaderBytes, 0, newHeaderBytes.Length);
                    int bodyRemaining = n - headerEnd;
                    if (bodyRemaining > 0) {
                        await tStream.WriteAsync(buf, headerEnd, bodyRemaining);
                    }
                } else {
                    await tStream.WriteAsync(buf, 0, n);
                }

                var upTask = cStream.CopyToAsync(tStream);
                var downTask = tStream.CopyToAsync(cStream);
                await Task.WhenAny(upTask, downTask);
            } catch {}
        }
    }

    private int FindHeaderEnd(byte[] buf, int len) {
        for (int i = 0; i <= len - 4; i++) {
            if (buf[i] == 13 && buf[i+1] == 10 && buf[i+2] == 13 && buf[i+3] == 10) {
                return i + 4;
            }
        }
        return -1;
    }
}
"@

try {
    Add-Type -TypeDefinition $forwarderCode -Language CSharp -IgnoreWarnings
} catch {}

function Send-JsonResponse {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [hashtable]$Data,
        [int]$StatusCode = 200
    )
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json; charset=utf-8"
    $Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $json = $Data | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Read-RequestBody {
    param([System.Net.HttpListenerRequest]$Request)
    $reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
}

function Sanitize-FileName {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return "xhs_pages" }
    $invalid = [System.IO.Path]::GetInvalidFileNameChars() -join ''
    $re = "[{0}]" -f [RegEx]::Escape($invalid)
    $clean = ($Name -replace $re, "_").Trim()
    if ($clean.Length -gt 60) { $clean = $clean.Substring(0, 60).Trim() }
    if ([string]::IsNullOrWhiteSpace($clean)) { return "xhs_pages" }
    return $clean
}

function Build-StandaloneMobileHtml {
    $html = Get-Content (Join-Path $RootDir "index.html") -Raw -Encoding UTF8
    $css = Get-Content (Join-Path $RootDir "style.css") -Raw -Encoding UTF8
    $js = Get-Content (Join-Path $RootDir "app.js") -Raw -Encoding UTF8
    $html = $html -replace '<link\s+rel="stylesheet"\s+href="style\.css"\s*/?>', "<style>`n$css`n</style>"
    $html = $html -replace '<script\s+src="app\.js"\s*></script>', "<script>`n$js`n</script>"
    return $html
}

function Serve-FileWithRange {
    param(
        [System.Net.HttpListenerRequest]$Request,
        [System.Net.HttpListenerResponse]$Response,
        [string]$FilePath,
        [string]$ContentType
    )
    if (-not (Test-Path $FilePath)) {
        $Response.StatusCode = 404
        $Response.OutputStream.Close()
        return
    }

    $fileInfo = Get-Item $FilePath
    $fileLength = $fileInfo.Length
    $Response.ContentType = $ContentType
    $Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $Response.Headers.Add("Accept-Ranges", "bytes")

    $rangeHeader = $Request.Headers["Range"]
    $fs = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        if (-not [string]::IsNullOrEmpty($rangeHeader) -and $rangeHeader -match "bytes=(\d+)-(\d*)") {
            $start = [int64]$Matches[1]
            $end = if ([string]::IsNullOrEmpty($Matches[2])) { $fileLength - 1 } else { [int64]$Matches[2] }
            if ($end -ge $fileLength) { $end = $fileLength - 1 }
            if ($start -gt $end -or $start -ge $fileLength) {
                $Response.StatusCode = 416
                $Response.Headers.Add("Content-Range", "bytes */$fileLength")
                return
            }
            $chunkLength = $end - $start + 1
            $Response.StatusCode = 206
            $Response.Headers.Add("Content-Range", "bytes $start-$end/$fileLength")
            $Response.ContentLength64 = $chunkLength

            $fs.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
            $buffer = New-Object byte[] 65536
            $remaining = $chunkLength
            while ($remaining -gt 0) {
                $toRead = [int][Math]::Min($buffer.Length, $remaining)
                $read = $fs.Read($buffer, 0, $toRead)
                if ($read -le 0) { break }
                $Response.OutputStream.Write($buffer, 0, $read)
                $remaining -= $read
            }
        } else {
            $Response.StatusCode = 200
            $Response.ContentLength64 = $fileLength
            $fs.CopyTo($Response.OutputStream)
        }
    } catch {
        # Client disconnected mid-stream
    } finally {
        $fs.Close()
        try { $Response.OutputStream.Close() } catch {}
    }
}

function Parse-XhsShareInput {
    param(
        [string]$InputText,
        [string]$Cookie = ""
    )

    if ([string]::IsNullOrWhiteSpace($InputText)) {
        return @{ ok = $false; error = "请输入小红书分享链接或口令文本" }
    }

    $urlMatch = [regex]::Match($InputText, "https?://[^\s""'<>]+")
    if (-not $urlMatch.Success) {
        return @{ ok = $false; error = "未能在输入文本中识别到有效链接（支持 xhslink.com 或 xiaohongshu.com 链接）" }
    }
    $targetUrl = $urlMatch.Value.TrimEnd('，', '。', '！', '？', ',', '.', '!', ')', '】', ']')

    if ($targetUrl -match "\.mp4(\?|$)") {
        $fileId = "direct_" + [guid]::NewGuid().ToString("N").Substring(0, 8)
        $localVideoPath = Join-Path $CacheRoot "$fileId.mp4"
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        $wc.Headers.Add("Referer", "https://www.xiaohongshu.com/")
        $wc.DownloadFile($targetUrl, $localVideoPath)
        return @{
            ok = $true
            mode = "video"
            title = "直链视频_$fileId"
            noteId = $fileId
            videoUrl = "/cache/$fileId.mp4"
            originalVideoUrl = $targetUrl
        }
    }

    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $true
    $handler.MaxAutomaticRedirections = 10
    $handler.UseCookies = $false

    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(20)
    $client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    $client.DefaultRequestHeaders.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
    $client.DefaultRequestHeaders.Add("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
    if (-not [string]::IsNullOrWhiteSpace($Cookie)) {
        $client.DefaultRequestHeaders.Add("Cookie", $Cookie.Trim())
    }

    $resp = $client.GetAsync($targetUrl).GetAwaiter().GetResult()
    $finalUri = $resp.RequestMessage.RequestUri.AbsoluteUri
    $htmlBytes = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $html = [System.Text.Encoding]::UTF8.GetString($htmlBytes)
    $client.Dispose()

    $noteId = "xhs_" + (Get-Date -Format "HHmmss")
    if ($finalUri -match "/(?:explore|item|discovery/item)/([a-zA-Z0-9]+)") {
        $noteId = $Matches[1]
    }

    $title = "小红书笔记_$noteId"
    $titleMatch = [regex]::Match($html, '<meta\s+name="og:title"\s+content="([^"]+)"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $titleMatch.Success) {
        $titleMatch = [regex]::Match($html, '<title>([^<]+)</title>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    if ($titleMatch.Success) {
        $title = ($titleMatch.Groups[1].Value -replace "\s*-\s*小红书.*$", "").Trim()
    }

    $videoUrl = $null
    $ogVideoMatch = [regex]::Match($html, '<meta\s+name="og:video"\s+content="([^"]+)"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($ogVideoMatch.Success) {
        $videoUrl = $ogVideoMatch.Groups[1].Value -replace "&amp;", "&"
    }

    if ([string]::IsNullOrWhiteSpace($videoUrl)) {
        $masterMatch = [regex]::Match($html, '"masterUrl"\s*:\s*"([^"]+)"')
        if ($masterMatch.Success) {
            $videoUrl = $masterMatch.Groups[1].Value -replace "\\u002F", "/" -replace "\\/", "/" -replace "&amp;", "&"
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($videoUrl)) {
        $localVideoName = "${noteId}.mp4"
        $localVideoPath = Join-Path $CacheRoot $localVideoName
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            $wc.Headers.Add("Referer", "https://www.xiaohongshu.com/")
            $wc.DownloadFile($videoUrl, $localVideoPath)
        } catch {
            return @{
                ok = $false
                error = "已解析到视频地址，但下载视频流失败: $($_.Exception.Message)"
                rawVideoUrl = $videoUrl
            }
        }

        return @{
            ok = $true
            mode = "video"
            title = $title
            noteId = $noteId
            videoUrl = "/cache/$localVideoName"
            originalVideoUrl = $videoUrl
        }
    }

    $ogImages = [regex]::Matches($html, '<meta\s+name="og:image"\s+content="([^"]+)"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($ogImages.Count -gt 0) {
        $imgList = @()
        $idx = 1
        foreach ($m in $ogImages) {
            $rawImg = $m.Groups[1].Value -replace "&amp;", "&" -replace "\\u002F", "/"
            if ($rawImg -notmatch "^https?://") { continue }
            $imgList += @{
                index = $idx
                originalUrl = $rawImg
                proxyUrl = "/api/proxy-image?url=" + [System.Uri]::EscapeDataString($rawImg)
            }
            $idx++
        }
        if ($imgList.Count -gt 0) {
            return @{
                ok = $true
                mode = "images"
                title = $title
                noteId = $noteId
                images = $imgList
            }
        }
    }

    if ($finalUri -match "login|captcha|website-login" -or $html -match "安全限制|请先登录|验证码") {
        return @{
            ok = $false
            error = "小红书网页端触发了登录/安全验证拦截。你可以：① 在展开的「Cookie 设置」中粘贴浏览器端小红书 Cookie 后重试；或者 ② 直接将视频下载/录屏后放入本地视频提取区域！"
            finalUrl = $finalUri
        }
    }

    return @{
        ok = $false
        error = "未能从该链接页面提取到视频或图集数据（可能该笔记受限或需登录访问）。建议直接拖入下载好的 .mp4 视频或配置 Cookie 后重试。"
        finalUrl = $finalUri
    }
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

$lanForwarder = $null
$LanPort = $Port + 1
$lanUrl = "http://${LanIp}:${LanPort}/"
if ($LanIp -ne "127.0.0.1") {
    try {
        $lanForwarder = New-Object LanForwarder($LanIp, $LanPort, $Port)
        $lanForwarder.Start()
    } catch {
        Write-Host "局域网转发绑定提示: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  小红书翻页视频扒图工具 (PC + 手机 PWA 双端版) 已启动！" -ForegroundColor Green
Write-Host "  电脑访问: $prefix" -ForegroundColor Yellow
Write-Host "  手机访问 (同Wi-Fi): $lanUrl" -ForegroundColor Green
Write-Host "  导出目录: $ExportRoot" -ForegroundColor Gray
Write-Host "=====================================================" -ForegroundColor Cyan

if (-not $NoOpenBrowser) {
    Start-Process $prefix
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".svg"  = "image/svg+xml"
    ".mp4"  = "video/mp4"
    ".webm" = "video/webm"
    ".mov"  = "video/quicktime"
    ".apk"  = "application/vnd.android.package-archive"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        $path = $req.Url.AbsolutePath

        try {
            if ($req.HttpMethod -eq "OPTIONS") {
                $res.StatusCode = 204
                $res.Headers.Add("Access-Control-Allow-Origin", "*")
                $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
                $res.OutputStream.Close()
                continue
            }

            if ($path -eq "/api/ping" -or $path -eq "/api/server-info") {
                $apkPath = Join-Path $RootDir "小红书翻页扒图助手.apk"
                Send-JsonResponse -Response $res -Data @{
                    ok = $true
                    lanIp = $LanIp
                    lanUrl = $lanUrl
                    port = $Port
                    exportRoot = $ExportRoot
                    hasApk = (Test-Path $apkPath)
                }
                continue
            }

            if ($path -eq "/api/download-standalone" -and $req.HttpMethod -eq "GET") {
                $standaloneHtml = Build-StandaloneMobileHtml
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($standaloneHtml)
                $res.StatusCode = 200
                $res.ContentType = "text/html; charset=utf-8"
                $res.Headers.Add("Content-Disposition", "attachment; filename=`"xhs_page_extractor_mobile.html`"")
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.OutputStream.Close()
                continue
            }

            if ($path -eq "/api/parse-xhs" -and $req.HttpMethod -eq "POST") {
                $bodyText = Read-RequestBody -Request $req
                $payload = $bodyText | ConvertFrom-Json
                $result = Parse-XhsShareInput -InputText $payload.text -Cookie $payload.cookie
                Send-JsonResponse -Response $res -Data $result
                continue
            }

            if ($path -eq "/api/proxy-image" -and $req.HttpMethod -eq "GET") {
                $rawUrl = $req.QueryString["url"]
                if ([string]::IsNullOrWhiteSpace($rawUrl)) {
                    $res.StatusCode = 400
                    $res.OutputStream.Close()
                    continue
                }
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                $wc.Headers.Add("Referer", "https://www.xiaohongshu.com/")
                $imgBytes = $wc.DownloadData($rawUrl)
                $res.StatusCode = 200
                $res.ContentType = "image/jpeg"
                $res.Headers.Add("Access-Control-Allow-Origin", "*")
                $res.ContentLength64 = $imgBytes.Length
                $res.OutputStream.Write($imgBytes, 0, $imgBytes.Length)
                $res.OutputStream.Close()
                continue
            }

            if ($path -eq "/api/save-folder" -and $req.HttpMethod -eq "POST") {
                $bodyText = Read-RequestBody -Request $req
                $payload = $bodyText | ConvertFrom-Json
                $folderName = Sanitize-FileName -Name $payload.folderName
                $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
                $targetDir = Join-Path $ExportRoot "${folderName}_${timestamp}"
                New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

                $savedCount = 0
                foreach ($item in $payload.images) {
                    $fileName = Sanitize-FileName -Name $item.filename
                    if (-not ($fileName -match "\.(png|jpg|jpeg|webp)$")) {
                        $fileName += ".png"
                    }
                    $filePath = Join-Path $targetDir $fileName
                    $dataUrl = [string]$item.dataUrl
                    $commaIdx = $dataUrl.IndexOf(",")
                    if ($commaIdx -gt 0) {
                        $base64 = $dataUrl.Substring($commaIdx + 1)
                        $bytes = [Convert]::FromBase64String($base64)
                        [System.IO.File]::WriteAllBytes($filePath, $bytes)
                        $savedCount++
                    }
                }

                if ($payload.openExplorer) {
                    Start-Process "explorer.exe" -ArgumentList "`"$targetDir`""
                }

                Send-JsonResponse -Response $res -Data @{
                    ok = $true
                    savedCount = $savedCount
                    folderPath = $targetDir
                }
                continue
            }

            if ($path -eq "/api/open-exports" -and $req.HttpMethod -eq "POST") {
                Start-Process "explorer.exe" -ArgumentList "`"$ExportRoot`""
                Send-JsonResponse -Response $res -Data @{ ok = $true; path = $ExportRoot }
                continue
            }

            if ($path.StartsWith("/cache/")) {
                $relName = [System.IO.Path]::GetFileName($path)
                $cacheFilePath = Join-Path $CacheRoot $relName
                Serve-FileWithRange -Request $req -Response $res -FilePath $cacheFilePath -ContentType "video/mp4"
                continue
            }

            $localRel = if ($path -eq "/") { "index.html" } else { $path.TrimStart('/') }
            $localPath = Join-Path $RootDir $localRel
            if (Test-Path $localPath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
                $ctype = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                Serve-FileWithRange -Request $req -Response $res -FilePath $localPath -ContentType $ctype
            } else {
                $res.StatusCode = 404
                $res.OutputStream.Close()
            }
        } catch {
            try {
                Send-JsonResponse -Response $res -StatusCode 500 -Data @{
                    ok = $false
                    error = $_.Exception.Message
                }
            } catch {}
        }
    }
} finally {
    if ($lanForwarder) { $lanForwarder.Stop() }
    $listener.Stop()
}
