#!/usr/bin/env bash
set -euo pipefail
umask 0027

operation="${1:-deploy}"
deploy_root="${CLEO_DISCORD_DEPLOY_ROOT:-/srv/cleo/discord-bot}"
env_file="${CLEO_DISCORD_ENV_FILE:-/etc/cleo/discord-bot.env}"
service_name="${CLEO_DISCORD_SERVICE:-cleo-discord.service}"
command_service_name="${CLEO_DISCORD_COMMAND_SERVICE:-cleo-discord-register-commands.service}"
runtime_user="${CLEO_DISCORD_RUNTIME_USER:-cleo}"
runtime_group="${CLEO_DISCORD_RUNTIME_GROUP:-cleo}"
deploy_group="${CLEO_DISCORD_DEPLOY_GROUP:-cleo-deploy}"
runtime_launcher="${CLEO_DISCORD_RUNTIME_LAUNCHER:-/usr/local/libexec/cleo/run-discord-release}"
release_archive="${CLEO_DISCORD_RELEASE_ARCHIVE:-}"
release_checksum="${CLEO_DISCORD_RELEASE_CHECKSUM:-}"
releases_dir="$deploy_root/releases"
shared_dir="$deploy_root/shared"
current_link="$deploy_root/current"
state_file="$shared_dir/deployment-state.env"
repository_root="${GITHUB_WORKSPACE:-$(pwd)}"

application_sha=""
previous_application_sha=""
command_sha=""
staging_dir=""

cleanup() {
  if [[ -n "$staging_dir" && -d "$staging_dir" ]]; then
    rm -rf -- "$staging_dir"
  fi
}
trap cleanup EXIT

systemctl_write() {
  sudo -n systemctl "$@"
}

unit_value() {
  systemctl show "$1" --property "$2" --value
}

contains_word() {
  local haystack="$1"
  local needle="$2"
  [[ " $haystack " == *" $needle "* ]]
}

assert_unit_contract() {
  local unit="$1"
  local operation="$2"

  [[ "$(unit_value "$unit" LoadState)" == "loaded" ]] || {
    echo "Required systemd unit is not loaded: $unit" >&2
    return 1
  }
  [[ "$(unit_value "$unit" User)" == "$runtime_user" ]] || {
    echo "$unit must run as $runtime_user." >&2
    return 1
  }
  [[ "$(unit_value "$unit" Group)" == "$runtime_group" ]] || {
    echo "$unit must use group $runtime_group." >&2
    return 1
  }
  contains_word "$(unit_value "$unit" SupplementaryGroups)" "$deploy_group" || {
    echo "$unit must include supplementary group $deploy_group." >&2
    return 1
  }
  [[ "$(unit_value "$unit" WorkingDirectory)" == "$current_link" ]] || {
    echo "$unit must use WorkingDirectory=$current_link." >&2
    return 1
  }
  [[ "$(unit_value "$unit" EnvironmentFiles)" == *"$env_file"* ]] || {
    echo "$unit must load EnvironmentFile=$env_file." >&2
    return 1
  }
  [[ "$(unit_value "$unit" ExecStart)" == *"$runtime_launcher $operation"* ]] || {
    echo "$unit must start $runtime_launcher $operation." >&2
    return 1
  }
}

if [[ ! -d "$deploy_root" || ! -d "$releases_dir" || ! -d "$shared_dir" ]]; then
  echo "Discord deployment directories are not prepared under $deploy_root." >&2
  exit 1
fi

for directory in "$deploy_root" "$releases_dir" "$shared_dir"; do
  if [[ ! -w "$directory" ]]; then
    echo "github-runner cannot write deployment directory: $directory" >&2
    exit 1
  fi
  if [[ "$(stat -c %G "$directory")" != "$deploy_group" ]]; then
    echo "Deployment directory must use group $deploy_group: $directory" >&2
    exit 1
  fi
done

assert_unit_contract "$service_name" runtime
assert_unit_contract "$command_service_name" register-commands

if ! sudo -n -u "$runtime_user" /usr/bin/test -r "$env_file"; then
  echo "Persistent Discord environment is missing or unreadable by $runtime_user: $env_file" >&2
  exit 1
fi

exec 9>"$shared_dir/deployment.lock"
if ! flock -n 9; then
  echo "Another Discord deployment or rollback is already running." >&2
  exit 1
fi

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
    if systemctl is-active --quiet "$service_name"; then
      sleep 5
      continue
    fi
    return 1
  done
}

switch_release() {
  local sha="$1"
  local next_link="$deploy_root/.current-$sha"
  rm -f -- "$next_link" || return 1
  ln -s "$releases_dir/$sha" "$next_link" || return 1
  mv -Tf "$next_link" "$current_link" || return 1
}

activate_release() {
  local sha="$1"
  switch_release "$sha" || return 1
  systemctl_write restart "$service_name" || return 1
}

register_commands() {
  systemctl_write reset-failed "$command_service_name" >/dev/null 2>&1 || true
  systemctl_write start "$command_service_name"
}

write_state() {
  local next_application_sha="$1"
  local next_previous_sha="$2"
  local next_command_sha="$3"
  local temporary_state="$state_file.tmp"

  printf 'APPLICATION_SHA=%s\nPREVIOUS_APPLICATION_SHA=%s\nCOMMAND_SHA=%s\n' \
    "$next_application_sha" "$next_previous_sha" "$next_command_sha" \
    > "$temporary_state" || return 1
  mv -f "$temporary_state" "$state_file" || return 1
}

