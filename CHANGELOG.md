# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-08-31

### Fixed

- Pane-tab moves keep the affected AI tab connected to its live runtime.
- Codex resumes route later prompts to the resumed runtime and keep retriable
  turns active until the CLI reports completion.

## [0.1.5] - 2026-08-23

### Added

- A "New AI" entry in the sidebar. The pane it opens talks to the Claude Code or
  Codex CLI already signed in on this machine and shows the conversation as
  messages rather than as terminal output: the agent's thinking and its tool
  calls each fold away behind a toggle, and when the agent asks for permission
  or asks you a question, its own options become buttons you can click. Like a
  PowerShell pane it holds several tabs, each one a separate conversation with
  its own CLI process, so a Claude conversation and a Codex one can sit side by
  side. Conversations survive a restart and reconnect to the CLI's own session,
  and each tab has a button that clears its history and starts the agent over.
- Separate "New Claude" and "New Codex" entries in the sidebar, so either CLI
  starts in one click the way PowerShell and CMD each have their own entry. A
  tab opened beside another continues with the same CLI.
- A working folder on each AI tab, shown in its toolbar and changed through a
  folder picker. The agent starts there and its commands run there, so you can
  point Claude at one repository and Codex at another in the same workspace.
  Changing it restarts that tab's CLI in the new folder and says so; the
  conversation is kept.
- An AI section in Settings for which CLI new tabs use, the model and effort
  they start with, and how much the agent asks before acting. Permission prompts
  are off by default: a terminal pane in the same workspace already runs any
  command you give it, so the AI pane is not handing out access that was not
  there already. The agent's own questions are always shown.

### Added

- Earlier conversations can be picked up again. Both CLIs keep every session on
  disk and both accept its id later, so a tab lists what its working folder has
  and continues the one you choose. What was on screen belonged to the
  conversation being left behind, so it is replaced by a line saying where the
  tab now is; the agent still holds the messages themselves.

### Fixed

- The slash command list only appeared after the first reply, and then showed
  eight entries out of sixty-five. The list was read from the init frame, which
  the CLI does not send until it has been given something to do; asking for it
  over the control channel answers straight away instead, and carries a
  description and an argument hint for each command. Every match is listed now,
  in a box that scrolls. The answer is remembered for the next tab, and while a
  tab is still waiting for its first one the menu says so rather than looking
  empty.
- Slash commands looked broken. Sending the text is the documented way to
  dispatch one, but only the commands a session lists in its init frame are
  dispatchable; the rest, `/plan` and `/status` among them, belong to the CLI's
  own terminal and reached the model as plain text, which answered that they
  were unavailable. Typing `/` now lists what the session actually reports,
  minus the entries it marks as terminal-bound, and a command that is not on it
  says so instead of being sent.
- An agent question offered only the options the model listed. AskUserQuestion
  always allows an answer in the user's own words and never lists that choice
  itself, so the pane now offers it too; Codex questions marked as free-form get
  the same box. The typed text is sent as the answer, not as a made-up option.
- An AI tab whose CLI stopped had nothing to press. It now shows a Retry beside
  the status, and the status itself is translated rather than left in English.
- The image pane's "Open image…" button did nothing. It sits inside the stage,
  which captures the pointer to pan the picture, and that capture retargeted the
  pointerup — and the click after it — to the stage, so the button never fired.
  Panning now leaves that button alone. The toolbar's Open button, outside the
  stage, was never affected.

## [0.1.4] - 2026-08-17

### Added

- A "New image" entry in the sidebar. The pane it opens browses for a picture on
  its own through a new Open image dialog — from the toolbar, from the empty
  state, or with the `O` key — instead of waiting for a file pane to hand it a
  path.

### Changed

- The file manager and notepad routes no longer refuse to run while
  `auth.password_hash` is empty. Without a password the server already refuses
  to bind anything but `127.0.0.1`, where it hands out an unauthenticated
  PowerShell session with the same filesystem access.

### Removed

- `file_manager.enabled`. It answered 404 on the file, notepad and image routes
  while the sidebar still offered those panes, the Settings dialog never exposed
  it, and every terminal pane kept full read/write access to the same files — so
  it took away no capability and only broke three buttons. An `enabled` key left
  in `config.toml` by an older build is ignored.

## [0.1.3] - 2026-08-16

### Added

