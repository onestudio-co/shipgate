#!/usr/bin/env bash
# stop.sh — stop a running Studio Shipgate server
# Usage: ./stop.sh [<state_dir>]
# If <state_dir> is given, kills by server.pid file; otherwise pkills the server.
set -euo pipefail

STATE_DIR="${1:-}"

if [ -n "$STATE_DIR" ] && [ -f "$STATE_DIR/server.pid" ]; then
  PID="$(cat "$STATE_DIR/server.pid")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped shipgate-server (pid $PID)"
  else
    echo "No process at pid $PID (already stopped?)"
  fi
else
  # Fallback: pkill by script name
  if pkill -f 'shipgate-server\.cjs' 2>/dev/null; then
    echo "Stopped shipgate-server (pkill)"
  else
    echo "No shipgate-server process found"
  fi
fi