rollback_to() {
  local target_sha="$1"
  local failed_sha="$2"

  if ! is_sha "$target_sha" || [[ ! -d "$releases_dir/$target_sha" ]]; then
    echo "Rollback release is unavailable: $target_sha" >&2
    return 1
  fi

  activate_release "$target_sha" || return 1
  check_health || return 1

  local target_command_sha
  if [[ ! -f "$releases_dir/$target_sha/.cleo-command-sha" ]]; then
    echo "Rollback command state is unavailable for $target_sha" >&2
    return 1
  fi
  target_command_sha="$(<"$releases_dir/$target_sha/.cleo-command-sha")" || return 1
  if [[ "$target_command_sha" != "$command_sha" ]]; then
    register_commands || return 1
  fi

  write_state "$target_sha" "$failed_sha" "$target_command_sha" || return 1
}

restore_after_failed_deploy() {
  local failure_message="$1"
  local failed_sha="$2"

  if ! is_sha "$application_sha" || [[ ! -d "$releases_dir/$application_sha" ]]; then
    systemctl_write stop "$service_name" || true
    rm -f -- "$current_link"
    echo "$failure_message; no previous release is available." >&2
    return
  fi

  if rollback_to "$application_sha" "$failed_sha"; then
    echo "$failure_message; restored $application_sha" >&2
  else
    echo "$failure_message; rollback to $application_sha also failed." >&2
  fi
}

verify_release_artifact() {
  [[ -f "$release_archive" ]] || {
    echo "Discord release archive is missing: $release_archive" >&2
    return 1
  }
  [[ -f "$release_checksum" ]] || {
    echo "Discord release checksum is missing: $release_checksum" >&2
    return 1
  }

  local checksum_dir checksum_name
  checksum_dir="$(dirname "$release_checksum")"
  checksum_name="$(basename "$release_checksum")"
  (
    cd "$checksum_dir"
    sha256sum -c "$checksum_name"
  ) || return 1

  if tar -tzf "$release_archive" | grep -Eq '(^|[/\\])\.\.([/\\]|$)|^[/\\]'; then
    echo "Discord release archive contains an unsafe path." >&2
    return 1
  fi
}

validate_staged_release() {
  local release_root="$1"
  local expected_sha="$2"
  local expected_platform
  expected_platform="$(node -p '`${process.platform}-${process.arch}`')"

  for bootstrap_path in \
    runtime-artifact.json \
    dist/deployment/validateReleaseArtifact.js; do
    [[ -e "$release_root/$bootstrap_path" ]] || {
      echo "Discord release is missing $bootstrap_path" >&2
      return 1
    }
  done

  node --input-type=module -e '
    import path from "node:path"
    import { pathToFileURL } from "node:url"
    const [root, expectedSha, expectedPlatform] = process.argv.slice(1)
    const validatorUrl = pathToFileURL(path.join(root, "dist/deployment/validateReleaseArtifact.js")).href
    const { validateReleaseArtifactDirectory } = await import(validatorUrl)
    validateReleaseArtifactDirectory(root, { expectedSha, expectedPlatform })
  ' "$release_root" "$expected_sha" "$expected_platform"
}

prepare_release_root() {
  local release_root="$1"

  if [[ "$(stat -c %G "$release_root")" != "$deploy_group" ]]; then
    echo "Discord release root must use group $deploy_group: $release_root" >&2
    return 1
  fi

  # Release archives include their root directory entry. Normalize it after
  # extraction so a restrictive packaging umask cannot prevent systemd from
  # entering WorkingDirectory as the cleo runtime user.
  chmod 0750 "$release_root"
}

stage_release() {
  local sha="$1"
  local release_dir="$releases_dir/$sha"

  verify_release_artifact || return 1

  if [[ -d "$release_dir" ]]; then
    prepare_release_root "$release_dir" || return 1
    validate_staged_release "$release_dir" "$sha" || return 1
    find "$release_dir" -type f -name '.env*' -delete
    return 0
  fi

  staging_dir="$releases_dir/.staging-$sha"
  rm -rf -- "$staging_dir"
  mkdir -p "$staging_dir"
  tar --no-same-owner -xzf "$release_archive" -C "$staging_dir"

  prepare_release_root "$staging_dir" || return 1
  validate_staged_release "$staging_dir" "$sha" || return 1
  cmp -s "$repository_root/.nvmrc" "$staging_dir/.nvmrc" || {
    echo "Discord release Node version does not match the checked-out revision." >&2
    return 1
  }

  find "$staging_dir" -type f -name '.env*' -delete
  mv "$staging_dir" "$release_dir"
  staging_dir=""
}

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

stage_release "$sha"
release_dir="$releases_dir/$sha"

register_commands_for_release="$(
  node "$repository_root/apps/discord-bot/src/deployment/classifyChanges.ts" \
    commands "$command_sha" "$sha"
)"
next_command_sha="$command_sha"
if [[ "$register_commands_for_release" == "true" ]]; then
  next_command_sha="$sha"
fi
printf '%s\n' "$next_command_sha" > "$release_dir/.cleo-command-sha"

if ! activate_release "$sha"; then
  systemctl status "$service_name" --no-pager || true
  restore_after_failed_deploy "Discord service restart failed" "$sha"
  exit 1
fi
if ! check_health; then
  systemctl status "$service_name" --no-pager || true
  restore_after_failed_deploy "Discord health verification failed" "$sha"
  exit 1
fi

if [[ "$register_commands_for_release" == "true" ]]; then
  if ! register_commands; then
    systemctl status "$command_service_name" --no-pager || true
    restore_after_failed_deploy "Command registration failed" "$sha"
    exit 1
  fi
else
  echo "Discord command registration unchanged; skipping."
fi

write_state "$sha" "$application_sha" "$next_command_sha"
echo "Deployed Discord production release $sha"
