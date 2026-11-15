package com.xhs.pageextractor;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_RESULT_CODE = 1001;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean pageLoaded = false;
    private Intent pendingIntent = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;
                if (pendingIntent != null) {
                    handleIncomingShareIntent(pendingIntent);
                    pendingIntent = null;
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("video/*");
                startActivityForResult(Intent.createChooser(intent, "选择翻页视频或录屏"), FILE_CHOOSER_RESULT_CODE);
                return true;
            }
        });

        pendingIntent = getIntent();
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (pageLoaded) {
            handleIncomingShareIntent(intent);
        } else {
            pendingIntent = intent;
        }
    }

    private void handleIncomingShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (!Intent.ACTION_SEND.equals(action) || type == null) return;

        if ("text/plain".equals(type)) {
            final String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.isEmpty()) {
                final String escaped = JSONObject.quote(sharedText);
                webView.post(() -> webView.evaluateJavascript("window.onReceiveSharedText(" + escaped + ");", null));
            }
        } else if (type.startsWith("video/")) {
            Uri videoUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (videoUri != null) {
                try {
                    File cacheFile = new File(getCacheDir(), "shared_video.mp4");
                    try (InputStream in = getContentResolver().openInputStream(videoUri);
                         FileOutputStream out = new FileOutputStream(cacheFile)) {
                        byte[] buf = new byte[65536];
                        int len;
                        while ((len = in.read(buf)) > 0) {
                            out.write(buf, 0, len);
                        }
                    }
                    final String fileUrl = "file://" + cacheFile.getAbsolutePath();
                    webView.post(() -> webView.evaluateJavascript(
                            "window.onReceiveSharedVideo(" + JSONObject.quote(fileUrl) + ", '手机分享视频');",
                            null
                    ));
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public String getClipboardText() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null && cm.hasPrimaryClip()) {
                    ClipData clip = cm.getPrimaryClip();
                    if (clip != null && clip.getItemCount() > 0) {
                        CharSequence text = clip.getItemAt(0).coerceToText(MainActivity.this);
                        return text != null ? text.toString() : "";
                    }
                }
            } catch (Exception ignored) {}
            return "";
        }

        @JavascriptInterface
        public boolean saveImageToGallery(String dataUrl, String fileName, String folderName) {
            try {
                int comma = dataUrl.indexOf(',');
                String base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

                boolean isJpg = fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg");
                String mime = isJpg ? "image/jpeg" : "image/png";
                String cleanFolder = (folderName == null || folderName.trim().isEmpty())
                        ? "小红书翻页图集"
                        : folderName.replaceAll("[\\\\/:*?\"<>|]", "_");

                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, mime);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/小红书扒图/" + cleanFolder);
                }

                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out != null) {
                            out.write(bytes);
                            out.flush();
                            return true;
                        }
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return false;
        }

        @JavascriptInterface
        public String parseXhsShare(String inputText, String cookie) {
            JSONObject res = new JSONObject();
            try {
                Matcher urlMatcher = Pattern.compile("https?://[^\\s\"'<>]+").matcher(inputText);
                if (!urlMatcher.find()) {
                    res.put("ok", false);
                    res.put("error", "未在输入文本中识别到有效链接");
                    return res.toString();
                }
                String targetUrl = urlMatcher.group(0).replaceAll("[，。！？,.!)】\\]]+$", "");

                HttpURLConnection conn = (HttpURLConnection) new URL(targetUrl).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
                if (cookie != null && !cookie.trim().isEmpty()) {
                    conn.setRequestProperty("Cookie", cookie.trim());
                }

                StringBuilder htmlBuilder = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        htmlBuilder.append(line).append("\n");
                    }
                }
                String html = htmlBuilder.toString();

                String title = "小红书翻页笔记";
                Matcher tm = Pattern.compile("<meta\\s+name=\"og:title\"\\s+content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE).matcher(html);
                if (tm.find()) {
                    title = tm.group(1).replaceAll("\\s*-\\s*小红书.*$", "").trim();
                }

                String videoUrl = null;
                Matcher vm = Pattern.compile("<meta\\s+name=\"og:video\"\\s+content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE).matcher(html);
                if (vm.find()) {
                    videoUrl = vm.group(1).replace("&amp;", "&");
                }
                if (videoUrl == null || videoUrl.isEmpty()) {
                    Matcher mm = Pattern.compile("\"masterUrl\"\\s*:\\s*\"([^\"]+)\"").matcher(html);
                    if (mm.find()) {
                        videoUrl = mm.group(1).replace("\\u002F", "/").replace("\\/", "/").replace("&amp;", "&");
                    }
                }

                if (videoUrl != null && !videoUrl.isEmpty()) {
                    File localVideo = new File(getCacheDir(), "xhs_parsed.mp4");
                    HttpURLConnection vConn = (HttpURLConnection) new URL(videoUrl).openConnection();
                    vConn.setRequestProperty("User-Agent", "Mozilla/5.0");
                    vConn.setRequestProperty("Referer", "https://www.xiaohongshu.com/");
                    try (InputStream in = vConn.getInputStream();
                         FileOutputStream out = new FileOutputStream(localVideo)) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                        }
                    }

                    res.put("ok", true);
                    res.put("mode", "video");
                    res.put("title", title);
                    res.put("videoUrl", "file://" + localVideo.getAbsolutePath());
                    return res.toString();
                }

                Matcher im = Pattern.compile("<meta\\s+name=\"og:image\"\\s+content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE).matcher(html);
                JSONArray imgArr = new JSONArray();
                while (im.find()) {
                    String imgUrl = im.group(1).replace("&amp;", "&");
                    if (imgUrl.startsWith("http")) {
                        JSONObject item = new JSONObject();
                        item.put("originalUrl", imgUrl);
                        imgArr.put(item);
                    }
                }
                if (imgArr.length() > 0) {
                    res.put("ok", true);
                    res.put("mode", "images");
                    res.put("title", title);
                    res.put("images", imgArr);
                    return res.toString();
                }

                res.put("ok", false);
                res.put("error", "未提取到视频流（可能触发了网页登录验证，可配置 Cookie 或直接从手机相册选择录屏/下载的视频）");
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", "解析出错: " + e.getMessage());
                } catch (Exception ignored) {}
            }
            return res.toString();
        }
    }
}
