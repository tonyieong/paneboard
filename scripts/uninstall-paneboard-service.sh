#!/bin/sh
# Stops Paneboard and removes the systemd user service. The workspace in data/
# is left alone.
set -eu

UNIT=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/paneboard.service
systemctl --user disable --now paneboard.service 2>/dev/null || true
rm -f "$UNIT"
systemctl --user daemon-reload
echo "Paneboard service removed."
