#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
controller="${CLEO_DISCORD_TEST_CONTROLLER:-$script_dir/deploy-discord-release}"
fixture_root="$(mktemp -d)"
trap 'rm -rf -- "$fixture_root"' EXIT

deploy_root="$fixture_root/deploy"
bin_dir="$fixture_root/bin"
runtime_check="$fixture_root/check-runtime"
host_node="$fixture_root/node"
env_file="$fixture_root/discord.env"
command_attempts="$fixture_root/command-attempts"
source_sha="0123456789abcdef0123456789abcdef01234567"
target_sha="fedcba9876543210fedcba9876543210fedcba98"
runtime_user="$(id -un)"
mkdir -p "$deploy_root/releases" "$deploy_root/shared" "$bin_dir"
chmod 2775 "$deploy_root" "$deploy_root/releases" "$deploy_root/shared"
runtime_group="$(id -gn)"
touch "$env_file"
touch "$deploy_root/shared/deployment.lock"
chmod 0640 "$deploy_root/shared/deployment.lock"

create_release() {
  local sha="$1"
  local release="$deploy_root/releases/$sha"
  mkdir -p "$release/dist/scripts"
  printf '%s\n' "$sha" > "$release/.cleo-release-sha"
  printf '%s\n' linux-arm64 > "$release/.cleo-release-platform"
  printf '%s\n' v24.15.0 > "$release/.nvmrc"
  printf '%s\n' "runtime-$sha" > "$release/dist/index.js"
  printf '%s\n' "commands-$sha" > "$release/dist/scripts/registerCommands.js"
}

create_release "$source_sha"
create_release "$target_sha"
ln -s "$deploy_root/releases/$source_sha" "$deploy_root/current"
source_fingerprint="$(sha256sum "$deploy_root/releases/$source_sha/dist/scripts/registerCommands.js" | cut -d ' ' -f 1)"
printf 'APPLICATION_SHA=%s\nPREVIOUS_APPLICATION_SHA=%s\nCOMMAND_FINGERPRINT=%s\n' \
  "$source_sha" "$target_sha" "$source_fingerprint" \
  > "$deploy_root/shared/deployment-state.env"
chmod 0640 "$deploy_root/shared/deployment-state.env"

cat > "$host_node" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "-p" ]]; then
  printf '%s\n' linux-arm64
  exit 0
fi
exit 1
EOF
cat > "$runtime_check" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$bin_dir/sudo" <<'EOF'
#!/usr/bin/env bash
while [[ "${1:-}" == "-n" || "${1:-}" == "-u" ]]; do
  if [[ "$1" == "-u" ]]; then shift 2; else shift; fi
done
exec "$@"
EOF
cat > "$bin_dir/systemctl" <<'EOF'
#!/usr/bin/env bash
operation="${1:-}"
shift || true
case "$operation" in
  show)
    unit="$1"
    property="$3"
    case "$property" in
      LoadState) printf '%s\n' loaded ;;
      User) printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_USER" ;;
      Group) printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_GROUP" ;;
      SupplementaryGroups) printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_READ_GROUP" ;;
      WorkingDirectory) printf '%s\n' "$CLEO_DISCORD_TEST_DEPLOY_ROOT/current" ;;
      EnvironmentFiles) printf '%s\n' "$CLEO_DISCORD_TEST_ENV_FILE" ;;
      ExecStart)
        if [[ "$unit" == *register* ]]; then
          printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_LAUNCHER register-commands"
        else
          printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_LAUNCHER runtime"
        fi
        ;;
    esac
    ;;
  is-active|restart|stop|reset-failed) exit 0 ;;
  start)
    attempts=0
    [[ ! -f "$CLEO_DISCORD_TEST_COMMAND_ATTEMPTS" ]] || attempts="$(cat "$CLEO_DISCORD_TEST_COMMAND_ATTEMPTS")"
    attempts=$((attempts + 1))
    printf '%s\n' "$attempts" > "$CLEO_DISCORD_TEST_COMMAND_ATTEMPTS"
    [[ "$attempts" -gt 1 ]]
    ;;
  *) exit 0 ;;
esac
EOF
chmod 0755 "$host_node" "$runtime_check" "$bin_dir/sudo" "$bin_dir/systemctl"

export PATH="$bin_dir:$PATH"
export CLEO_DISCORD_HOST_CONTRACT_VERSION=4
export CLEO_DISCORD_RELEASE_PLATFORM=linux-arm64
export CLEO_DISCORD_DEPLOY_ROOT="$deploy_root"
export CLEO_DISCORD_ENV_FILE="$env_file"
export CLEO_DISCORD_RUNTIME_USER="$runtime_user"
export CLEO_DISCORD_RUNTIME_GROUP="$runtime_group"
export CLEO_DISCORD_DEPLOY_GROUP="$runtime_group"
export CLEO_DISCORD_RUNTIME_READ_GROUP="$runtime_group"
export CLEO_DISCORD_DEPLOY_OWNER="$runtime_user"
export CLEO_DISCORD_DEPLOY_ROOT_OWNER="$runtime_user"
export CLEO_DISCORD_RUNTIME_LAUNCHER="$fixture_root/run-release"
export CLEO_DISCORD_RUNTIME_CHECK="$runtime_check"
export CLEO_DISCORD_HOST_NODE="$host_node"
export CLEO_DISCORD_STATE_READER="$script_dir/read-discord-deployment-state"
export CLEO_DISCORD_STATE_OWNER="$runtime_user"
export CLEO_DISCORD_STATE_GROUP="$runtime_group"
export CLEO_DISCORD_HEALTH_ATTEMPTS=1
export CLEO_DISCORD_HEALTH_DELAY_SECONDS=0
export CLEO_DISCORD_TEST_RUNTIME_USER="$runtime_user"
export CLEO_DISCORD_TEST_RUNTIME_GROUP="$runtime_group"
export CLEO_DISCORD_TEST_DEPLOY_GROUP="$runtime_group"
export CLEO_DISCORD_TEST_RUNTIME_READ_GROUP="$runtime_group"
export CLEO_DISCORD_TEST_DEPLOY_ROOT="$deploy_root"
export CLEO_DISCORD_TEST_ENV_FILE="$env_file"
export CLEO_DISCORD_TEST_RUNTIME_LAUNCHER="$fixture_root/run-release"
export CLEO_DISCORD_TEST_COMMAND_ATTEMPTS="$command_attempts"

if bash "$controller" rollback; then
  echo "Rollback unexpectedly succeeded after command registration failure" >&2
  exit 1
fi

[[ "$(readlink "$deploy_root/current")" == "$deploy_root/releases/$source_sha" ]]
[[ "$(cat "$command_attempts")" == "2" ]]
expected_state="$(printf '%s\n%s\n%s' "$source_sha" "$target_sha" "$source_fingerprint")"
actual_state="$(
  CLEO_DISCORD_STATE_OWNER="$runtime_user" \
  CLEO_DISCORD_STATE_GROUP="$runtime_group" \
    bash "$script_dir/read-discord-deployment-state" "$deploy_root/shared/deployment-state.env"
)"
[[ "$actual_state" == "$expected_state" ]]

echo "Discord rollback command failure recovery test passed."
