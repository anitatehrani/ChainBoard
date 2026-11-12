#!/usr/bin/env bash
# Stops the backend and frontend started by start.sh.
#
#   bash stop.sh          stop backend and frontend (the ledger and IPFS keep running)
#   bash stop.sh --all    also stop IPFS (if start.sh started it) and shut the Fabric network down
#                         (this wipes the ledger: run start.sh again to get a fresh one)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC="${FABRIC_SAMPLES:-$HOME/fabric-samples}"
RUN="$ROOT/.run"

ALL=0
[ "${1:-}" = "--all" ] && ALL=1

stop_pid() {   # stop_pid <name>: kills the whole process group started by start.sh
  local f="$RUN/$1.pid"
  [ -f "$f" ] || return 0
  local pid; pid="$(cat "$f")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
    echo "Stopped $1."
  fi
  rm -f "$f"
}

free_port() {   # free_port <name> <port>: wait until the port is released; stop leftovers holding it
  local name="$1" port="$2" i
  for i in $(seq 1 20); do
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || return 0   # nothing listens: done
    sleep 0.5
  done
  if command -v fuser >/dev/null; then
    fuser -k "$port/tcp" >/dev/null 2>&1 && echo "Stopped a leftover $name process on port $port."
  else
    pkill -f "node .*--watch app.js" 2>/dev/null; pkill -f "vite" 2>/dev/null
  fi
  sleep 1
}

stop_pid frontend
stop_pid backend
free_port frontend 5173
free_port backend 3000

if [ "$ALL" -eq 1 ]; then
  stop_pid ipfs
  if [ -f "$FABRIC/test-network/network.sh" ]; then
    echo "Shutting the Fabric network down..."
    ( cd "$FABRIC/test-network" && ./network.sh down ) > "$RUN/network-down.log" 2>&1 \
      && echo "Fabric network stopped." || echo "Could not stop it cleanly; see $RUN/network-down.log"
  fi
fi

echo "Done."
