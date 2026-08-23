# 插件窗格

[English](plugin-panes.md) | 繁體中文

插件窗格是從 `plugin-panes/` 載入的獨立私人擴充。安裝支援插件窗格的 wps7 版本後，
新增或修改窗格都不需要再改應用程式原始碼。

## 安裝位置

從原始碼執行時，請把窗格放在 repository 的 `plugin-panes/`。執行打包後的版本時，請使用
`wps7.exe` 旁邊的 `plugin-panes/`；若從原始碼 checkout 執行 `dist/wps7.exe`，
實際位置就是 `dist/plugin-panes/`。HTML 或 host pane 複製完成後重新整理 wps7 頁面就會
出現在側邊欄；AI pane backend 會在 process 啟動時載入，所以複製 AI pane 後要重新啟動 wps7。

## 資料夾格式

每個窗格各有一個資料夾。資料夾名稱就是窗格 ID，必須以小寫英文字母或數字開頭，
其餘字元只可使用小寫英文字母、數字、`-` 或 `_`，長度最多 64 個字元：

```text
plugin-panes/
├── claude/
│   ├── pane.json
│   ├── server.js
│   ├── client.js
│   └── styles.css
├── codex/
│   ├── pane.json
│   ├── server.js
│   ├── client.js
│   └── styles.css
├── whiteboard/
│   ├── pane.json
│   ├── client.js
│   ├── styles.css
│   └── assets/
└── private-pane/
    ├── README.md
    ├── pane.json
    ├── index.html
    ├── config.js
    ├── app.js
    ├── styles.css
    └── assets/
```

`pane.json` 指定側邊欄名稱與入口頁面。`name` 是必填項目；省略 `entry` 時預設使用
`index.html`：

```json
{
  "name": "Private",
  "entry": "index.html"
}
```

請把指令碼、樣式、圖片、設定與窗格專用說明放在同一個資料夾內，並使用相對路徑引用
資源。manifest 無效或入口檔案不存在時，wps7 不會在側邊欄列出該窗格。

Claude 與 Codex 是完全獨立的 AI 插件。每個 provider 資料夾都包含 manifest、server、
瀏覽器 renderer 與 styles；資料夾名稱、`provider` 同 `implementation` 必須相同：

```json
{
  "name": "Claude",
  "type": "ai",
  "provider": "claude",
  "implementation": "claude",
  "icon": "ai"
}
```

AI plugin 會從 manifest 以及固定名稱嘅 `server.js`、`client.js`、`styles.css` 自動發現；
wps7 本身冇硬編碼 Claude/Codex asset 或 backend registration list。這兩個完整 plugin
資料夾會跟隨 wps7 一同納入 Git；`plugin-panes/` 內其他資料夾全部由 Git 忽略，私人窗格
會留在本機。

白板係完全自包含嘅 trusted host plugin。Host plugin 使用固定嘅 `client.js` 同
`styles.css`，browser assets 可以全部放喺 `assets/`：

```json
{
  "name": "Whiteboard",
  "type": "host",
  "icon": "line",
  "translations": { "zh-HK": "白板" },
  "legacy": { "paneType": "whiteboard", "dataField": "whiteboard" }
}
```

Host plugin 會喺 `window.Wps7HostPanePlugins` 註冊 renderer，並取得通用 `saveData`
callback。JSON data 會跟 pane 一齊保存，App 毋須加入 plugin 專用 route 或 state field。
可選嘅 `translations` 會保留 plugin 自己嘅本地化名稱；`legacy` 就可以遷移舊 built-in
pane data，而毋須令 App 認識該 pane。

## 分享窗格

把整個窗格資料夾複製到另一台電腦的相同安裝位置即可。接收方必須使用相容而且支援
插件窗格的 wps7 版本，不需要修改任何應用程式原始碼。複製 `whiteboard/` 後重新整理
頁面即可；複製 `claude/` 或 `codex/` 後要重新啟動 wps7，亦要先安裝並登入相應 CLI。

分享前請移除密碼、權杖、個人資料，以及只適用於某台電腦的絕對路徑。原始碼 checkout
預設忽略 `plugin-panes/` 內的私人資料夾，所以一般 Git commit 不會包含插件窗格檔案；
請勿強制加入這些檔案。

## 安全邊界

HTML 插件窗格在沙箱 iframe 中執行，不能讀取 wps7 主文件、呼叫 wps7 API，亦不能連接
外部服務。因此它適合使用自包含的 HTML、CSS、JavaScript 與隨附資源；若功能需要存取
主機檔案或後端，便必須在應用程式中明確加入相應能力。

Host plugin 同 AI plugin 並非普通 iframe sandbox：host `client.js` 會喺主頁執行，而
wps7 會用同 App 一樣嘅本機權限執行 AI plugin 嘅 `server.js`。只可複製來自可信來源嘅
folder，載入前亦應先檢查內容。
