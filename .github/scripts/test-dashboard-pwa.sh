#!/usr/bin/env bash
# Serve the built dashboard with local TLS, retry readiness, and retain server
# diagnostics on failure. The EXIT trap releases the background test server.
set -euo pipefail

: "${RUNNER_TEMP:?Set RUNNER_TEMP to a disposable verification directory}"

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' \
  -keyout "$RUNNER_TEMP/pwa.key" -out "$RUNNER_TEMP/pwa.crt"
export NODE_EXTRA_CA_CERTS="$RUNNER_TEMP/pwa.crt"
node .github/scripts/serve-dashboard-pwa.mjs \
  "$RUNNER_TEMP/pwa.key" "$RUNNER_TEMP/pwa.crt" \
  > "$RUNNER_TEMP/dashboard-pwa.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
ready=0
for attempt in {1..30}; do
  if curl --max-time 2 --cacert "$RUNNER_TEMP/pwa.crt" --fail --silent \
    --output /dev/null "$PWA_TEST_ORIGIN/sign-in"; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  cat "$RUNNER_TEMP/dashboard-pwa.log"
  exit 1
fi
if ! bun run --filter @workspace/dashboard test:pwa; then
  cat "$RUNNER_TEMP/dashboard-pwa.log"
  exit 1
fi
