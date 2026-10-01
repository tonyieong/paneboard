package app.paneboard.probe;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.Button;
import android.widget.CheckBox;
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
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import org.json.JSONObject;

/** Private Workspace client with a pinned, authenticated loopback adapter. */
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
  private TextView connectionHelp, fingerprintLabel;
  private SharedPreferences saved;
  private RadioGroup modes;
  private RadioButton tailscaleMode, directMode;
  private boolean pendingOpen;
  private boolean openAuthWhenReady;
  private boolean openingWorkspace;

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

  // Android 15 forces targetSdk 35 apps edge-to-edge, so the app opts in on
  // every API 30+ device and handles the system bars and keyboard itself. That
  // keeps one tested layout path instead of one per Android release.
  private void useEdgeToEdge() {
    if (android.os.Build.VERSION.SDK_INT < 30) return;
    getWindow().setDecorFitsSystemWindows(false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
  }

  private void useLightSystemBars(boolean light) {
    if (android.os.Build.VERSION.SDK_INT < 30) return;
    int flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    getWindow().getInsetsController().setSystemBarsAppearance(light ? flags : 0, flags);
  }

  // Keeps content clear of the system bars, the display cutout and the open
  // keyboard. Below API 30 the window still fits the bars and adjustResize
  // shrinks it for the keyboard, so only the base padding applies there.
  private void padForSystemInsets(View view, int left, int top, int right, int bottom) {
    view.setPadding(left, top, right, bottom);
    view.setOnApplyWindowInsetsListener((target, insets) -> {
      if (android.os.Build.VERSION.SDK_INT < 30) return insets;
      android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
      android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
      target.setPadding(left + bars.left, top + bars.top, right + bars.right, bottom + Math.max(bars.bottom, ime.bottom));
      // Consumed here so the WebView does not shrink a second time for them.
      return WindowInsets.CONSUMED;
    });
  }

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    useEdgeToEdge();
    ScrollView scroll = new ScrollView(this);
    connectionView = scroll;
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(0xfff4f6f8);
    LinearLayout body = new LinearLayout(this);
    body.setOrientation(LinearLayout.VERTICAL);
    body.setPadding(dp(24), dp(24), dp(24), dp(24));
    scroll.addView(body);
    padForSystemInsets(scroll, 0, 0, 0, 0);
    TextView title = text("Paneboard", 28);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    body.addView(title);
    body.addView(text("私人版 1.0 · Workspace 客戶端", 14));
    saved = getSharedPreferences("probe", MODE_PRIVATE);
    direct = saved.getBoolean("directConnection", false);
    body.addView(text("連線方式", 14));
    modes = new RadioGroup(this);
    tailscaleMode = new RadioButton(this);
    tailscaleMode.setId(View.generateViewId());
    tailscaleMode.setText("內置 Tailscale");
    tailscaleMode.setMinHeight(dp(48));
    modes.addView(tailscaleMode);
    directMode = new RadioButton(this);
    directMode.setId(View.generateViewId());
    directMode.setText("直接連線（唔使用內置 Tailscale）");
    directMode.setMinHeight(dp(48));
    modes.addView(directMode);
    modes.check(direct ? directMode.getId() : tailscaleMode.getId());
    body.addView(modes);
    connectionHelp = text("", 14);
    body.addView(connectionHelp);
    body.addView(text("伺服器網址（HTTPS，可自訂端口）", 14));
    endpoint = new EditText(this);
    endpoint.setSingleLine(true);
    endpoint.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
    endpoint.setHint("https://100.x.x.x:5023/");
    endpoint.setContentDescription("伺服器網址");
    body.addView(endpoint);
    fingerprintLabel = text("已核實嘅憑證 SHA-256", 14);
    body.addView(fingerprintLabel);
    fingerprint = new EditText(this);
    fingerprint.setTypeface(Typeface.MONOSPACE);
    fingerprint.setTextSize(12);
    fingerprint.setContentDescription("已核實嘅憑證 SHA-256");
    body.addView(fingerprint);
    loadProfile(true);
    button("匯入連線設定", body, view -> {
      Intent document = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      document.addCategory(Intent.CATEGORY_OPENABLE);
      document.setType("*/*");
      try { startActivityForResult(document, 1); }
      catch (Exception error) { showError("未能開啟檔案選擇器，可直接貼上網址及指紋。"); }
    });
    CheckBox automatic = new CheckBox(this);
    automatic.setText("開 App 時自動連線");
    automatic.setMinHeight(dp(48));
    automatic.setChecked(saved.getBoolean("autoConnect", false));
    automatic.setOnCheckedChangeListener((view, checked) -> saved.edit().putBoolean("autoConnect", checked).apply());
    body.addView(automatic);
    vpn = text("", 14);
    body.addView(vpn);
    status = text("尚未啟動連線", 17);
    body.addView(status);
    start = button("連線並開啟 Workspace", body, view -> connect());
    authorize = button("登入 Tailscale", body, view -> authorize());
    authorize.setEnabled(false);
    test = button("測試 HTTPS 及 WebSocket", body, view -> {
      if (fingerprint.getText().toString().trim().isEmpty()) {
        showError("未有憑證指紋。先按「連線並開啟 Workspace」確認一次伺服器憑證。");
        return;
      }
      try {
        saveProfile();
        results.setText(direct ? "正在測試，使用手機現有網絡……" : "正在測試，只會透過內嵌 Tailscale 連線……");
        send(new JSONObject().put("Op", "probe").put("URL", endpoint.getText().toString().trim()).put("Pin", fingerprint.getText().toString().trim()));
      } catch (Exception error) { showError("未能開始測試"); }
    });
    test.setEnabled(false);
    workspace = button("重新開啟 Workspace", body, view -> requestWorkspace());
    workspace.setEnabled(false);
    button("停止連線", body, view -> stopCore());
    results = text("測試結果會顯示喺呢度。", 14);
    results.setTextIsSelectable(true);
    body.addView(results);
    updateMode();
    modes.setOnCheckedChangeListener((group, checked) -> {
      saveProfile();
      stopCore();
      direct = checked == directMode.getId();
      saved.edit().putBoolean("directConnection", direct).apply();
      loadProfile(false);
      results.setText("連線方式已更改。請確認網址及憑證，再啟動連線。");
      updateMode();
    });
    setContentView(scroll);
    // The insets controller needs the decor view setContentView creates.
    useLightSystemBars(true);
    if (automatic.isChecked() && !endpoint.getText().toString().trim().isEmpty()) connect();
  }

  private String profileKey(String field) { return (direct ? "direct." : "tailscale.") + field; }

  private void saveProfile() {
    saved.edit().putString(profileKey("url"), endpoint.getText().toString().trim())
      .putString(profileKey("pin"), fingerprint.getText().toString().trim()).apply();
  }

  // A pin the user confirmed belongs to the address it was read from. Pointing
  // the profile at another server must ask again rather than fail on a pin
  // that was never meant for it. A pin typed or imported since then is the
  // user's own choice and is kept.
  private boolean needsCertificateConfirmation() {
    if (direct) return false;
    String url = endpoint.getText().toString().trim();
    String pin = fingerprint.getText().toString().trim();
    String confirmedFor = saved.getString(profileKey("pinUrl"), "");
    if (!confirmedFor.isEmpty() && !confirmedFor.equals(url) && pin.equals(saved.getString(profileKey("pinConfirmed"), ""))) {
      fingerprint.setText("");
      saved.edit().remove(profileKey("pinUrl")).remove(profileKey("pinConfirmed")).apply();
    }
    return fingerprint.getText().toString().trim().isEmpty();
  }

  private static String readableFingerprint(String hex) {
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < hex.length(); i += 2) {
      if (i > 0) out.append(':');
      out.append(hex.substring(i, i + 2).toUpperCase(java.util.Locale.ROOT));
    }
    return out.toString();
  }

  private void confirmCertificate(JSONObject offer) {
    final String url = offer.optString("url"), sha256 = offer.optString("sha256");
    if (!sha256.matches("[0-9a-f]{64}") || !url.equals(endpoint.getText().toString().trim())) {
      showError("收到非預期嘅憑證資料，已取消連線。");
      stopCore();
      return;
    }
    final String readable = readableFingerprint(sha256);
    new AlertDialog.Builder(this)
      .setTitle("確認伺服器憑證")
      .setMessage(url + "\n\nSHA-256\n" + readable
        + "\n\n第一次連去呢部伺服器。請同伺服器上顯示嘅指紋核對。確定後會永久保存；之後憑證有變，App 會拒絕連線。")
      .setCancelable(false)
      .setNegativeButton("取消", (dialog, which) -> {
        stopCore();
        results.setText("已取消連線，冇保存任何憑證。");
      })
      .setPositiveButton("確定", (dialog, which) -> {
        fingerprint.setText(readable);
        saveProfile();
        saved.edit().putString(profileKey("pinUrl"), url).putString(profileKey("pinConfirmed"), readable).apply();
        requestWorkspace();
      })
      .show();
  }

  private void loadProfile(boolean migrate) {
    endpoint.setText(saved.getString(profileKey("url"), migrate ? saved.getString("serverUrl", "") : ""));
    fingerprint.setText(saved.getString(profileKey("pin"), migrate ? saved.getString("certificateSha256", "") : ""));
  }

  private void connect() {
    if (stopping) return;
    if (endpoint.getText().toString().trim().isEmpty()) {
      showError("請輸入伺服器網址，或匯入連線設定。");
      return;
    }
    if (direct && fingerprint.getText().toString().trim().isEmpty()) {
      showError("直接連線需要已核實嘅憑證指紋，或匯入連線設定。");
      return;
    }
    saveProfile();
    pendingOpen = true;
    if (core == null) startCore();
    else if (workspace.isEnabled()) { pendingOpen = false; requestWorkspace(); }
  }

  private void requestWorkspace() {
    if (openingWorkspace) return;
    try {
      saveProfile();
      openingWorkspace = true;
      start.setEnabled(false);
      test.setEnabled(false);
      workspace.setEnabled(false);
      if (needsCertificateConfirmation()) {
        results.setText("正在讀取伺服器憑證，請稍候確認……");
        send(new JSONObject().put("Op", "fingerprint").put("URL", endpoint.getText().toString().trim()));
        return;
      }
      results.setText("正在核實伺服器憑證及連線，完成後會開啟 Workspace……");
      send(new JSONObject().put("Op", "workspace").put("URL", endpoint.getText().toString().trim()).put("Pin", fingerprint.getText().toString().trim()));
    } catch (Exception error) { stopCore(); showError("未能開啟 Workspace，請重新連線。"); }
  }

  @Override protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request != 1 || result != RESULT_OK || data == null || data.getData() == null) return;
    final Uri document = data.getData();
    new Thread(() -> {
      try (InputStream input = getContentResolver().openInputStream(document); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
        if (input == null) throw new java.io.IOException();
        byte[] buffer = new byte[1024];
        int count;
        while ((count = input.read(buffer)) != -1) {
          if (bytes.size() + count > 16384) throw new java.io.IOException();
          bytes.write(buffer, 0, count);
        }
        JSONObject profile = new JSONObject(new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8));
        String url = profile.getString("serverUrl").trim();
        String pin = profile.getString("certificateSha256").replace(":", "").replaceAll("\\s", "");
        String mode = profile.getString("mode");
        Uri server = Uri.parse(url);
        if ((!mode.equals("tailscale") && !mode.equals("direct")) || !"https".equals(server.getScheme()) || server.getHost() == null || server.getUserInfo() != null || !pin.matches("[0-9a-fA-F]{64}")) throw new IllegalArgumentException();
        runOnUiThread(() -> {
          if (destroyed) return;
          new AlertDialog.Builder(this).setTitle("確認連線設定來源")
            .setMessage(url + "\n\nSHA-256\n" + pin + "\n\n只匯入由你嘅伺服器可信渠道取得嘅設定。檔案本身唔代表憑證已可信。")
            .setNegativeButton("取消", null).setPositiveButton("確認並匯入", (dialog, which) -> {
              stopCore();
              modes.check(mode.equals("direct") ? directMode.getId() : tailscaleMode.getId());
              endpoint.setText(url);
              fingerprint.setText(pin);
              saveProfile();
              results.setText("設定已匯入。按「連線並開啟 Workspace」繼續。");
            }).show();
        });
      } catch (Exception error) { runOnUiThread(() -> { if (!destroyed) showError("設定檔無效。需要 mode、serverUrl 及 certificateSha256，大小不可超過 16 KB。"); }); }
    }, "paneboard-import").start();
  }

  private void updateMode() {
    connectionHelp.setText(direct
      ? "使用 Wi-Fi／流動網絡（包括系統已啟用嘅 VPN）。請填可直接到達嘅伺服器網址。"
      : "透過內置 Tailscale 連去你嘅私有網絡，唔需要系統 VPN。連線失敗唔會轉直連。");
    authorize.setVisibility(direct ? View.GONE : View.VISIBLE);
    fingerprintLabel.setText(direct ? "已核實嘅憑證 SHA-256" : "憑證 SHA-256（可留空，第一次連線時確認）");
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
    vpn.setText(activeVpn ? "系統 VPN：目前有連線（唔係本 App 建立）" : "系統 VPN：未偵測到連線");
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
            if (!destroyed && core == process) { closeWorkspace(); core = null; commands = null; pendingOpen = false; openingWorkspace = false; start.setEnabled(true); authorize.setEnabled(false); test.setEnabled(false); workspace.setEnabled(false); status.setText("連線核心已停止（" + code + "）"); }
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
        status.setText("需要授權：請按「登入 Tailscale」");
        if (openAuthWhenReady) { openAuthWhenReady = false; authorize(); }
      } else showError("收到非預期嘅授權網址，已阻止開啟");
    } else if (type.equals("state")) {
      boolean ready = direct ? value.equals("DirectReady") : value.equals("Running");
      status.setText(direct ? "直接連線已準備好（未驗證伺服器）" : "Tailscale：" + value);
      start.setEnabled(ready && !openingWorkspace);
      test.setEnabled(ready && !openingWorkspace);
      workspace.setEnabled(ready && !openingWorkspace);
      if (ready && pendingOpen) { pendingOpen = false; requestWorkspace(); }
      if (value.equals("Running")) authorizationUrl = "";
    } else if (type.equals("workspace")) {
      openingWorkspace = false;
      start.setEnabled(true);
      test.setEnabled(true);
      try { openWorkspace(new JSONObject(value)); }
      catch (Exception error) { closeWorkspace(); showError("未能建立 Workspace 畫面"); }
    } else if (type.equals("fingerprint")) {
      openingWorkspace = false;
      try { confirmCertificate(new JSONObject(value)); }
      catch (Exception error) { stopCore(); showError("未能讀取伺服器憑證"); }
    } else if (type.equals("result")) results.append("\n" + value);
    else if (type.equals("error")) {
      pendingOpen = false;
      if (openingWorkspace) { openingWorkspace = false; start.setEnabled(true); test.setEnabled(true); }
      workspace.setEnabled(test.isEnabled());
      showError(value.contains("Certificate fingerprint mismatch")
        ? "伺服器憑證同已保存嘅唔一樣，已阻止連線。如果你確定伺服器換咗憑證，清空指紋欄再連線就會重新確認。"
        : value);
    }
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
    // Matches the Workspace's dark ink, so the bars and the gap above the
    // keyboard do not flash the light connection-screen background.
    page.setBackgroundColor(0xff08131f);
    // No native toolbar: the Workspace gets the whole screen, and Back offers
    // reloading or returning to the connection settings instead.
    padForSystemInsets(page, 0, 0, 0, 0);
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
    useLightSystemBars(false);
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
      if (!destroyed) {
        setContentView(connectionView);
        useLightSystemBars(true);
      }
    }
    try { send(new JSONObject().put("Op", "close-workspace")); } catch (Exception ignored) {}
    if (workspace != null) workspace.setEnabled(test.isEnabled());
  }

  // Closing the Workspace clears its login, and a back gesture is easy to make
  // by accident, so leaving it is confirmed first. Back is also the only way
  // to reload, since the Workspace has no toolbar.
  @Override public void onBackPressed() {
    if (webView == null) {
      super.onBackPressed();
      return;
    }
    new AlertDialog.Builder(this)
      .setTitle("離開 Workspace？")
      .setMessage("離開會返去連線設定，並清除登入資料，返嚟時要重新登入。")
      .setNegativeButton("留低", null)
      .setNeutralButton("重新載入", (dialog, which) -> { if (webView != null) webView.reload(); })
      .setPositiveButton("離開", (dialog, which) -> closeWorkspace())
      .show();
  }

  private void authorize() {
    if (!authorizationUrl.isEmpty()) {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(authorizationUrl)));
    } else {
      try { openAuthWhenReady = true; send(new JSONObject().put("Op", "login")); status.setText("正在取得 Tailscale 登入連結……"); }
      catch (Exception error) { showError("未能開始授權"); }
    }
  }

  private void send(JSONObject command) throws java.io.IOException {
    if (commands == null) throw new java.io.IOException("Core is not running");
    commands.write(command.toString() + "\n");
    commands.flush();
  }

  private void showError(String message) {
    results.append("\n錯誤：" + message);
    if (webView == null) connectionView.post(() -> connectionView.smoothScrollTo(0, results.getBottom()));
  }

  private void stopCore() {
    pendingOpen = false;
    openingWorkspace = false;
    openAuthWhenReady = false;
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
