#!/bin/sh
# Installs Paneboard as a systemd user service, started at boot and restarted
# if it crashes. Running it again rewrites the unit, which also repairs it
# after the folder has moved.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ -x "$ROOT/paneboard" ]; then
  RUNTIME=$ROOT
  EXEC="\"$ROOT/paneboard\""
elif [ -x "$ROOT/dist-linux/paneboard" ]; then
  RUNTIME=$ROOT/dist-linux
  EXEC="\"$RUNTIME/paneboard\""
else
  NODE=$(command -v node) || {
    echo "Neither a packaged paneboard nor node was found. Run npm run package:linux or install Node.js 22." >&2
    exit 1
  }
  RUNTIME=$ROOT
  EXEC="\"$NODE\" \"$ROOT/src/main.js\""
fi

UNIT_DIR=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
mkdir -p "$UNIT_DIR"
# PATH is captured now: a service starts with a bare one, which would leave
# claude, codex and other per-user tools missing from every pane.
# KillMode=mixed lets Paneboard save and close its own panes on stop; exit code
# 75 is its restart request, so it restarts without being logged as a failure.
cat > "$UNIT_DIR/paneboard.service" <<EOF
[Unit]
Description=Paneboard terminal workspace
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$RUNTIME
ExecStart=$EXEC
Environment="PATH=$PATH"
Environment=PANEBOARD_SERVICE=systemd
Restart=on-failure
RestartForceExitStatus=75
SuccessExitStatus=75
RestartSec=2
KillMode=mixed

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable paneboard.service
systemctl --user restart paneboard.service

# Without lingering, user services stop at logout and wait for the next login.
if ! loginctl enable-linger "$(id -un)" 2>/dev/null; then
  echo "Could not enable lingering. Run: sudo loginctl enable-linger $(id -un)" >&2
fi

echo "Paneboard service installed from $RUNTIME"
