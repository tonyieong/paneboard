# Android embedded Tailscale investigation

Dates: 2026-09-13–14. This is a feasibility investigation, not a working Android client.

## Existing implementation

[0xKrito/tailscale-socks5-Android](https://github.com/0xKrito/tailscale-socks5-Android),
inspected at `c796e819359584cd31adec19de10aecd41783379`, embeds tsnet behind a
loopback SOCKS5 listener. Its manifest and Kotlin service use an ordinary
foreground `Service`, not `VpnService`. It still displays an app notification.
Its Go bridge exposes start/stop, login URL and status methods through gomobile.

The inspected revision uses Go 1.26.5 and Tailscale 1.102.2 (the README's
Go 1.24 minimum is stale). `tsproxy/setup.go` registers an alternative interface
getter using `anet`; the build attempts to patch the Android executable-path fallback.
The README's description of patching netmon directly differs from the current code.

A local assertion against the downloaded pinned Tailscale source confirmed that
the patch searches for `case "ios":`, but the source contains
`case "ios", "darwin":`. That substitution therefore does not add the Android
fallback. This is a verified patch mismatch, not proof of an Android runtime crash.

Do not import the whole app unreviewed: startup runs asynchronously before its
`running` flag is set, while stop returns early until the server is published.
This suggests a start/stop race requiring a targeted runtime test. The sample also
offers unrestricted proxy destinations, unnecessary for a single-server client.

## Platform evidence and proposed direction

[Official tsnet documentation](https://tailscale.com/docs/features/tsnet) describes
an embedded userspace Tailscale node. Based on that architecture and the reference
manifest, a client without `VpnService` should not create an Android system VPN
connection. This remains an inference until verified on a device. An already
running official Tailscale VPN would still have its own system indicator.

[Tailscale issue 17311](https://github.com/tailscale/tailscale/issues/17311) reports
Android 16 initialization failing with `netlinkrib: permission denied` when using
tsnet 1.88.2. Android interface enumeration must therefore be verified with the
chosen current library/version, not assumed to work from a desktop build.

First prototype candidate: WebView retains the remote Paneboard URL, and its TCP
traffic goes through an app-local proxy backed by `tsnet.Server.Dial`.
[AndroidX ProxyController](https://developer.android.com/reference/androidx/webkit/ProxyController)
provides a WebView proxy override; check feature support and wait for its callback
before loading. HTTP, WebSocket, DNS and failure behavior still need device tests.
Do not silently fall back to a direct connection when the tunnel is unavailable.

Keep the proxy loopback-only and destination-restricted. Loopback alone does not
authenticate other local apps. Preserve Paneboard login and host/origin protection;
do not add wildcard allowed hosts or delete Origin headers to make it connect.
Store node credentials in app-private storage and exclude them from backup/logs.

## Verification scope

`test/request-guard.test.js` now exercises Tailscale IPv4/IPv6 literals, explicit
MagicDNS allowlisting, and rejection of a localhost Origin against a tailnet Host.
These are server guard unit tests, not an Android or tailnet connection test.

Local results:

- Android arm64 Go package cross-compilation succeeded (exit 0), using portable
  Go 1.27.1 and the reference's pinned Tailscale 1.102.2:
  `GOOS=android GOARCH=arm64 CGO_ENABLED=0 go build -p=4 ./mobile`.
  The reference source was not patched for this check. This compiles Go packages
  only; it does not link JNI, build a gomobile AAR/APK, run Android initialization,
  or validate the VPN indicator. Initial incomplete-toolchain attempts and short
  compile timeouts were superseded by this successful cached build.
- Focused `node --test test/request-guard.test.js`: 8 passed, 0 failed.
- One `npm test` run reported 603 tests: 583 passed, 20 failed. Nineteen HTTP
  cases inherited `Server did not respond within 20000ms`; the ConPTY foreground
  process assertion also failed. Its stuck test process was interrupted, so this
  run is not a clean baseline or a green verification.
- A subsequent `npm test -- --test-timeout=120000 test/*.test.js` run was stopped
  at the outer 180-second limit without a final test summary. Do not infer success.
- The September 14 retry passed the HTTP app shell, login, file operations and
  authenticated WebSocket/cross-origin checks. Duplicate-launch and HTTPS tests
  failed, and the overall run again exceeded 180 seconds. These localhost tests
  do not exercise an Android device or an embedded tailnet connection.
- Explicit source-directory ESLint invocation passed. Running lint concurrently
  with HTTP tests hit an ENOENT for a temporary plugin fixture. The later explicit
  source-directory invocation passed again; the whole-tree lint retry timed out.

Two leftover generated plugin fixtures from an interrupted test were moved out
of `plugin-panes/` into ignored `output/node_modules/aborted-test-fixtures/`.

Production source and npm dependencies were not changed. No APK has been built
or installed, and no end-to-end tailnet connection has been tested.

No Android SDK, NDK, Java, Gradle or ADB was available on PATH at inspection time.
Research checkout and portable tools are isolated under ignored `output/`;
the toolchain lives under `output/node_modules/` to avoid Node test discovery.
No third-party APK was installed and no Tailscale account was authorized.

Before calling the Android client viable, verify on an authorized test device:

1. Build/install our minimal APK and initialize tsnet without netlink errors.
2. Complete browser authorization once; cold-launch again with persisted identity.
3. With the official Tailscale app disconnected by the user, verify remote HTTP,
   authenticated WebSocket terminal input/output, uploads and downloads.
4. Confirm no system VPN connection is created; distinguish app notifications.
5. Test Wi-Fi/mobile switching, airplane mode, process death, start/stop races,
   expired authorization and coexistence with another VPN.

Use only the designated test server port, 5022. Do not touch production runtimes.
