#!/usr/bin/env bash
# Install a macOS LaunchAgent so ai-radar supervisor starts at login and restarts on crash.
# Usage: ./scripts/install-launchd.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.ai-radar.supervise"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
BUN_BIN="$(command -v bun)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BUN_BIN}</string>
    <string>run</string>
    <string>${ROOT}/scripts/supervise.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/supervise.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/supervise.stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${HOME}/.bun/bin</string>
  </dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo "Installed LaunchAgent: $PLIST"
echo "Logs: $LOG_DIR/supervise.*.log"
echo "Stop:  launchctl bootout gui/$(id -u)/${LABEL}"
echo "Start: launchctl kickstart gui/$(id -u)/${LABEL}"
