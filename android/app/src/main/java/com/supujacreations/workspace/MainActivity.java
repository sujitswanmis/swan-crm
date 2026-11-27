package com.supujacreations.workspace;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FieldTrackerPlugin.class);
        super.onCreate(savedInstanceState);
        // Hardware & feature permissions are requested on-demand by the web CRM's
        // ModulePermissionPromptModal via FieldTrackerPlugin so users are only prompted
        // when opening a module that actually needs a permission.
    }

    @Override
    public void onResume() {
        super.onResume();
        // Prevent frozen white screen if Android OS killed the WebView render process in background
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                android.webkit.WebView webView = getBridge().getWebView();
                String url = webView.getUrl();
                if (url == null || url.trim().isEmpty() || "about:blank".equalsIgnoreCase(url.trim())) {
                    webView.loadUrl("https://app.supujacreations.com");
                }
                // Ensure in-app file downloads open in external system browser/download manager
                webView.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimetype, contentLength) -> {
                    try {
                        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                        i.setData(android.net.Uri.parse(downloadUrl));
                        startActivity(i);
                    } catch (Exception ignored) {}
                });
                // Inject native versionCode & dynamic capability flag for web CRM bridge
                long vCode = 11L;
                try {
                    android.content.pm.PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                    vCode = androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(pInfo);
                } catch (Exception ignored) {}
                webView.evaluateJavascript(
                    "try { window.localStorage.setItem('spc_android_version_code', '" + vCode + "'); window.localStorage.setItem('spc_android_dynamic_perms', '1'); } catch(e){}",
                    null
                );
            }
        } catch (Exception ignored) {}
    }
}
