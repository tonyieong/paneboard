# Plugin panes

English | [繁體中文](plugin-panes.zh-TW.md)

A plugin pane is a self-contained private extension loaded from
`plugin-panes/`. Once a version of wps7 with plugin-pane support is
installed, adding or changing a pane does not require editing the application
source.

## Install location

When running from source, place panes under the repository's `plugin-panes/`
directory. For a packaged app, use `plugin-panes/` beside `wps7.exe`; this is
`dist/plugin-panes/` when running `dist/wps7.exe` from a source checkout.
Refresh the wps7 page after copying an HTML or host pane directory. AI pane
backends load at process startup, so restart wps7 after copying an AI pane
directory.

## Directory format

Each pane has its own directory. The directory name is its ID and must start
with a lowercase letter or number, followed only by lowercase letters, numbers,
`-`, or `_` (up to 64 characters):

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

`pane.json` supplies the sidebar name and entry page. `name` is required;
`entry` defaults to `index.html` when omitted:

```json
{
  "name": "Private",
  "entry": "index.html"
}
```

Keep scripts, styles, images, configuration, and pane-specific instructions in
the same directory and refer to assets with relative paths. An invalid
manifest or missing entry file causes wps7 to leave the pane out of the
sidebar.

Claude and Codex are fully self-contained AI plugins. Each provider's
directory contains its manifest, server implementation, browser renderer, and
styles. The directory name, `provider`, and `implementation` must match:

```json
{
  "name": "Claude",
  "type": "ai",
  "provider": "claude",
  "implementation": "claude",
  "icon": "ai"
}
```

An AI plugin is discovered from this manifest and the fixed `server.js`,
`client.js`, and `styles.css` files. wps7 does not contain a Claude/Codex asset
or backend registration list. Their complete plugin directories are tracked
with wps7; all other directories under `plugin-panes/` are ignored by Git so
private panes remain local.

The Whiteboard is a self-contained trusted host plugin. Host plugins use fixed
`client.js` and `styles.css` files and may keep browser assets below `assets/`:

```json
{
  "name": "Whiteboard",
  "type": "host",
  "icon": "line",
  "translations": { "zh-HK": "白板" },
  "legacy": { "paneType": "whiteboard", "dataField": "whiteboard" }
}
```

Host plugins register a renderer in `window.Wps7HostPanePlugins` and receive a
generic `saveData` callback. Their JSON data is persisted with the pane, so the
application does not need a plugin-specific route or state field. Optional
`translations` keep the plugin's own name local, while `legacy` migrates data
from an older built-in pane without teaching the application about that pane.

## Share a pane

Copy the whole pane directory to the same install location on another machine.
The receiving machine must run a compatible version of wps7 with plugin-pane
support. No application source changes are needed. Refresh after copying
`whiteboard/`. After copying `claude/` or `codex/`, restart wps7 and make sure
the matching CLI is installed and signed in.

Before sharing, remove passwords, tokens, personal data, and machine-specific
absolute paths. The source checkout ignores private directories under
`plugin-panes/`, so their files are not included in ordinary Git commits; do
not force-add them.

## Security boundary

HTML plugin panes run in a sandboxed iframe. They cannot read the main wps7
document, call the wps7 API, or connect to external services. This makes them
suitable for self-contained HTML, CSS, JavaScript, and bundled assets.
Functionality that needs host file access or a backend requires an explicit
application capability.

Host and AI plugins are different: host `client.js` runs in the main page, and
wps7 executes AI `server.js` with the same local permissions as the app. Only
copy either kind from someone you trust, and review its code before loading it.
