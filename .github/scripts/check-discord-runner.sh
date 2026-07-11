#!/usr/bin/env bash
set -euo pipefail

deploy_root="${CLEO_DISCORD_DEPLOY_ROOT:-/srv/cleo/discord-bot}"
env_file="${CLEO_DISCORD_ENV_FILE:-/etc/cleo/discord-bot.env}"
service_name="${CLEO_DISCORD_SERVICE:-cleo-discord.service}"
command_service_name="${CLEO_DISCORD_COMMAND_SERVICE:-cleo-discord-register-commands.service}"
runtime_user="${CLEO_DISCORD_RUNTIME_USER:-cleo}"
runtime_group="${CLEO_DISCORD_RUNTIME_GROUP:-cleo}"
deploy_group="${CLEO_DISCORD_DEPLOY_GROUP:-cleo-deploy}"

fail() {
  echo "Discord production runner check failed: $*" >&2
  exit 1
}

unit_value() {
  systemctl show "$1" --property "$2" --value
}

contains_word() {
  local haystack="$1"
  local needle="$2"
  [[ " $haystack " == *" $needle "* ]]
}

[[ "$(id -un)" == "github-runner" ]] || fail "workflow is not running as github-runner"
[[ "$(uname -s)" == "Linux" ]] || fail "production runner is not Linux"
contains_word "$(id -nG)" "$deploy_group" || fail "github-runner is not in $deploy_group"

expected_node="v$(node -p "require('./package.json').engines.node")"
expected_pnpm="$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")"
[[ "$(node --version)" == "$expected_node" ]] || fail "Node version does not match package.json"
[[ "$(pnpm --version)" == "$expected_pnpm" ]] || fail "pnpm version does not match package.json"

for directory in "$deploy_root" "$deploy_root/releases" "$deploy_root/shared"; do
  [[ -d "$directory" ]] || fail "missing directory $directory"
  [[ -w "$directory" ]] || fail "github-runner cannot write $directory"
  [[ "$(stat -c %G "$directory")" == "$deploy_group" ]] ||
    fail "$directory is not owned by group $deploy_group"
done

[[ "$(unit_value "$service_name" LoadState)" == "loaded" ]] || fail "$service_name is not loaded"
[[ "$(unit_value "$service_name" User)" == "$runtime_user" ]] || fail "$service_name does not run as $runtime_user"
[[ "$(unit_value "$service_name" Group)" == "$runtime_group" ]] || fail "$service_name does not use group $runtime_group"
contains_word "$(unit_value "$service_name" SupplementaryGroups)" "$deploy_group" ||
  fail "$service_name is not a member of $deploy_group"
[[ "$(unit_value "$service_name" WorkingDirectory)" == "$deploy_root/current" ]] ||
  fail "$service_name has the wrong working directory"
[[ "$(unit_value "$service_name" EnvironmentFiles)" == *"$env_file"* ]] ||
  fail "$service_name does not load $env_file"
[[ "$(systemctl is-enabled "$service_name")" == "enabled" ]] || fail "$service_name is not enabled"

[[ "$(unit_value "$command_service_name" LoadState)" == "loaded" ]] ||
  fail "$command_service_name is not loaded"
[[ "$(unit_value "$command_service_name" User)" == "$runtime_user" ]] ||
  fail "$command_service_name does not run as $runtime_user"
[[ "$(unit_value "$command_service_name" Group)" == "$runtime_group" ]] ||
  fail "$command_service_name does not use group $runtime_group"
contains_word "$(unit_value "$command_service_name" SupplementaryGroups)" "$deploy_group" ||
  fail "$command_service_name is not a member of $deploy_group"
[[ "$(unit_value "$command_service_name" WorkingDirectory)" == "$deploy_root/current" ]] ||
  fail "$command_service_name has the wrong working directory"
[[ "$(unit_value "$command_service_name" EnvironmentFiles)" == *"$env_file"* ]] ||
  fail "$command_service_name does not load $env_file"

[[ ! -r "$env_file" ]] || fail "github-runner must not be able to read $env_file directly"
sudo -n -u "$runtime_user" /usr/bin/test -r "$env_file" ||
  fail "$runtime_user cannot read $env_file through the approved check"

sudo -n -l /usr/bin/systemctl restart "$service_name" >/dev/null 2>&1 ||
  fail "missing sudo rule for restarting $service_name"
sudo -n -l /usr/bin/systemctl stop "$service_name" >/dev/null 2>&1 ||
  fail "missing sudo rule for stopping $service_name"
sudo -n -l /usr/bin/systemctl start "$command_service_name" >/dev/null 2>&1 ||
  fail "missing sudo rule for starting $command_service_name"
sudo -n -l /usr/bin/systemctl reset-failed "$command_service_name" >/dev/null 2>&1 ||
  fail "missing sudo rule for resetting $command_service_name"
sudo -n -u "$runtime_user" -l /usr/bin/test -r "$env_file" >/dev/null 2>&1 ||
  fail "missing sudo rule for the runtime environment readability check"

marker="$deploy_root/releases/.runner-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}"
trap 'rm -f -- "$marker"' EXIT
: > "$marker"
[[ -O "$marker" ]] || fail "runner does not own its release marker"
rm -f -- "$marker"

echo "Discord production runner contract is ready."
