# Paneboard

English | [繁體中文](README.zh-TW.md)

Previously named WPS7. New packages use `paneboard.exe`; keep `config.toml`,
`data/`, and private `plugin-panes/` beside it when upgrading. Browser preferences,
saved theme selections, and existing plugin registration names remain compatible.
Run `npm run startup:repair` from the new installation to update its logon shortcut.
The GitHub repository URL retains its existing name.

Portable Windows and Linux web terminal workspace inspired by `tmux-continuum`. It serves
PowerShell (or, on Linux, bash) sessions, a file manager, a notepad, a browser pane, an image viewer,
and a whiteboard to any browser on your machine, and rebuilds the layout after a
reboot.

> [!WARNING]
> **Paneboard gives a web browser access to PowerShell and to your file system.**
> Anyone who can reach the listening port and pass authentication can run
> arbitrary commands as the account running the server.
>
> The default configuration binds to `127.0.0.1` with no password, which is
> intended for single-user desktop use. **Before changing `server.host` to
> `0.0.0.0`, set a strong password** — the installer refuses to expose Paneboard on a
> LAN without `auth.password_hash` for this reason.
>
> There is no TLS. On a LAN, the password, the session token, and all terminal
> output travel unencrypted. For anything beyond a trusted network, put Paneboard
> behind a reverse proxy that terminates TLS. See [SECURITY.md](SECURITY.md).

Screenshots below use sample workspace content.

![A Paneboard workspace with PowerShell and project notes side by side](docs/screenshots/workspace.png)

## A workspace that fits the task

Every pane can be moved and resized independently on a configurable grid. Make
a terminal wide, stack a file manager above your notes, or give the whiteboard
the whole height; Paneboard preserves the layout and each pane's working directory.

![Terminal and notepad panes arranged at different widths and heights](docs/screenshots/resizable-panes.png)

The desktop board has no fixed right edge. Add or move panes farther right and
the workspace keeps extending horizontally; the bottom scrollbar takes you
between groups without shrinking the panes you already arranged.

![The same workspace scrolled horizontally to panes farther to the right](docs/screenshots/horizontal-workspace.png)

On a phone, the same workspace shows one pane at a time, with a key bar for the
keys a touch keyboard does not have:

<img src="docs/screenshots/mobile.png" alt="The same workspace on a phone: the PowerShell pane full screen above a key bar with Esc, Tab, Ctrl, Alt and Shift" width="280">

## Where to run it

**On your own machine.** Leave the default `127.0.0.1` and use Paneboard as a local
workbench: terminals, files, notes, and the whiteboard in a browser tab, with
the layout restored after every reboot. Nothing leaves the machine.

**On an always-on machine, reached over a VPN.** Run Paneboard on the box that holds
your projects and your CLI logins — a home server, a spare desktop, a Windows
VM — and join that box to a private network (WireGuard, Tailscale, a company
VPN). Every other device then opens the same workspace in a browser: a laptop,
a tablet, or a phone can drive the Codex and Claude Code sessions running there,
watch a long build finish, and browse the file system, with nothing to install
on the client.

The VPN supplies what Paneboard does not. There is no TLS, so the tunnel is what
encrypts the traffic, and the private network is what decides who can reach the
port at all. Set `server.host = "0.0.0.0"` so the VPN interface is covered —
`127.0.0.1` and `0.0.0.0` are the only values Paneboard accepts — **set a strong
password**, and keep the port closed on every interface facing the internet.
Reaching the machine by its VPN address works as is; a hostname, such as a
Tailscale MagicDNS name, has to be listed in `server.allowed_hosts` or the
`Host` check rejects it.

## Download

Take `paneboard-<version>-windows-x64.zip` from the [releases page](../../releases).
The "Source code" archives GitHub generates beside it hold the source tree only,
without `paneboard.exe`.

Extract the zip to a folder, then double click `paneboard.exe`. Opening anything
inside the Windows zip viewer unpacks that one file to a temp directory and
leaves the rest in the archive.

Paneboard is not code signed, so SmartScreen warns the first time a downloaded build
runs. Compare the SHA256 with `SHA256SUMS.txt`, then clear the download mark
before extracting — right click the zip, open Properties, tick Unblock, press OK.
Otherwise start `paneboard.exe` once yourself and choose "More info" then "Run
anyway"; dismissing that prompt is what makes the launcher report `800704C7`.

