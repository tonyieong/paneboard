<!--
Security fixes do not start here. Report them privately through SECURITY.md —
Paneboard serves a shell, so a public patch is a working exploit against every
running instance until people upgrade.
-->

## What changes

<!-- The behavior change, not a list of edited files. -->

## How it was verified

<!--
Say what you actually ran, not what should pass. CI runs lint and the suite on
Windows anyway; what matters here is the part CI cannot check.
-->

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] For a bug fix: a regression test that fails before the change
- [ ] For a UI change: a screenshot, attached below
- [ ] For an HTTP or WebSocket change: verified against a running server, since
      the suite does not exercise Express routing
- [ ] For a new or upgraded dependency: `npm run licenses:generate` run and
      `THIRD-PARTY-LICENSES.md` committed
- [ ] For a native dependency change: `npm run package:win` and the resulting
      executable actually launched

## Does it need a config change or a restart?

<!-- New config.toml keys, changed defaults, or a restart to take effect. -->

## Screenshots

<!-- Required for any UI change. Before and after, if the layout moved. -->
