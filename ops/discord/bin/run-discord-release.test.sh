#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
launcher="${CLEO_DISCORD_TEST_LAUNCHER:-$script_dir/run-discord-release}"
fixture_root="$(mktemp -d)"
trap 'rm -rf -- "$fixture_root"' EXIT

compiled_release="$fixture_root/compiled"
legacy_release="$fixture_root/legacy"
current_link="$fixture_root/current"
fake_nvm_exec="$fixture_root/nvm-exec"
invocation_file="$fixture_root/invocation"

mkdir -p \
  "$compiled_release/dist/scripts" \
  "$legacy_release/src/scripts" \
  "$legacy_release/node_modules/tsx/dist"
touch \
  "$compiled_release/dist/index.js" \
  "$compiled_release/dist/scripts/registerCommands.js" \
  "$legacy_release/src/index.ts" \
  "$legacy_release/src/scripts/registerCommands.ts" \
  "$legacy_release/node_modules/tsx/dist/cli.mjs"

cat > "$fake_nvm_exec" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$CLEO_DISCORD_TEST_INVOCATION"
EOF
chmod 0755 "$fake_nvm_exec"

run_launcher() {
  CLEO_DISCORD_RELEASE_ROOT="$current_link" \
  CLEO_DISCORD_NVM_EXEC="$fake_nvm_exec" \
  CLEO_DISCORD_TEST_INVOCATION="$invocation_file" \
    bash "$launcher" "$1"
}

assert_invocation() {
  local expected="$1"
  local actual
  actual="$(<"$invocation_file")"
  [[ "$actual" == "$expected" ]] || {
    echo "Expected launcher invocation: $expected" >&2
    echo "Actual launcher invocation: $actual" >&2
    exit 1
  }
}

ln -s "$legacy_release" "$current_link"
run_launcher runtime
assert_invocation \
  "node $current_link/node_modules/tsx/dist/cli.mjs $current_link/src/index.ts"
run_launcher register-commands
assert_invocation \
  "node $current_link/node_modules/tsx/dist/cli.mjs $current_link/src/scripts/registerCommands.ts --global"

next_link="$fixture_root/.current-compiled"
ln -s "$compiled_release" "$next_link"
mv -Tf "$next_link" "$current_link"
run_launcher runtime
assert_invocation "node --enable-source-maps $current_link/dist/index.js"
run_launcher register-commands
assert_invocation \
  "node --enable-source-maps $current_link/dist/scripts/registerCommands.js --global"

next_link="$fixture_root/.current-legacy"
ln -s "$legacy_release" "$next_link"
mv -Tf "$next_link" "$current_link"
run_launcher runtime
assert_invocation \
  "node $current_link/node_modules/tsx/dist/cli.mjs $current_link/src/index.ts"
run_launcher register-commands
assert_invocation \
  "node $current_link/node_modules/tsx/dist/cli.mjs $current_link/src/scripts/registerCommands.ts --global"

if CLEO_DISCORD_RELEASE_ROOT="$current_link" \
  CLEO_DISCORD_NVM_EXEC="$fake_nvm_exec" \
  CLEO_DISCORD_TEST_INVOCATION="$invocation_file" \
  bash "$launcher" invalid >/dev/null 2>&1; then
  echo "Launcher accepted an invalid operation" >&2
  exit 1
fi

echo "Discord release launcher forward activation and rollback tests passed."
