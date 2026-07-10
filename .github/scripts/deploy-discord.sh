#!/usr/bin/env bash
set -euo pipefail

operation="${1:-deploy}"
deploy_root="${CLEO_DISCORD_DEPLOY_ROOT:-/opt/cleo/discord}"
service_name="${CLEO_DISCORD_SERVICE:-cleo-discord.service}"
releases_dir="$deploy_root/releases"
shared_dir="$deploy_root/shared"
current_link="$deploy_root/current"
state_file="$shared_dir/deployment-state.env"
env_file="$shared_dir/.env.production"
repository_root="${GITHUB_WORKSPACE:-$(pwd)}"

application_sha=""
previous_application_sha=""
command_sha=""

if [[ -f "$state_file" ]]; then
  # The state file is written only by this script and contains validated SHAs.
  # shellcheck disable=SC1090
  source "$state_file"
  application_sha="${APPLICATION_SHA:-}"
  previous_application_sha="${PREVIOUS_APPLICATION_SHA:-}"
  command_sha="${COMMAND_SHA:-}"
fi

is_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

check_health() {
  for _ in {1..6}; do
    if systemctl --user is-active --quiet "$service_name"; then
      sleep 5
      continue
    fi
    return 1
  done
}

switch_release() {
  local sha="$1"
  local next_link="$deploy_root/.current-$sha"
  ln -s "$releases_dir/$sha" "$next_link"
  mv -Tf "$next_link" "$current_link"
  systemctl --user restart "$service_name"
}

register_commands() {
  local sha="$1"
  (
    cd "$releases_dir/$sha"
    pnpm commands:register:global
  )
}

write_state() {
  local next_application_sha="$1"
  local next_previous_sha="$2"
  local next_command_sha="$3"
  local temporary_state="$state_file.tmp"

  umask 077
  printf 'APPLICATION_SHA=%s\nPREVIOUS_APPLICATION_SHA=%s\nCOMMAND_SHA=%s\n' \
    "$next_application_sha" "$next_previous_sha" "$next_command_sha" \
    > "$temporary_state"
  mv -f "$temporary_state" "$state_file"
}

rollback_to() {
  local target_sha="$1"
  local failed_sha="$2"

  if ! is_sha "$target_sha" || [[ ! -d "$releases_dir/$target_sha" ]]; then
    echo "Rollback release is unavailable: $target_sha" >&2
    return 1
  fi

  switch_release "$target_sha" || return 1
  check_health || return 1

  local target_command_sha
  target_command_sha="$(<"$releases_dir/$target_sha/.cleo-command-sha")"
  if [[ "$target_command_sha" != "$command_sha" ]]; then
    register_commands "$target_sha" || return 1
  fi

  write_state "$target_sha" "$failed_sha" "$target_command_sha" || return 1
}

restore_after_failed_deploy() {
  local failure_message="$1"
  local failed_sha="$2"

  if ! is_sha "$application_sha" || [[ ! -d "$releases_dir/$application_sha" ]]; then
    echo "$failure_message; no previous release is available." >&2
    return
  fi

  if rollback_to "$application_sha" "$failed_sha"; then
    echo "$failure_message; restored $application_sha" >&2
  else
    echo "$failure_message; rollback to $application_sha also failed." >&2
  fi
}

mkdir -p "$releases_dir" "$shared_dir"

if [[ "$operation" == "rollback" ]]; then
  rollback_to "$previous_application_sha" "$application_sha"
  echo "Rolled back Discord production to $previous_application_sha"
  exit 0
fi

if [[ "$operation" != "deploy" ]]; then
  echo "Unknown operation: $operation" >&2
  exit 1
fi

sha="${GITHUB_SHA:-$(git -C "$repository_root" rev-parse HEAD)}"
if ! is_sha "$sha"; then
  echo "Deployment SHA is invalid." >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "Missing persistent Discord environment file: $env_file" >&2
  exit 1
fi

release_dir="$releases_dir/$sha"
if [[ ! -d "$release_dir" ]]; then
  staging_dir="$releases_dir/.staging-$sha"
  rm -rf -- "$staging_dir"
  pnpm --dir "$repository_root" --filter @workspace/discord-bot deploy \
    --legacy --prod "$staging_dir"
  rm -f -- "$staging_dir/.env.local"
  ln -s "$env_file" "$staging_dir/.env.local"
  mv "$staging_dir" "$release_dir"
fi

register_commands_for_release="$(
  pnpm --dir "$repository_root" --filter @workspace/discord-bot exec tsx \
    src/deployment/classifyChanges.ts commands "$command_sha" "$sha"
)"
next_command_sha="$command_sha"
if [[ "$register_commands_for_release" == "true" ]]; then
  next_command_sha="$sha"
fi
printf '%s\n' "$next_command_sha" > "$release_dir/.cleo-command-sha"

switch_release "$sha"
if ! check_health; then
  systemctl --user status "$service_name" --no-pager || true
  restore_after_failed_deploy "Discord health verification failed" "$sha"
  exit 1
fi

if [[ "$register_commands_for_release" == "true" ]]; then
  if ! register_commands "$sha"; then
    restore_after_failed_deploy "Command registration failed" "$sha"
    exit 1
  fi
else
  echo "Discord command registration unchanged; skipping."
fi

write_state "$sha" "$application_sha" "$next_command_sha"
echo "Deployed Discord production release $sha"
