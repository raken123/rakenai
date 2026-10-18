package ai.raken.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;

// Raken for Android: shows the Raken web app from your Raken server in a WebView.
public class MainActivity extends Activity {
    private static final String PREFS = "raken";
    private static final String KEY_SERVER = "server_url";

    private FrameLayout root;
    private WebView web;
    private View fullscreenView;
    private String serverUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        setContentView(root);
        applySystemBarPadding(root);

        serverUrl = BuildConfig.SERVER_URL.isEmpty() ? prefs().getString(KEY_SERVER, "") : BuildConfig.SERVER_URL;
        if (serverUrl.isEmpty()) showSetup(null);
        else showApp();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // Android 15 draws apps edge to edge; keep content clear of the status bar,
    // navigation bar and keyboard.
    private void applySystemBarPadding(View view) {
        view.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // First launch (or the server can't be reached): ask for the server address.
    private void showSetup(String problem) {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setPadding(dp(24), dp(24), dp(24), dp(24));

        TextView title = new TextView(this);
        title.setText("Connect to Raken");
        title.setTextSize(24);
        box.addView(title);

        TextView note = new TextView(this);
        note.setText(problem != null ? problem
                : "Enter the address of your Raken server, for example https://raken.example.com or http://192.168.1.20:3000.");
        note.setPadding(0, dp(8), 0, dp(16));
        if (problem != null) note.setTextColor(Color.rgb(220, 38, 38));
        box.addView(note);

        EditText input = new EditText(this);
        input.setHint("https://raken.example.com");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setText(serverUrl);
        box.addView(input);

        Button connect = new Button(this);
        connect.setText(problem != null ? "Try again" : "Connect");
        connect.setOnClickListener(v -> {
            String url = input.getText().toString().trim().replaceAll("/+$", "");
            if (url.isEmpty()) return;
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
            serverUrl = url;
            prefs().edit().putString(KEY_SERVER, url).apply();
            showApp();
        });
        box.addView(connect);

        root.removeAllViews();
        root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private boolean isRakenUrl(Uri uri) {
        Uri server = Uri.parse(serverUrl);
        return server.getScheme() != null && server.getScheme().equals(uri.getScheme())
                && server.getAuthority() != null && server.getAuthority().equals(uri.getAuthority());
    }

    private void showApp() {
        root.removeAllViews();
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "RakenAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isRakenUrl(uri)) return false;
                // Links to other sites open in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showSetup("Couldn't reach " + serverUrl + " (" + error.getDescription() + "). Check the address and your connection.");
                }
            }
        });

        // Full screen for movie and app previews.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                fullscreenView = view;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView != null) root.removeView(fullscreenView);
                fullscreenView = null;
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(serverUrl + "/app.html");
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (fullscreenView != null && web != null) {
            web.getWebChromeClient().onHideCustomView();
        } else if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // Lets the web app save generated files (code, documents, movies) to Downloads.
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String mimeType, String base64) {
            String safeName = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("No Downloads folder");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    out.write(bytes);
                }
                toast("Saved " + safeName + " to Downloads");
            } catch (Exception e) {
                toast("Couldn't save " + safeName);
            }
        }
    }

    private void toast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }
}
