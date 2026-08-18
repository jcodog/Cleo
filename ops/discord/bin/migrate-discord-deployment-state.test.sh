#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace="$(mktemp -d)"
trap 'rm -rf -- "$workspace"' EXIT

deploy_root="$workspace/deploy"
state_file="$deploy_root/shared/deployment-state.env"
state_reader="$script_dir/read-discord-deployment-state"
migrator="$script_dir/migrate-discord-deployment-state"
owner="$(id -un)"
group="$(id -gn)"
application_sha="1111111111111111111111111111111111111111"
previous_sha="2222222222222222222222222222222222222222"
command_sha="3333333333333333333333333333333333333333"
missing_command_sha="4444444444444444444444444444444444444444"

mkdir -p "$deploy_root/shared" "$deploy_root/releases"

export CLEO_DISCORD_DEPLOY_ROOT="$deploy_root"
export CLEO_DISCORD_STATE_READER="$state_reader"
export CLEO_DISCORD_STATE_OWNER="$owner"
export CLEO_DISCORD_STATE_GROUP="$group"

write_legacy_state() {
  local command="$1"
  printf 'APPLICATION_SHA=%s\nPREVIOUS_APPLICATION_SHA=%s\nCOMMAND_SHA=%s\n' \
    "$application_sha" "$previous_sha" "$command" > "$state_file"
  chmod 0640 "$state_file"
}

command_entrypoint="$deploy_root/releases/$command_sha/dist/scripts/registerCommands.js"
mkdir -p "$(dirname "$command_entrypoint")"
printf 'console.log("register")\n' > "$command_entrypoint"
expected_fingerprint="$(sha256sum "$command_entrypoint" | cut -d ' ' -f 1)"

write_legacy_state "$command_sha"
"$migrator" "$state_file"
mapfile -t migrated < <("$state_reader" "$state_file")
[[ "${migrated[0]}" == "$application_sha" ]]
[[ "${migrated[1]}" == "$previous_sha" ]]
[[ "${migrated[2]}" == "$expected_fingerprint" ]]

# Current state is already canonical and must remain unchanged.
cp "$state_file" "$workspace/current-state.snapshot"
"$migrator" "$state_file"
cmp "$workspace/current-state.snapshot" "$state_file"

# A legacy state whose command release cannot be resolved must fail without
# replacing or partially rewriting the original state.
write_legacy_state "$missing_command_sha"
cp "$state_file" "$workspace/legacy-state.snapshot"
if "$migrator" "$state_file"; then
  echo "Legacy state migration unexpectedly succeeded without a command entrypoint." >&2
  exit 1
fi
cmp "$workspace/legacy-state.snapshot" "$state_file"

# Migration must not follow a symlinked release path component while hashing
# the legacy command entrypoint.
write_legacy_state "$command_sha"
mv "$deploy_root/releases/$command_sha/dist/scripts" \
  "$deploy_root/releases/$command_sha/dist/scripts-real"
ln -s scripts-real "$deploy_root/releases/$command_sha/dist/scripts"
cp "$state_file" "$workspace/symlinked-state.snapshot"
if "$migrator" "$state_file"; then
  echo "Legacy state migration unexpectedly followed a symlinked command path." >&2
  exit 1
fi
cmp "$workspace/symlinked-state.snapshot" "$state_file"
rm -f "$deploy_root/releases/$command_sha/dist/scripts"
mv "$deploy_root/releases/$command_sha/dist/scripts-real" \
  "$deploy_root/releases/$command_sha/dist/scripts"

# No state yet is a valid no-op for first bootstrap.
rm -f "$state_file"
"$migrator" "$state_file"
[[ ! -e "$state_file" ]]

echo "Discord deployment state migration tests passed."
