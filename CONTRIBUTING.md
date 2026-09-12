# Contributing to Paneboard

Security issues go through [SECURITY.md](SECURITY.md), never a public issue.
Paneboard hands out a shell, so a public report is a working exploit against every
running instance.

Taking part here means following the [Code of Conduct](CODE_OF_CONDUCT.md).

## Project layout

Paneboard is a Windows-focused Node.js terminal workspace. Server modules live in
`src/`, and `main.js` wires the Express and WebSocket routes. Browser code lives
in `public/`, tests in `test/`, install and packaging helpers in `scripts/`, and
bundled resources in `assets/`.

Treat `data/`, `dist/`, and `qa-backup-*` as generated output unless packaging
or migration is what you are working on.

## Development

```powershell
npm install
npm start          # serves http://127.0.0.1:5000
npm test           # full node:test suite
npm run lint       # ESLint; CI fails on errors, warnings are advisory
node --test test/terminal.test.js   # one file while iterating
```

Paneboard targets Windows and drives ConPTY through
`@homebridge/node-pty-prebuilt-multiarch`, so the terminal features cannot be
developed or tested on Linux or macOS.

If you already have Paneboard installed and starting at logon, do not develop against
that instance. Use a separate port and data directory so a crash in your build
cannot take down the one you rely on.

## Code style

CommonJS, two-space indentation, semicolons, single quotes. `camelCase` for
identifiers, `PascalCase` for constructors, kebab-case for CSS and data
attributes. Prefer native APIs over new dependencies, and do not reformat code
you are not otherwise changing.

`.gitattributes` pins line endings — LF for text, CRLF for Windows scripts. Do
not override it locally, or generated files will look modified when they are not.

## Frontend design language

Keep pane chrome compact. Use `--pane-toolbar-height` (currently `28px`) for
desktop titles and toolbars; mobile touch controls may be taller. Use the theme
tokens (`--surface-soft`, `--terminal-bg`, `--line`, `--accent`, `--accent-soft`)
rather than fixed colors. Active panes take an accent border; hover, selection
and pressed states use the soft accent.

Segoe UI for interface text, Cascadia Mono/Consolas for terminal content, paths,
titles and data. Reuse the single-stroke SVGs from `fileActionIcon()` and never
stack icons. Controls need visible focus, accessible names, and larger hit
targets on mobile.

User-facing copy says **Workspace**. `session` is internal legacy terminology.

## Tests

Use `node:test` with `node:assert/strict`, name files `*.test.js`, and test
observable behavior. For a bug fix, add the failing regression test first, then
make it pass. Frontend source-contract tests live in `test/frontend.test.js`.

For any UI change, verify it visually with a screenshot as well as with
assertions, and attach the screenshot to the pull request.

The suite does not exercise Express routing, so verify anything touching the
HTTP layer against a running server: `:param` routes, body parsing, status
codes, and the WebSocket upgrade.

Upgrading a native dependency needs `npm run package:win` and a run of the
resulting executable, not just a green suite. A packaged build unpacks its
native modules on first use, so give it several seconds before concluding that
a still-empty terminal pane is broken.

## Things that must keep working

- Every route rejects an untrusted `Host` header to block DNS rebinding, and
  WebSocket upgrades additionally require a same-origin `Origin`. A reverse
  proxy forwarding its own hostname needs that name in `server.allowed_hosts`,
  which is deliberately editable only in `config.toml`, never through the web UI.
- Errors must not reach Express's built-in handler, which renders stack traces —
  and absolute host paths — into the response. Log the detail, return a status.
- `StateStore.save()` writes atomically and keeps the previous copy as
  `state.json.bak`; `load()` falls back to it when `state.json` is unreadable.
- Never commit passwords, hashes, control tokens, logs, or a live `config.toml`.
  Document defaults in `config.example.toml` instead.

## Pull requests

Use short imperative commit subjects, for example `Fix mobile terminal
long-press selection`. In the description, explain the behavior change, how you
verified it, and whether it needs a config change or a restart.

Pushing to `main` runs CI on Windows: lint, the test suite, and a check that
`THIRD-PARTY-LICENSES.md` is current. If you add or upgrade a dependency, run
`npm run licenses:generate` and commit the regenerated file alongside it — the
packaged executable embeds every production dependency, so that file is how
their license notices reach the people who download a release.

If you update the embedded Node.js runtime or a pinned vendored asset, run
`npm run licenses:sync` first. It downloads the matching upstream license files
and verifies their SHA256 hashes before `licenses:generate` includes them.

The published history was rewritten once before this repository went public. Do
not rewrite it again; anything already pushed gets corrected with a new commit.
