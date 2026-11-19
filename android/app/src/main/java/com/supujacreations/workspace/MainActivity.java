package com.supujacreations.workspace;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FieldTrackerPlugin.class);
        super.onCreate(savedInstanceState);

        // Request essential foreground permissions (Audio & Notifications on API 33+)
        // Note: Location permissions are requested on-demand according to user's assigned policy
        List<String> requiredPermissions = new ArrayList<>();
        requiredPermissions.add(Manifest.permission.RECORD_AUDIO);
        requiredPermissions.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requiredPermissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        boolean needsRequest = false;
        for (String perm : requiredPermissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needsRequest = true;
                break;
            }
        }

        if (needsRequest) {
            ActivityCompat.requestPermissions(this, requiredPermissions.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
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
                // Inject native versionCode for in-app OTA version detector
                webView.evaluateJavascript(
                    "try { window.localStorage.setItem('spc_android_version_code', '9'); } catch(e){}",
                    null
                );
            }
        } catch (Exception ignored) {}
    }
}
