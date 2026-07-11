#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
validator="$script_dir/check-discord-env"
temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "$temporary_dir"' EXIT

write_valid_env() {
  local target="$1"
  cat > "$target" <<'ENV'
NODE_ENV=production
CONVEX_URL=https://example.convex.cloud
DISCORD_BOT_CONVEX_SECRET=0123456789abcdef0123456789abcdef
DISCORD_BOT_TOKEN=valid.discord.production.token
DISCORD_APPLICATION_ID=123456789012345678
DISCORD_BOT_RUNTIME_MODE=single
DISCORD_BOT_SHARD_COUNT=auto
DISCORD_CLIENT_ID=123456789012345678
ENV
}

expect_failure() {
  local expected_message="$1"
  local target="$2"
  local output

  if output="$(bash "$validator" "$target" 2>&1)"; then
    echo "Expected validation to fail for $target" >&2
    exit 1
  fi

  [[ "$output" == *"$expected_message"* ]] || {
    echo "Expected failure containing: $expected_message" >&2
    echo "Actual output: $output" >&2
    exit 1
  }

  [[ "$output" != *"0123456789abcdef0123456789abcdef"* ]] || {
    echo "Validator exposed a secret value" >&2
    exit 1
  }
}

valid_env="$temporary_dir/valid.env"
write_valid_env "$valid_env"
valid_output="$(bash "$validator" "$valid_env")"
[[ "$valid_output" == "Discord production environment is valid." ]]

missing_env="$temporary_dir/missing.env"
write_valid_env "$missing_env"
sed -i '/^DISCORD_BOT_TOKEN=/d' "$missing_env"
expect_failure "DISCORD_BOT_TOKEN must be declared exactly once" "$missing_env"

duplicate_env="$temporary_dir/duplicate.env"
write_valid_env "$duplicate_env"
echo 'DISCORD_APPLICATION_ID=123456789012345679' >> "$duplicate_env"
expect_failure "DISCORD_APPLICATION_ID must be declared exactly once" "$duplicate_env"

placeholder_env="$temporary_dir/placeholder.env"
write_valid_env "$placeholder_env"
sed -i 's#https://example.convex.cloud#https://your-production.convex.cloud#' "$placeholder_env"
expect_failure "CONVEX_URL still contains a placeholder value" "$placeholder_env"

invalid_url_env="$temporary_dir/invalid-url.env"
write_valid_env "$invalid_url_env"
sed -i 's#https://example.convex.cloud#https://example.convex.cloud/path#' "$invalid_url_env"
expect_failure "CONVEX_URL must be an HTTPS origin" "$invalid_url_env"

invalid_mode_env="$temporary_dir/invalid-mode.env"
write_valid_env "$invalid_mode_env"
sed -i 's/DISCORD_BOT_RUNTIME_MODE=single/DISCORD_BOT_RUNTIME_MODE=cluster/' "$invalid_mode_env"
expect_failure "DISCORD_BOT_RUNTIME_MODE must be single or sharded" "$invalid_mode_env"

echo "Discord production environment validator tests passed."