- Exact, pinned license texts for the embedded Node.js 22.23.2 runtime, the
  vendored fonts under the SIL Open Font License 1.1, and Excalidraw's generated
  webpack notice.
- README examples showing independently resizable panes and the horizontally
  unbounded desktop board.

### Fixed

- Broken design-document images, the bug form's security-report link, and stray
  generation markers at the end of this changelog.

## [0.1.2] - 2026-08-16

### Added

- A "Usage pane" section in both READMEs and an entry in `SECURITY.md` stating
  that the pane reads the Codex and Claude Code OAuth tokens on the host, that it
  ships enabled, and that it falls back to searching the user profiles beside its
  own. The behaviour is unchanged; it was previously only implied by one line
  about running at logon.
- Screenshots in both READMEs.
- A `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), GitHub issue forms for bug
  reports and feature requests, and a pull request template. The issue chooser
  points security reports at the private advisory form instead of a public
  issue, and blank issues are turned off.
- `engines` and `os` fields in `package.json`, declaring the Node 22 floor that
  CI and the `pkg` target already assumed, and that wps7 is Windows-only.
  Repository, homepage, bugs, author, and keyword metadata as well.

### Changed

- The `LICENSE` copyright holder now reads `tonyieong`, matching the account
  that publishes the repository and releases.
- Wording that still described wps7 as a Windows service running under
  LocalSystem. `shell.extra_path` is documented against the real reason a folder
  goes missing — the PATH is the one inherited at logon — and the usage pane
  reports a CLI it cannot run as unavailable to "the account running wps7"
  instead of to a service account that no longer exists.

## [0.1.1] - 2026-08-15

### Added

- An image viewer pane.
- Notepad gains Notepad++-style editing, search, and document controls.
- The usage pane shows quota countdowns, threshold colours, and alerts, plus the
  Codex banked reset-credit count and its expiry.
- Workspace titles are ordered left to right and can be dragged to reorder.
- The PowerShell key toolbar takes chained keys, Alt/Shift, and lockable
  modifiers.
- `server.allowed_hosts` is editable from the Server section of Settings.
- `server.port` falls back to the next free port when the configured one is
  taken, instead of exiting. A port held by this same data directory's own
  running process still opens a browser tab at that instance and exits.
- Regression coverage for the Express and WebSocket layer (`http-routes.test.js`,
  against a real spawned server) and for the browser pane.

### Changed

- wps7 starts at logon instead of running as a Windows service. `npm run
  startup:install` now writes a `Startup\wps7.lnk` shortcut and needs no
  Administrator, no service account and no stored Windows password; it removes a
  service left by an earlier version, which is the one step that elevates. A
  service runs in session 0, where it has no interactive desktop and no access
  to the signed-in user's profile: GUI programs launched from a terminal pane
  were invisible, and the usage pane could not see the Codex or Claude Code
  logins. Running as the logged-in user removes all of that.
- The Codex and Claude Code home folders are found without configuration. The
  CLIs write their credentials under the profile of whoever signed in, so when
  wps7 runs as another account it now searches the profiles beside its own and
  takes the most recent login. `usage.codex_home` and `usage.claude_home` still
  pin a folder, but leaving them blank is the normal case.
- Packaging rewrites the PE subsystem of `dist/wps7.exe` from `console` to
  `windows`. pkg builds on a console-subsystem Node binary, so Explorer opened a
  console window that stayed for the life of the server.
- A tray that exits while the server is still running is relaunched after two
  seconds. The icon is the only way into a process with no console, so losing it
  left wps7 running and unreachable. Shutdown is exempt, and a tray that keeps
  dying immediately is given up on after five attempts rather than respawned
  forever; every step is in `data/runtime.log`.
- Tray diagnostics go to `data/runtime.log` instead of `console.error`. The
  packaged exe is on the windows subsystem and has no console, so a tray that
  died left no trace at all; its start, stderr, spawn failure and every exit are
  now recorded. A failed spawn also has an `error` handler, which previously
  reached the fatal handler and took the server down with it.
- The Settings dialog is rebuilt as compact, right-aligned setting rows.
- Light theme contrast and keyboard accessibility across pane controls and
  workspace tabs.

### Fixed

- Notepad pane settings reverted after Save/Apply.
- A brace in a typed command was read as key syntax by the PowerShell toolbar.
- The usage pane stayed readable when a provider rate limits the lookup.
- Sidebar pane tab labels, and the launcher's messages for a missing `wps7.exe`
  and a dismissed SmartScreen prompt.

### Removed

- The NSSM service stack: `scripts/install-nssm.ps1`,
  `scripts/control-wps7-service.ps1`, `scripts/wps7-tray-companion.ps1`, the
  `wps7-service-start` / `-restart` / `-stop` elevated tasks, the
  `npm run nssm:install` command, and the `WPS7_SERVICE_MANAGED` mode. The tray
  companion existed only because the service could not draw its own icon from
  session 0; `src/tray.js` shows it directly now. `npm run startup:uninstall`
  removes an existing service installation.
- `start-wps7.vbs`. Hiding the console window was the only thing it did, and the
  packaged exe no longer opens one. Double click `wps7.exe` instead.
- The `tools/` resource directory, which only ever held the downloaded
  `nssm.exe`. Packaging no longer copies it or embeds `tools/**/*`.
- `WPS7_HEADLESS`. NSSM set it because a service in session 0 cannot show a tray
  icon; with wps7 running at logon the tray always applies, so the server no
  longer reads the variable and `startTray()` is unconditional.
- The terminal backend and resize debounce settings, and both scrollback
  settings. Terminal history is no longer trimmed.

## [0.1.0] - 2026-08-08

First public release.

### Added

- MIT `LICENSE`, and `THIRD-PARTY-LICENSES.md` generated by
  `npm run licenses:generate` covering every production dependency embedded in
  `wps7.exe` plus the vendored front-end code and fonts.
- Per-directory license files under `public/vendor/`.
- `SECURITY.md` with a private vulnerability reporting channel and a list of
  known design limitations, `CONTRIBUTING.md`, and this changelog.
- A Traditional Chinese README.
- SHA256 pinning for the NSSM download in `scripts/install-nssm.ps1`.
- Origin validation on WebSocket upgrades, which closes a DNS rebinding path that
  let any web page reach a `127.0.0.1` instance running without a password.
- Rate limiting on `POST /api/login` and `POST /api/auth/hash`.
- Crash handlers that persist state and log before the process exits.
- GitHub Actions: CI runs lint and the test suite on Windows and fails when
  `THIRD-PARTY-LICENSES.md` is stale; a tagged release builds the executable,
  bundles the license notices, and publishes SHA256 checksums.
- Dependabot for npm and GitHub Actions updates.
- ESLint with a flat config tuned to the conventions already in the codebase.

### Changed

- `StateStore.save()` writes to a temporary file, fsyncs, and renames over the
  target, keeping the previous file as `state.json.bak`. An interrupted save no
  longer truncates the workspace state.
- Packaging moved from the archived `vercel/pkg` to `@yao-pkg/pkg`, and the
  bundled runtime moved from Node 18 (end of life) to Node 22. node-pty builds
  against Node-API, so the ConPTY addon is ABI-stable across that jump.
- Dependencies: express 4 to 5.2.1, ws to 8.21.3, and node-pty to 0.14.1. The
  express upgrade was verified against the live server, covering `:param`
  routes, JSON body parsing, static files, status codes and the WebSocket
  upgrade path, because its rewritten path-to-regexp is the usual breaking
  change and the unit suite does not exercise routing. node-pty was verified by
  driving a real ConPTY session in the packaged executable.
- The release notes and both READMEs name the asset to download. The
  GitHub-generated "Source code" archives contain no `wps7.exe`, and extracting
  the release zip is required before running anything from it.
- `.gitattributes` pins line endings, and the workflow actions moved to v7.

### Security

- Request errors no longer fall through to Express's built-in handler, which
  rendered the stack trace — including this machine's absolute paths — into the
  response body. A malformed JSON body was enough to trigger it. The detail now
  goes to `data/runtime.log` and the caller gets only a status and a short
  message. This affected express 4 as well; it was found while verifying the
  upgrade.

### Removed

- `nssm.exe` and a stray `tray_windows_release.exe` from version control. NSSM is
  now downloaded and hash-verified at install time.

[Unreleased]: https://github.com/tonyieong/wps7/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/tonyieong/wps7/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/tonyieong/wps7/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/tonyieong/wps7/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/tonyieong/wps7/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/tonyieong/wps7/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/tonyieong/wps7/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tonyieong/wps7/releases/tag/v0.1.0