## Run from source

```powershell
npm install
npm start
```

The app creates `config.toml`, `data/state.json`, and opens `http://127.0.0.1:5000`.

When running the packaged app, `config.toml`, `data/`, and logs live beside the packaged executable.

## Start at logon

To start Paneboard whenever you log in:

```powershell
npm run startup:install
```

This creates `Startup\paneboard.lnk` pointing at `paneboard.exe`. Paneboard then runs as you, in your own session, and shows its tray icon there.

Running in your session is what makes the rest work: a GUI program started from a terminal pane appears on your desktop, your mapped drives and environment are the ones panes inherit, and the usage pane finds the Codex and Claude Code logins in your profile. A Windows service cannot do any of that, because services run in session 0 with no interactive desktop and under their own account.

Nothing here needs Administrator. Installing asks for elevation only in two cases: to remove a service installed by an earlier version, and to open a firewall port when `server.host = "0.0.0.0"`.

The tray icon exposes Open Web UI, Save Now, Restart Paneboard, View Logs, Diagnostics, and Exit. Exit saves state and stops the server.

If the icon disappears while Paneboard is still running, it is relaunched a couple of seconds later; a tray that fails to start five times in a row is given up on. `data/runtime.log` records each attempt.

If you set `server.host = "0.0.0.0"` for LAN access, configure a strong web password first. The installer refuses to expose Paneboard on the LAN without `auth.password_hash` because the app provides browser access to PowerShell.

To remove the startup shortcut, and any leftovers from an older service install:

```powershell
npm run startup:uninstall
```

## Package

```powershell
npm run package:win
```

The packaged executable is written to `dist/paneboard.exe`. pkg builds on a
console-subsystem Node binary, which would give the server a console window for
as long as it runs, so packaging rewrites the PE subsystem to `windows`. Double
clicking `dist/paneboard.exe` starts it with no console.

## Linux server

Paneboard also runs on a Linux server (tested on Fedora 44, x86-64) with Node.js 22:

```sh
npm install
npm start
```

Terminal panes start `bash -l`; change `shell.preferred`, `shell.fallback` and `shell.args` to use another shell. There are no CMD panes, file panes browse from `/` and your home folder, and downloading a folder needs the `zip` command. Browser panes need Google Chrome or Chromium (for example `sudo dnf install chromium`). There is no tray icon: Paneboard runs as a background service.

To build a single executable and run it as a systemd user service, from the project folder on the Linux machine:

```sh
npm run package:linux
sh dist-linux/scripts/install-paneboard-service.sh
```

The installer writes `~/.config/systemd/user/paneboard.service`, starts it, and enables lingering so it keeps running after you log out. It records the current `PATH`, so run it from a shell where `claude` and `codex` are found. Run it again after moving the folder. Restarting from the web UI hands the restart to systemd; `systemctl --user stop paneboard` saves the workspace first. `sh dist-linux/scripts/uninstall-paneboard-service.sh` removes the service and leaves `data/` alone.

## Plugin panes

Plugin panes are self-contained private extensions that can be installed or
shared without editing the application source. See [Plugin panes](docs/plugin-panes.md)
for the directory format, manifest, installation steps, and sandbox limits.

## Restore model

Windows cannot resume arbitrary process memory after reboot. Paneboard saves sessions, panes, cwd metadata, terminal scrollback, and the last command hint. On restart it recreates panes and automatically reruns only commands in `restore.allowlist`.

## PowerShell

Paneboard prefers `pwsh.exe` and falls back to `powershell.exe`. If fallback is used, the web UI shows a PowerShell 7 install warning.

## AI pane

The AI pane drives the Claude Code or Codex CLI already signed in on this
machine and renders the conversation as messages instead of terminal output.
The agent's thinking and its tool calls each fold away behind a toggle, and when
it asks for permission or asks you a question, the options it offers become
buttons — the same choices its own prompt would have shown, not a generic
yes/no.

