# Paneboard Android Workspace development client

This is an **arm64 development build**, not a production Android release. It offers
an app-owned tsnet connection or a direct connection through Android's network.
Neither mode creates an Android `VpnService`.
The Go PIE executable is packaged in the APK's extracted native-library directory
and started under the app UID. The Activity controls it through private pipes.
The Workspace WebView uses an ephemeral IPv4 loopback HTTP adapter; every request
requires a random 256-bit capability set privately as an HttpOnly, SameSite=Strict
cookie. It is not an open forward proxy. Only the configured HTTPS target
is reachable, through the selected transport and the verified certificate pin.

## Connection modes

- **Embedded Tailscale:** starts the private tsnet node and uses only its dialer.
  Requires a Tailscale IP. Tunnel failure never falls back to Android's network.
- **Direct:** does not initialize tsnet or contact its login/control service.
  Uses Android's existing network routes, including any user-enabled system VPN.
  Accepts a reachable server IP or hostname; a tailnet-only address still needs
  an existing route, so selecting Direct does not make it publicly reachable.

The mode is remembered. Changing it closes the Workspace and stops the previous
core before another can start. Review the shared server address and certificate
when switching. Both modes currently require HTTPS, a verified leaf pin, and the
authorized test ports 5001 or 5023. Broader endpoint configuration, easier verified
certificate onboarding, release signing and distribution remain follow-up work.

## Build

All tools, caches, signing keys and output stay inside the workspace. The current
Windows script uses portable Go 1.27.1, JDK 17, Android platform 35 and build-tools
35.0.0. Place these in `output/node_modules/android-toolchain/` and
`output/node_modules/android-sdk-tools/`, then run:

```powershell
./android/probe/build.ps1
```

The result is `output/node_modules/android-probe-build/paneboard-probe.apk`.
The build bundles Go/module license texts inside the APK. It does not build,
deploy, restart or modify the Windows server. Do not distribute the debug signing
key or treat this APK as a production release.

## Device checks

1. Install the APK (manual installation is possible if USB installation is blocked).
2. Select a connection mode. Enter the authorized HTTPS IP/hostname and port, and independently verified
   SHA-256 leaf certificate fingerprint. This probe only permits ports **5001**
   and **5023**. Port 5022 is reserved for the isolated USB debugging server.
3. Start the connection. In Tailscale mode, use the authorization button if needed
   and complete sign-in in the phone's browser. Direct mode has no authorization button.
4. Once Running or Direct Ready appears, run the HTTPS/WebSocket test. Readiness
   alone does not prove that the server is reachable. The test requests only
   `/api/config` and an unauthenticated WebSocket handshake. Expected close code
   1008 proves authentication rejection; it does **not** test terminal I/O.
5. Open Workspace and use the normal Paneboard login page. The adapter preserves
   bearer authentication, validates the local Host/Origin before mapping to the
   upstream authority, strips its own capability and blocks external redirects.
   Return to connection settings to close the adapter and clear that WebView
   origin's stored login data. Reopening can require another Paneboard login.
6. With the user's permission, disconnect any existing system VPN and repeat.
   The VPN status label checks Android's network capabilities; verify Android's
   system UI too. Never claim an existing VPN belongs to this probe.
7. Stop/restart the app and check that the app-private tsnet identity is retained.

The native controls do not collect the Paneboard password; the WebView shows the
server's existing login page. Certificate pinning replaces standard CA/name
validation only for the specified test endpoint and checks certificate validity.
External redirects and unapproved ports are blocked. Tailscale mode additionally
blocks non-tailnet destinations and direct-network fallback. The host server must
keep its authentication enabled for the WS probe.

## Limits

File pickers/download handling, embedded browser/plugin frames, VPN service,
boot receiver and background keepalive are not implemented. The added CSP blocks
frames and off-origin connections. WebView has no native JavaScript bridge, file
access or SSL-error bypass. Cleartext is allowed only for 127.0.0.1; all remote
server traffic remains pinned TLS over the selected connection. Android may kill the app. State
is app-private and backup is disabled; uninstalling removes the local identity
but does not remove its registered device entry from the tailnet administration.
The exported launcher accepts only public endpoint/pin extras, never credentials.

