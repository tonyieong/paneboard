# Paneboard Android 1.0 — private APK

This is a **privately signed arm64 APK for Android 9+**, distributed directly rather
than through Google Play. It offers
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

The mode and each mode's address/certificate are remembered separately. Changing
mode closes the Workspace and stops the previous core before another can start.
Both modes require HTTPS and a verified leaf pin. HTTPS defaults to port 443;
explicit ports 1–65535 are supported. Runtime testing remains limited to ports
explicitly authorized by the user (5023 in this workspace).

Use **Connect and open Workspace** for the normal flow. Optionally enable automatic
connection on app launch. Tailscale sign-in is needed only when its saved identity
requires authorization; Paneboard still uses its ordinary server login. Closing
the Workspace clears its temporary WebView login storage. WebSocket recovery is
handled by Paneboard's existing client; Reload is available for a failed page.

## Import connection settings

Use the native **Import connection settings** button to select a JSON file (up to
16 KB). Confirm the displayed address and fingerprint only when the file comes
from a trusted server-side channel; importing a file is not independent proof of
trust. The file contains public connection information, never a password or token:

```json
{
  "mode": "tailscale",
  "serverUrl": "https://100.64.0.10:8443",
  "certificateSha256": "REPLACE_WITH_THE_VERIFIED_64_HEX_DIGIT_LEAF_CERTIFICATE_SHA256"
}
```

Use `"direct"` for the direct mode. Colon-separated fingerprints are accepted.
The launcher ignores endpoint/pin extras; another app cannot silently replace
the stored server identity through a launcher intent.

## Build

All tools, caches, signing keys and output stay inside the workspace. The current
Windows script uses portable Go 1.27.1, JDK 17, Android platform 35 and build-tools
35.0.0. Place these in `output/node_modules/android-toolchain/` and
`output/node_modules/android-sdk-tools/`, then run:

```powershell
./android/probe/build.ps1
```

The deliverable is `output/android-release/Paneboard-1.0.apk`, with a SHA-256
checksum beside it. The APK is not debuggable and has no WebView debugging.
The build bundles Go/module license texts inside the APK. It does not build,
deploy, restart or modify the Windows server.

**Back up `output/android-signing/` securely.** It contains the release keystore,
its randomly generated password and signing lineage. The directory ACL permits
only the building Windows account and SYSTEM. Never commit or distribute these
private files with the APK. Future updates need the same release key and a higher
manifest versionCode. Losing the key prevents normal in-place updates.

When the local prototype debug key exists, the build creates a signing lineage
to rotate to the private release key on Android 9+, retaining installed app data.
Rollback to the old signing key is disabled. The internal package name remains
`app.paneboard.probe` solely for upgrade compatibility; the launcher says Paneboard.

## Device checks

1. Install the APK (manual installation is possible if USB installation is blocked).
2. Select a connection mode. Enter the authorized HTTPS IP/hostname and port, and independently verified
   SHA-256 leaf certificate fingerprint, or import a trusted connection file.
   Port 5022 remains reserved for the isolated USB debugging server during this task.
3. Connect and open Workspace. In Tailscale mode, use the authorization button if needed
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
External redirects and invalid ports are blocked. Tailscale mode additionally
blocks non-tailnet destinations and direct-network fallback. The host server must
keep its authentication enabled for both Workspace opening and diagnostics; the
app checks pinned HTTPS and unauthenticated WebSocket rejection before opening
the WebView. A failed check stays on the connection screen with an error.

## Limits

WebView file uploads/download handling, embedded browser/plugin frames, VPN service,
boot receiver and background keepalive are not implemented. The added CSP blocks
frames and off-origin connections. WebView has no native JavaScript bridge, file
access or SSL-error bypass. Cleartext is allowed only for 127.0.0.1; all remote
server traffic remains pinned TLS over the selected connection. Android may kill the app. State
is app-private and backup is disabled; uninstalling removes the local identity
but does not remove its registered device entry from the tailnet administration.
Native JSON import is separate from WebView file handling. The app is not a
general-purpose browser and does not claim complete browser feature parity.

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

### Private release verification (2026-09-17)

- Built and verified the non-debuggable 1.0 release APK, signed with the private
  release key. In-place upgrade on Android 13 preserved the Tailscale identity.
- The configurable-port regression failed against the old allowlist, then passed
  with the new validation. All eight Go test groups passed.
- The parallel npm run encountered startup timing and terminal-process failures.
  `npm test -- --test-timeout=120000 --test-concurrency=1` passed all 606 tests
  (119.8 seconds); `npm run lint` passed.
- Real-device screenshots verified the release controls, trusted JSON import
  confirmation, separate mode profiles, automatic connection and login page.
- A deliberately incorrect pin was rejected before opening the WebView. Restoring
  the verified pin allowed login and terminal use through the direct transport.
- Stopping and recreating only the temporary USB-network TCP relay exercised
  WebSocket recovery; visible-keyboard terminal input returned its expected echo.
  This does not establish Wi-Fi/mobile-data handover or background keepalive.
- Removed that relay after testing. Switching back restored the saved Tailscale
  endpoint and pin, and reached the isolated port-5023 login page without another
  Tailscale authorization. The phone remains configured for that test instance.
- No Windows packaging, deployment, merge or production service restart was done.
  The requested ui-audit skill was unavailable; visual verification used actual
  phone screenshots rather than claiming a web UI-audit run.

The initial device start reproduced `route ip+net: netlinkrib: permission denied`.
With CGO disabled, anet's automatic Android API detection returns -1 and selects
the legacy netlink implementation. The Activity now passes `SDK_INT` privately
to the child process; before starting tsnet the core selects anet's Android 11+
implementation for API 30+. The rebuilt, signature-verified APK was installed
successfully. Subsequent device startup, authorization and connection checks passed.