Typing `/` lists the slash commands this CLI can actually run, with what each
one does and the arguments it takes — the session reports them itself, so it
covers your own skills and commands as well as the built-in `/compact`,
`/context` and `/model`. The hint matters: `/model` and `/effort` change the
session only when given a value, as in `/model haiku` or `/effort high`, and on
their own they do nothing at all here because they would open a picker the
terminal draws. Commands whose behaviour belongs
to the CLI's own terminal, such as `/plan` and `/status`, are not dispatchable
outside it: they are left out of the list, and typing one says so rather than
sending it and letting the model answer that it is unavailable. Codex publishes
no such list, so its tabs offer no completions.

The sidebar has an entry for each CLI, so a Claude or a Codex pane is one
click away. Like a PowerShell pane it holds several tabs, and each tab is a
separate conversation with its own CLI process; a tab opened beside another
continues with the same CLI, so one pane can hold several Claude conversations
and the next pane can hold Codex.

Each tab also has its own working folder, shown in the toolbar next to the CLI
name. The agent starts there and runs its commands there, so one tab can be
pointed at a repository and another at somewhere else entirely. Click the
folder to browse for a different one; that restarts the tab's CLI in the new
folder, keeping the conversation.

Conversations are saved with the workspace and reconnect to the CLI's own
session, so a restart picks up where you left off. Each tab has a Clear button
that deletes its messages and starts the agent over with no memory of them.

The clock button lists the conversations the CLI has already recorded for that
folder — including ones started in a terminal, or ones this pane has since
forgotten — and continuing one hands the tab back to it. `/resume` itself is
not dispatchable outside the CLI's own terminal, which is why the pane offers
the list instead. The messages from before stay with the agent rather than
being redrawn here, so the tab shows a line saying which conversation it is now
following and then carries on.

When the agent asks you something, its own options become buttons, plus an
"Other" that takes an answer in your own words — the CLIs always accept one and
never list it themselves. If a CLI stops, the tab says so and offers a Retry.

Permission prompts are off by default. That is deliberate: a terminal pane in
the same workspace already runs any command you type, so the AI pane is not
granting access that was not there already — what guards it is the password and
`server.allowed_hosts`, which matter more than usual when `server.host` is
`0.0.0.0`. Settings exposes each provider's extra CLI arguments directly. The
defaults launch Claude Code with `--permission-mode bypassPermissions
--allow-dangerously-skip-permissions` and Codex as `codex --yolo app-server`;
remove or replace those arguments if you want the CLIs to ask for permission.
The agent's own questions are always shown either way. New arguments apply when
a new AI tab starts.

The pane needs the CLI on the PATH Paneboard inherited at logon; if `claude` or
`codex` lives in npm's global folder and the pane cannot find it, add that
folder to `shell.extra_path` in `config.toml`.

## Usage pane

The usage pane shows how much of your Codex, Claude Code, and MiniMax quota is
left. It reads those figures on the machine running Paneboard, from credentials those
tools have already written there:

- `%USERPROFILE%\.codex\auth.json` — the Codex OAuth access token.
- `%USERPROFILE%\.claude\.credentials.json` — the Claude Code OAuth access token.
- `usage.minimax_api_key` in `config.toml`, or `MINIMAX_CODING_API_KEY` /
  `MINIMAX_API_KEY` from the environment.

Each token is sent only to the provider it belongs to, and only to read quota.
None of them is stored in `data/state.json`; `data/runtime.log` records a token's
length, never the token.

When Paneboard's own profile has no such credentials, the lookup **searches the other
user profiles beside it** and takes the most recent login. On a shared machine
that means Paneboard can report another account's quota, if the account running Paneboard
is allowed to read that profile. Pin one folder with `usage.codex_home` and
`usage.claude_home`, or turn a provider off with `usage.show_codex`,
`show_claude`, or `show_minimax`. All three ship enabled.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and the
repository conventions. Report security issues privately through the process in
[SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

Paneboard redistributes third-party code: the packaged executable embeds every
production dependency, while `public/vendor/` and tracked plugin folders ship
pre-built Excalidraw, React, and xterm.js with their fonts. Their notices are collected in
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md), regenerated with
`npm run licenses:generate`. Pinned upstream license files can be refreshed and
hash-verified first with `npm run licenses:sync`.

## Acknowledgements

- [Excalidraw](https://github.com/excalidraw/excalidraw) powers the whiteboard pane.
- [xterm.js](https://github.com/xtermjs/xterm.js) powers the terminal panes.
- [CodexBar](https://github.com/steipete/CodexBar) inspired the usage pane.
