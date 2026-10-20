#!/usr/bin/env bash
# Starts everything ChainBoard needs, in order:
#   Fabric network + chaincode  ->  IPFS  ->  backend  ->  frontend  (-> demo data)
#
#   bash start.sh            reuse a running network, or create one if none is running
#   bash start.sh --fresh    wipe and recreate the network (all ledger data is lost), then seed
#   bash start.sh --seed     also load the demo data
#   bash start.sh --no-ipfs  skip IPFS (file attachments will not work)
#
# Stop with:  bash stop.sh     (add --all to also stop the Fabric network and IPFS)
# Logs:       .run/backend.log  .run/frontend.log  .run/ipfs.log  .run/network.log

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC="${FABRIC_SAMPLES:-$HOME/fabric-samples}"      # the backend reads certificates from here
NETWORK_DIR="$FABRIC/test-network"
RUN="$ROOT/.run"
CHANNEL="mychannel"
CC_NAME="pmcc"

FRESH=0; SEED=0; IPFS=1
for arg in "$@"; do
  case "$arg" in
    --fresh)   FRESH=1; SEED=1 ;;
    --seed)    SEED=1 ;;
    --no-ipfs) IPFS=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

mkdir -p "$RUN"

# ── checks ─────────────────────────────────────────────────────────────
command -v docker >/dev/null || die "docker was not found. Start Docker Desktop (with WSL integration) first."
docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and try again."
command -v node >/dev/null || die "node was not found. Install Node.js 20 or newer."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js 20 or newer is required (found $(node -v))."
[ -x "$NETWORK_DIR/network.sh" ] || [ -f "$NETWORK_DIR/network.sh" ] || die "Fabric test-network not found at $NETWORK_DIR (set FABRIC_SAMPLES if it lives elsewhere)."

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
wait_for() {   # wait_for <name> <port> <seconds>
  local i
  local log="$RUN/${1,,}.log"
  for ((i = 0; i < $3; i++)); do port_open "$2" && return 0; sleep 1; done
  [ -f "$log" ] && { printf '\n--- last lines of %s ---\n' "$log"; tail -n 25 "$log"; printf -- '--- end ---\n'; }
  die "$1 did not start on port $2 within $3 seconds."
}

# ── 1. Fabric network and chaincode ────────────────────────────────────
network_running() { docker ps --format '{{.Names}}' | grep -q '^peer0\.org1\.example\.com$'; }

if [ "$FRESH" -eq 1 ] || ! network_running; then
  [ "$FRESH" -eq 1 ] && say "Recreating the Fabric network (all ledger data is wiped)" \
                     || say "No Fabric network is running: creating one"
  [ "$FRESH" -eq 0 ] && SEED=1     # a brand-new ledger is empty, so offer the demo data
  ( cd "$NETWORK_DIR"
    ./network.sh down
    ./network.sh up createChannel -c "$CHANNEL"
    ./network.sh deployCC -ccn "$CC_NAME" -ccp "$ROOT/pm-chaincode" -ccl javascript -ccv 1.0 -ccs 1
  ) > "$RUN/network.log" 2>&1 || { tail -n 30 "$RUN/network.log"; die "The Fabric network could not be started. Full log: $RUN/network.log"; }
  echo "Network up, chaincode '$CC_NAME' deployed on channel '$CHANNEL'."
else
  say "Fabric network already running (use --fresh to recreate it)"
fi

# ── 2. IPFS ────────────────────────────────────────────────────────────
if [ "$IPFS" -eq 1 ]; then
  if ! command -v ipfs >/dev/null; then
    warn "ipfs is not installed: file attachments will not work. (Install Kubo, or use --no-ipfs to silence this.)"
  else
    say "IPFS"
    [ -d "${IPFS_PATH:-$HOME/.ipfs}" ] || ipfs init >> "$RUN/ipfs.log" 2>&1
    ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173"]' >/dev/null
    ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT","POST"]' >/dev/null
    if port_open 5001; then
      echo "IPFS already running."
    else
      setsid nohup ipfs daemon >> "$RUN/ipfs.log" 2>&1 &
      echo $! > "$RUN/ipfs.pid"
      wait_for "IPFS" 5001 40
      echo "IPFS started."
    fi
  fi
fi

# ── 3. Backend ─────────────────────────────────────────────────────────
start_service() {   # start_service <name> <dir> <port> <wait seconds>
  local name="$1" dir="$2" port="$3" secs="$4"
  if port_open "$port"; then
    echo "$name already running on port $port."
    return
  fi
  # Always run npm install: it takes a second when everything is current, and it picks up
  # packages added since the last run (a stale node_modules is the usual cause of "Cannot find module").
  echo "Checking $name dependencies..."
  ( cd "$dir" && npm install --no-audit --no-fund ) > "$RUN/$name-install.log" 2>&1 \
    || { tail -n 20 "$RUN/$name-install.log"; die "npm install failed for $name"; }
  ( cd "$dir" && setsid nohup npm run dev >> "$RUN/$name.log" 2>&1 & echo $! > "$RUN/$name.pid" )
  wait_for "$name" "$port" "$secs"
  echo "$name started on port $port."
}

say "Backend"
start_service backend "$ROOT/pm-backend" 3000 60

# ── 4. Demo data ───────────────────────────────────────────────────────
if [ "$SEED" -eq 1 ]; then
  say "Demo data"
  ( cd "$ROOT/pm-backend" && npm run seed ) || warn "The seed reported a problem (it stops harmlessly if the demo data already exists)."
fi

# ── 5. Frontend ────────────────────────────────────────────────────────
say "Frontend"
start_service frontend "$ROOT/pm-frontend" 5173 60

say "ChainBoard is running"
cat <<EOF
  Open:      http://localhost:5173
  Sign in:   anita.tehrani   /   Blockchain&IPFS-Genova-2026      (after seeding)
  Logs:      $RUN/
  Stop:      bash stop.sh          (add --all to stop the Fabric network and IPFS too)
EOF
