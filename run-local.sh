#!/bin/bash
# Monitor local (IP residencial) para cuando Apple bloquea las IPs de GitHub.
# Uso: ./run-local.sh   (lee las claves de ~/.iphone-duo.env)
cd "$(dirname "$0")"
set -a; source "$HOME/.iphone-duo.env"; set +a
export STATE_FILE="$HOME/.iphone-duo-state.json"
while true; do
  node monitor.mjs || true
  sleep 20
done
