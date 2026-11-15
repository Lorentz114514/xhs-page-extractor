package android.webkit;

import android.content.Context;
import android.view.View;

public class WebView extends View {
    public WebView(Context context) {
        super(context);
    }
    public WebSettings getSettings() {
        return null;
    }
    public void addJavascriptInterface(Object object, String name) {}
    public void setWebViewClient(WebViewClient client) {}
    public void setWebChromeClient(WebChromeClient client) {}
    public void loadUrl(String url) {}
    public void evaluateJavascript(String script, ValueCallback<String> resultCallback) {}
}
