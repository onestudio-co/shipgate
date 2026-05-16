#!/usr/bin/env bash
# start.sh — launch Studio Shipgate server for the current project
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHIPGATE_DIR="$PROJECT_ROOT/.shipgate"
PID_TS="$(date +%Y%m%d-%H%M%S)-$$"
SESSION_DIR="$SHIPGATE_DIR/$PID_TS"
CONTENT_DIR="$SESSION_DIR/content"
STATE_DIR="$SESSION_DIR/state"

mkdir -p "$CONTENT_DIR" "$STATE_DIR" "$STATE_DIR/diffs"

SERVER_INFO="$STATE_DIR/server-info"

# Launch the server in the background
CONTENT_DIR="$CONTENT_DIR" STATE_DIR="$STATE_DIR" HOST="${HOST:-127.0.0.1}" PORT="${PORT:-0}" \
  node "$(dirname "$0")/shipgate-server.cjs" > /dev/null 2>&1 &
SERVER_PID=$!

# Write pid file immediately (server also writes it, but capture $! as backup)
echo "$SERVER_PID" > "$STATE_DIR/server.pid"

# Poll for server-info up to ~8s (40 × 0.2s)
READY=0
for i in $(seq 1 40); do
  if [ -f "$SERVER_INFO" ]; then
    READY=1
    break
  fi
  sleep 0.2
done

if [ "$READY" -eq 0 ]; then
  echo '{"ok":false,"error":"server did not start within 8s"}' >&2
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

# Print the server-info JSON
cat "$SERVER_INFO"
echo ""
