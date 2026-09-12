# Security Policy

## What Paneboard exposes

Paneboard serves an interactive PowerShell session and a file manager over HTTP. Anyone
who can reach the listening port and pass authentication can run arbitrary commands
and read or write files as the account running the server. Treat a Paneboard endpoint
with the same care as an SSH endpoint.

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability**
button on the Security tab of this repository. That opens a private advisory only
the maintainers can read.

Do not open a public issue for a vulnerability. Because this project hands out a
shell, a public report is a working exploit for every running instance.

Expect an acknowledgement within 7 days and a status update within 30 days.

## Known limitations

These are documented design gaps, not new findings. Reports about them are welcome
only if you have a concrete exploitation path beyond what is described here.

- **No TLS.** Traffic is plain HTTP. Over a LAN the password, the session token,
  and all terminal output travel unencrypted. Put Paneboard behind a reverse proxy that
  terminates TLS, or keep it bound to `127.0.0.1`.
- **Session tokens can be passed in the query string.** They therefore appear in
  proxy and server access logs. `Authorization: Bearer` is supported and preferred.
- **The session HMAC secret is derived from `auth.password_hash`.** Any read of
  `config.toml` yields the ability to mint tokens until the password changes.
- **Tokens cannot be revoked individually.** Changing the password invalidates all
  of them at once; there is no per-session logout across devices.
- **`127.0.0.1` with an empty `auth.password_hash` requires no login.** This is the
  default for a fresh install and is intended for single-user desktop use. The
  file manager and notepad routes are reachable in that state too, and there is
  no switch that turns them off: the terminal pane reads and writes the same
  files with the same account either way.
- **The usage pane reads the AI CLI credentials on the host.** It loads the OAuth
  access tokens from `.codex\auth.json` and `.claude\.credentials.json` to read
  plan quota, and it is enabled by default. When Paneboard's own profile holds neither
  file, the lookup searches the user profiles beside it and takes the most recent
  login, so on a multi-user machine Paneboard may read another account's credentials
  if the account running Paneboard has permission to. The tokens go only to their own
  provider and are never persisted or logged, but anyone with access to the web UI
  learns that those accounts exist and what quota they have left. Set
  `usage.show_codex` and `usage.show_claude` to `false`, or pin `usage.codex_home`
  and `usage.claude_home`, to prevent the search.

## Supported versions

Only the latest release receives security fixes.
