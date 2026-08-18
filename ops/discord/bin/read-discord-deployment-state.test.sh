#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
reader="${CLEO_DISCORD_TEST_STATE_READER:-$script_dir/read-discord-deployment-state}"
fixture_root="$(mktemp -d)"
trap 'rm -rf -- "$fixture_root"' EXIT

state_file="$fixture_root/deployment-state.env"
marker="$fixture_root/executed"
owner="$(id -un)"
group="$(id -gn)"
application_sha="0123456789abcdef0123456789abcdef01234567"
previous_sha="fedcba9876543210fedcba9876543210fedcba98"
fingerprint="$(printf 'a%.0s' {1..64})"

write_state() {
  printf '%s\n' "$@" > "$state_file"
  chmod 0640 "$state_file"
}

run_reader() {
  CLEO_DISCORD_STATE_OWNER="$owner" \
  CLEO_DISCORD_STATE_GROUP="$group" \
    bash "$reader" "$@"
}

write_state \
  "APPLICATION_SHA=$application_sha" \
  "PREVIOUS_APPLICATION_SHA=$previous_sha" \
  "COMMAND_FINGERPRINT=$fingerprint"
expected="$(printf '%s\n%s\n%s' "$application_sha" "$previous_sha" "$fingerprint")"
[[ "$(run_reader "$state_file")" == "$expected" ]]

write_state \
  'APPLICATION_SHA=$(touch "'$marker'")' \
  "PREVIOUS_APPLICATION_SHA=$previous_sha" \
  "COMMAND_FINGERPRINT=$fingerprint"
if run_reader "$state_file" >/dev/null 2>&1; then
  echo "State reader accepted shell syntax" >&2
  exit 1
fi
[[ ! -e "$marker" ]] || {
  echo "State reader executed shell syntax" >&2
  exit 1
}

write_state \
  "APPLICATION_SHA=$application_sha" \
  "APPLICATION_SHA=$application_sha" \
  "COMMAND_FINGERPRINT=$fingerprint"
if run_reader "$state_file" >/dev/null 2>&1; then
  echo "State reader accepted duplicate keys" >&2
  exit 1
fi

write_state \
  "APPLICATION_SHA=$application_sha" \
  "PREVIOUS_APPLICATION_SHA=$previous_sha" \
  "UNEXPECTED=$fingerprint"
if run_reader "$state_file" >/dev/null 2>&1; then
  echo "State reader accepted an unknown key" >&2
  exit 1
fi

echo "Discord deployment state parser tests passed."
