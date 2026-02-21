#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="5173"
URL="http://127.0.0.1:${PORT}/ladybug-adventurer/"
PID_FILE="${ROOT}/.qa-vite.pid"
LOG_FILE="${ROOT}/.qa-vite.log"

cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.4
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}
trap cleanup EXIT

# Clean stale PID-owned server first.
cleanup

# If something else owns the port, only kill it when it's this project's vite.
if command -v lsof >/dev/null 2>&1; then
  existing_pid="$(lsof -ti tcp:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "$existing_pid" ]]; then
    cmdline="$(ps -p "$existing_pid" -o command= 2>/dev/null || true)"
    if [[ "$cmdline" == *"ladybug-adventurer"* && "$cmdline" == *"vite"* ]]; then
      kill "$existing_pid" 2>/dev/null || true
      sleep 0.5
    else
      echo "Port ${PORT} is occupied by a non-ladybug process (pid ${existing_pid}). Aborting safely."
      exit 1
    fi
  fi
fi

cd "$ROOT"
mkdir -p qa-screens

npm run dev -- --host 127.0.0.1 --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

# Wait for dev server readiness.
for _ in {1..40}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -fsS "$URL" >/dev/null 2>&1; then
  echo "Dev server did not become ready. Last log lines:" >&2
  tail -n 60 "$LOG_FILE" >&2 || true
  exit 1
fi

agent-browser open "$URL"
agent-browser set viewport 1366 768
agent-browser screenshot qa-screens/desktop-overview.png --full
agent-browser set device "iPhone 14"
agent-browser screenshot qa-screens/mobile-portrait.png --full
agent-browser close

echo "QA screenshots updated via agent-browser at $URL"