See `docs/android-tsnet-feasibility.md` for the research. The userspace approach
was informed by 0xKrito/tailscale-socks5-Android; this probe uses tsnet, anet and
coder/websocket directly rather than importing that application.

## Verification (2026-09-15)

- Android arm64 PIE core, Java Activity, APK signing and signature verification
  succeeded using the workspace-local tools.
- USB installation on the authorized Lenovo L71091 (Android 13) succeeded.
- Both Go policy tests passed (destination restrictions and certificate pin/validity).
- `npm test`: 606 tests, 586 passed, 20 failed. HTTP startup timeouts and a
  terminal foreground-process assertion failed; the stuck terminal test worker
  was stopped. This is not a green full-suite result.
- The user completed Tailscale authorization. Device UI and screenshots confirmed
  Running, HTTPS success and WebSocket `1008 / Login required` through tsnet,
  with no VPN detected by the app and no VPN icon visible in the status bar.
- The Workspace revision adds six passing Go test groups (including HTTP/WS
  forwarding, capability and origin rejection, pin failures and tunnel failure).
  Its signed APK was installed; real WebView login and terminal I/O remain to test.
- Latest Workspace run: `npm test -- --test-timeout=120000` completed normally:
  606 passed, 0 failed (89 seconds). Earlier failures above are historical runs.

### Follow-up verification (2026-09-16)

- Added the explicitly authorized port 5023; port 5022 remains rejected because
  it is reserved for the isolated ADB server. All six Go test groups passed.
- Rebuilt and signature-verified the APK, then updated the USB-connected phone.
- Started an isolated source runtime on the host's Tailscale address, port 5023,
  with fresh state, a random test password and an independently checked TLS pin.
  The port-5001 runtime was not restarted or modified.
- On the phone, embedded Tailscale reached Running without another authorization;
  HTTPS and unauthenticated WebSocket rejection passed. WebView login succeeded.
- After keyboard hide/show and a background/return cycle, the visible keyboard's
  `echo ok` returned `ok`. Prompt alignment remained coherent in this check.
  Batched ADB key events produced duplicate characters and remain an unresolved
  automation/input-path limitation, not a passing normal-input test.
- Latest `npm test -- --test-timeout=120000`: 603 passed, 3 failed. Duplicate
  server startup, HTTPS startup timing, and terminal foreground-process detection
  failed. Stalled test processes required scoped cleanup. This is not a green run.

These checks do not establish production readiness or mobile-data handover.

### Dual-mode milestone (2026-09-16)

- All eight Go test groups passed, including direct target restrictions, HTTPS
  forwarding with the selected dialer, and rejection of a wrong direct-mode pin.
- `npm test -- --test-timeout=120000`: 606 passed, 0 failed (77 seconds).
  `npm run lint` passed. Earlier failing runs above remain historical evidence.
- Built, signature-verified and installed the dual-mode APK on the same phone.
- Embedded Tailscale HTTPS and unauthenticated WS rejection passed again.
- Direct mode reached the isolated 5023 runtime through a temporary TCP relay on
  the existing USB network, with no system VPN detected. HTTPS, WS authentication
  rejection, WebView login and visible-keyboard `echo direct` all passed.
- Reopening the app retained the direct selection and endpoint. Returning to
  Tailscale mode stops the old core and requires reviewing the server address.
- Screenshots verified both mode controls and the direct terminal output.
  This is not a Wi-Fi/mobile handover test or a production release certification.

The initial device start reproduced `route ip+net: netlinkrib: permission denied`.
With CGO disabled, anet's automatic Android API detection returns -1 and selects
the legacy netlink implementation. The Activity now passes `SDK_INT` privately
to the child process; before starting tsnet the core selects anet's Android 11+
implementation for API 30+. The rebuilt, signature-verified APK was installed
successfully. Subsequent device startup, authorization and connection checks passed.
