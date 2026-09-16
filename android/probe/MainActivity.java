package app.paneboard.probe;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import java.io.ByteArrayInputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.File;
import org.json.JSONObject;

/** Prototype Workspace client with an authenticated loopback-to-tsnet adapter. */
public class MainActivity extends Activity {
  private Process core;
  private OutputStreamWriter commands;
  private TextView status, results, vpn;
  private EditText endpoint, fingerprint;
  private Button start, authorize, test, workspace;
  private ScrollView connectionView;
  private WebView webView;
  private volatile String workspaceOrigin = "";
  private String authorizationUrl = "";
  private boolean destroyed;
  private boolean direct;
  private boolean stopping;
  private TextView connectionHelp;

  private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

  private TextView text(String value, int size) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextSize(size);
    view.setTextColor(0xff202a37);
    view.setPadding(0, dp(8), 0, dp(8));
    return view;
  }

  private Button button(String value, LinearLayout parent, View.OnClickListener action) {
    Button view = new Button(this);
    view.setText(value);
    view.setAllCaps(false);
    view.setMinHeight(dp(48));
    view.setOnClickListener(action);
    parent.addView(view, new LinearLayout.LayoutParams(-1, -2));
    return view;
  }

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    ScrollView scroll = new ScrollView(this);
    connectionView = scroll;
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(0xfff4f6f8);
    LinearLayout body = new LinearLayout(this);
    body.setOrientation(LinearLayout.VERTICAL);
    body.setPadding(dp(24), dp(24), dp(24), dp(24));
    scroll.addView(body);
    scroll.setOnApplyWindowInsetsListener((view, insets) -> {
      if (android.os.Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
        body.setPadding(dp(24) + bars.left, dp(16) + bars.top, dp(24) + bars.right, dp(24) + bars.bottom);
      }
      return insets;
    });
    TextView title = text("Paneboard", 28);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    body.addView(title);
    body.addView(text("Android 開發版 · Workspace 客戶端", 14));
    SharedPreferences saved = getSharedPreferences("probe", MODE_PRIVATE);
    direct = saved.getBoolean("directConnection", false);
    body.addView(text("連線方式", 14));
    RadioGroup modes = new RadioGroup(this);
    RadioButton tailscaleMode = new RadioButton(this);
    tailscaleMode.setId(View.generateViewId());
    tailscaleMode.setText("內置 Tailscale");
    tailscaleMode.setMinHeight(dp(48));
    modes.addView(tailscaleMode);
    RadioButton directMode = new RadioButton(this);
    directMode.setId(View.generateViewId());
    directMode.setText("直接連線（唔使用內置 Tailscale）");
    directMode.setMinHeight(dp(48));
    modes.addView(directMode);
    modes.check(direct ? directMode.getId() : tailscaleMode.getId());
    body.addView(modes);
    connectionHelp = text("", 14);
    body.addView(connectionHelp);
    body.addView(text("測試伺服器（HTTPS · port 5001 / 5023）", 14));
    endpoint = new EditText(this);
    endpoint.setSingleLine(true);
    endpoint.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
    endpoint.setText(getIntent().getStringExtra("serverUrl") != null ? getIntent().getStringExtra("serverUrl") : saved.getString("serverUrl", ""));
    endpoint.setHint("https://100.x.x.x:5023/");
    endpoint.setContentDescription("測試伺服器網址");
    body.addView(endpoint);
    body.addView(text("已核實嘅憑證 SHA-256", 14));
    fingerprint = new EditText(this);
    fingerprint.setText(getIntent().getStringExtra("certificateSha256") != null ? getIntent().getStringExtra("certificateSha256") : saved.getString("certificateSha256", ""));
    fingerprint.setTypeface(Typeface.MONOSPACE);
    fingerprint.setTextSize(12);
    fingerprint.setContentDescription("已核實嘅憑證 SHA-256");
    body.addView(fingerprint);
    vpn = text("", 14);
    body.addView(vpn);
    status = text("尚未啟動連線", 17);
    body.addView(status);
    start = button("啟動連線", body, view -> startCore());
    authorize = button("授權 Tailscale", body, view -> authorize());
    authorize.setEnabled(false);
    test = button("測試 HTTPS 及 WebSocket", body, view -> {
      try {
        saved.edit().putString("serverUrl", endpoint.getText().toString().trim()).putString("certificateSha256", fingerprint.getText().toString().trim()).apply();
        results.setText(direct ? "正在測試，使用手機現有網絡……" : "正在測試，只會透過內嵌 Tailscale 連線……");
        send(new JSONObject().put("Op", "probe").put("URL", endpoint.getText().toString().trim()).put("Pin", fingerprint.getText().toString().trim()));
      } catch (Exception error) { showError("未能開始測試"); }
    });
    test.setEnabled(false);
    workspace = button("開啟 Workspace", body, view -> {
      try {
        saved.edit().putString("serverUrl", endpoint.getText().toString().trim()).putString("certificateSha256", fingerprint.getText().toString().trim()).apply();
        workspace.setEnabled(false);
        send(new JSONObject().put("Op", "workspace").put("URL", endpoint.getText().toString().trim()).put("Pin", fingerprint.getText().toString().trim()));
      } catch (Exception error) { workspace.setEnabled(true); showError("未能開啟 Workspace"); }
    });
    workspace.setEnabled(false);
    button("停止連線", body, view -> stopCore());
    results = text("測試結果會顯示喺呢度。", 14);
    results.setTextIsSelectable(true);
    body.addView(results);
    updateMode();
    modes.setOnCheckedChangeListener((group, checked) -> {
      stopCore();
      direct = checked == directMode.getId();
      saved.edit().putBoolean("directConnection", direct).apply();
      results.setText("連線方式已更改。請確認網址及憑證，再啟動連線。");
      updateMode();
    });
    setContentView(scroll);
  }

  private void updateMode() {
    connectionHelp.setText(direct
      ? "使用 Wi-Fi／流動網絡（包括系統已啟用嘅 VPN）。請填可直接到達嘅伺服器網址。"
      : "透過內置 Tailscale 連去你嘅私有網絡，唔需要系統 VPN。連線失敗唔會轉直連。");
    authorize.setVisibility(direct ? View.GONE : View.VISIBLE);
    if (core == null) status.setText("尚未啟動連線");
  }

  @Override protected void onResume() {
    super.onResume();
    ConnectivityManager manager = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
    boolean activeVpn = false;
    for (Network network : manager.getAllNetworks()) {
      NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
      if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) activeVpn = true;
    }
    vpn.setText(activeVpn ? "系統 VPN：目前有連線（唔係本測試版建立）" : "系統 VPN：未偵測到連線");
  }

  private void startCore() {
    if (core != null || stopping) return;
    try {
      File privateState = new File(getFilesDir(), "tsnet");
      if (!privateState.exists() && !privateState.mkdirs()) throw new java.io.IOException();
      ProcessBuilder builder = new ProcessBuilder(new File(getApplicationInfo().nativeLibraryDir, "libpaneboardcore.so").getAbsolutePath(), privateState.getAbsolutePath());
      builder.environment().put("TMPDIR", getCacheDir().getAbsolutePath());
      builder.environment().put("PANEBOARD_ANDROID_SDK", Integer.toString(android.os.Build.VERSION.SDK_INT));
      builder.environment().put("PANEBOARD_CONNECTION_MODE", direct ? "direct" : "tailscale");
      builder.environment().put("TS_LOGS_DIR", getCacheDir().getAbsolutePath());
      builder.environment().put("TS_NO_LOGS_NO_SUPPORT", "true");
      final Process process = builder.start();
      core = process;
      commands = new OutputStreamWriter(process.getOutputStream(), java.nio.charset.StandardCharsets.UTF_8);
      status.setText(direct ? "正在準備直接連線……" : "正在啟動內嵌 Tailscale……");
      start.setEnabled(false);
      authorize.setEnabled(!direct);
      new Thread(() -> {
        // Drain native diagnostics without logging authorization URLs or secrets.
        try { byte[] bytes = new byte[4096]; while (process.getErrorStream().read(bytes) != -1) {} } catch (Exception ignored) {}
      }, "paneboard-core-errors").start();
      new Thread(() -> {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), java.nio.charset.StandardCharsets.UTF_8))) {
          String line;
          while ((line = reader.readLine()) != null) {
            final JSONObject message = new JSONObject(line);
            runOnUiThread(() -> { if (!destroyed && core == process) receive(message); });
          }
          final int code = process.waitFor();
          runOnUiThread(() -> {
            if (!destroyed && core == process) { closeWorkspace(); core = null; commands = null; start.setEnabled(true); authorize.setEnabled(false); test.setEnabled(false); workspace.setEnabled(false); status.setText("連線核心已停止（" + code + "）"); }
          });
        } catch (Exception error) { runOnUiThread(() -> { if (!destroyed && core == process) { stopCore(); showError("未能讀取連線核心狀態"); } }); }
      }, "paneboard-core-events").start();
    } catch (Exception error) { showError("未能啟動連線核心：" + error.getClass().getSimpleName()); }
  }

  private void receive(JSONObject message) {
    String type = message.optString("type"), value = message.optString("value");
    if (type.equals("auth")) {
      Uri uri = Uri.parse(value);
      String host = uri.getHost();
      if ("https".equals(uri.getScheme()) && host != null && (host.equals("tailscale.com") || host.endsWith(".tailscale.com"))) {
        authorizationUrl = value;
        status.setText("需要授權：請按「授權 Tailscale」");
      } else showError("收到非預期嘅授權網址，已阻止開啟");
    } else if (type.equals("state")) {
      boolean ready = direct ? value.equals("DirectReady") : value.equals("Running");
      status.setText(direct ? "直接連線已準備好（未驗證伺服器）" : "Tailscale：" + value);
      test.setEnabled(ready);
      workspace.setEnabled(ready);
      if (value.equals("Running")) authorizationUrl = "";
    } else if (type.equals("workspace")) {
      try { openWorkspace(new JSONObject(value)); }
      catch (Exception error) { closeWorkspace(); showError("未能建立 Workspace 畫面"); }
    } else if (type.equals("result")) results.append("\n" + value);
    else if (type.equals("error")) { workspace.setEnabled(test.isEnabled()); showError(value); }
  }

  private boolean workspaceUrl(Uri uri) {
    return "http".equals(uri.getScheme()) && ("http://" + uri.getEncodedAuthority()).equals(workspaceOrigin) && uri.getUserInfo() == null;
  }

  private void openWorkspace(JSONObject bridge) throws Exception {
    String origin = bridge.getString("url"), capability = bridge.getString("capability");
    Uri uri = Uri.parse(origin);
    if (!"http".equals(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost()) || uri.getPort() < 1 || uri.getUserInfo() != null || !capability.matches("[0-9a-f]{64}")) throw new IllegalArgumentException();
    workspaceOrigin = origin;
    LinearLayout page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(0, dp(8), 0, dp(8));
    button("返回連線設定", page, view -> closeWorkspace());
    final WebView browser = new WebView(this);
    webView = browser;
    WebView.setWebContentsDebuggingEnabled(false);
    WebSettings settings = browser.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setAllowFileAccessFromFileURLs(false);
    settings.setAllowUniversalAccessFromFileURLs(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSupportMultipleWindows(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    browser.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !workspaceUrl(request.getUrl()); }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (workspaceUrl(request.getUrl())) return null;
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
      }
      // SSL errors retain the platform default: cancel, never proceed.
    });
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptThirdPartyCookies(browser, false);
    page.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1));
    setContentView(page);
    cookies.setCookie(origin, "paneboard_bridge=" + capability + "; Path=/; HttpOnly; SameSite=Strict", accepted -> {
      if (webView != browser) return;
      if (accepted) browser.loadUrl(origin + "/");
      else { closeWorkspace(); showError("未能設定本機連線驗證"); }
    });
  }

  private void closeWorkspace() {
    if (webView != null) {
      webView.stopLoading();
      webView.destroy();
      webView = null;
      WebStorage.getInstance().deleteOrigin(workspaceOrigin);
      CookieManager.getInstance().setCookie(workspaceOrigin, "paneboard_bridge=; Path=/; Max-Age=0", null);
      workspaceOrigin = "";
      if (!destroyed) setContentView(connectionView);
    }
    try { send(new JSONObject().put("Op", "close-workspace")); } catch (Exception ignored) {}
    if (workspace != null) workspace.setEnabled(test.isEnabled());
  }

  @Override public void onBackPressed() {
    if (webView != null) closeWorkspace();
    else super.onBackPressed();
  }

  private void authorize() {
    if (!authorizationUrl.isEmpty()) {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(authorizationUrl)));
    } else {
      try { send(new JSONObject().put("Op", "login")); status.setText("正在取得授權連結，稍後再按此掣開啟……"); }
      catch (Exception error) { showError("未能開始授權"); }
    }
  }

  private void send(JSONObject command) throws java.io.IOException {
    if (commands == null) throw new java.io.IOException("Core is not running");
    commands.write(command.toString() + "\n");
    commands.flush();
  }

  private void showError(String message) { results.append("\n錯誤：" + message); }

  private void stopCore() {
    closeWorkspace();
    if (core == null) return;
    final Process process = core;
    core = null;
    try { send(new JSONObject().put("Op", "stop")); commands.close(); } catch (Exception ignored) {}
    commands = null;
    authorizationUrl = "";
    stopping = true;
    start.setEnabled(false);
    new Thread(() -> {
      try { if (!process.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)) { process.destroyForcibly(); process.waitFor(); } }
      catch (Exception ignored) { process.destroyForcibly(); }
      runOnUiThread(() -> { stopping = false; if (!destroyed && core == null) start.setEnabled(true); });
    }).start();
    authorize.setEnabled(false);
    test.setEnabled(false);
    workspace.setEnabled(false);
    status.setText("連線已停止");
  }

  @Override protected void onDestroy() { destroyed = true; stopCore(); super.onDestroy(); }
}
