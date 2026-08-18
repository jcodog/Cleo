#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this script as root: sudo bash ops/discord/bootstrap-host.sh" >&2
  exit 1
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deploy_root="/srv/cleo/discord-bot"
releases_dir="$deploy_root/releases"
shared_dir="$deploy_root/shared"
state_file="$deploy_root/shared/deployment-state.env"
lock_file="$deploy_root/shared/deployment.lock"
env_dir="/etc/cleo"
env_file="$env_dir/discord-bot.env"
libexec_dir="/usr/local/libexec/cleo"
host_node="$libexec_dir/node"
sudoers_target="/etc/sudoers.d/cleo-discord-deploy"
sudoers_candidate="$(mktemp)"
node_archive_tmp=""
node_extract_dir=""
node_staging=""

cleanup() {
  rm -f -- "$sudoers_candidate"
  [[ -z "$node_archive_tmp" ]] || rm -f -- "$node_archive_tmp"
  [[ -z "$node_extract_dir" ]] || rm -rf -- "$node_extract_dir"
  [[ -z "$node_staging" ]] || rm -f -- "$node_staging"
}
trap cleanup EXIT

require_file() {
  [[ -f "$repository_root/$1" ]] || {
    echo "Missing repository file: $1" >&2
    exit 1
  }
}

require_user() {
  getent passwd "$1" >/dev/null || {
    echo "Required user does not exist: $1" >&2
    exit 1
  }
}

require_user github-runner
require_user cleo

expected_node="$(tr -d '[:space:]' < "$repository_root/.nvmrc")"
trusted_node_version="v24.15.0"
trusted_node_archive="node-${trusted_node_version}-linux-x64.tar.xz"
trusted_node_sha256="472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6"

if [[ ! "$expected_node" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] ||   [[ "$expected_node" != "$trusted_node_version" ]]; then
  echo ".nvmrc must contain the pinned production Node version $trusted_node_version" >&2
  exit 1
fi

for required_command in curl tar sha256sum; do
  command -v "$required_command" >/dev/null || {
    echo "Required bootstrap command is missing: $required_command" >&2
    exit 1
  }
done

node_archive_tmp="$(mktemp "${TMPDIR:-/tmp}/cleo-node-archive.XXXXXX")"
node_extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/cleo-node-extract.XXXXXX")"
node_url="https://nodejs.org/download/release/$trusted_node_version/$trusted_node_archive"
curl --fail --silent --show-error --location   --proto '=https' --proto-redir '=https' --tlsv1.2   "$node_url" -o "$node_archive_tmp"
printf '%s  %s
' "$trusted_node_sha256" "$node_archive_tmp" | sha256sum -c -
tar --no-same-owner -xJf "$node_archive_tmp" -C "$node_extract_dir"
trusted_node="$node_extract_dir/${trusted_node_archive%.tar.xz}/bin/node"
if [[ ! -f "$trusted_node" || -L "$trusted_node" || ! -x "$trusted_node" ]]; then
  echo "Verified Node archive did not contain the expected regular executable." >&2
  exit 1
fi
if [[ "$("$trusted_node" --version)" != "$trusted_node_version" ]] ||   [[ "$("$trusted_node" -p '`${process.platform}-${process.arch}`')" != "linux-x64" ]]; then
  echo "Verified Node archive does not match the required version/platform." >&2
  exit 1
fi
trusted_node_hash="$(sha256sum "$trusted_node" | cut -d ' ' -f 1)"

for file in \
  .nvmrc \
  ops/discord/bin/check-discord-runner \
  ops/discord/bin/check-discord-env \
  ops/discord/bin/check-discord-runtime \
  ops/discord/bin/deploy-discord-release \
  ops/discord/bin/migrate-discord-deployment-state \
  ops/discord/bin/read-discord-deployment-state \
  ops/discord/bin/run-discord-release \
  ops/discord/discord-bot.env.example \
  ops/discord/systemd/cleo-discord.service \
  ops/discord/systemd/cleo-discord-register-commands.service \
  ops/discord/sudoers/cleo-discord-deploy; do
  require_file "$file"
done

deploy_group="cleo-deploy"
runtime_read_group="cleo-runtime"
deploy_owner="github-runner"
runtime_user="cleo"

groupadd --force "$deploy_group"
groupadd --force "$runtime_read_group"
usermod -aG "$deploy_group,$runtime_read_group" "$deploy_owner"
usermod -aG "$runtime_read_group" "$runtime_user"
gpasswd -d "$runtime_user" "$deploy_group" >/dev/null 2>&1 || true

install -d -o root -g "$deploy_group" -m 2775 "$deploy_root"
install -d -o root -g "$deploy_group" -m 2775 "$releases_dir"
install -d -o root -g "$deploy_group" -m 2775 "$shared_dir"

# Existing releases may have inherited the old writable deployment group. Make
# their contents readable, but never writable, by the isolated runtime group.
while IFS= read -r -d '' release_dir; do
  chown -hR "$deploy_owner:$runtime_read_group" "$release_dir"
  find "$release_dir" -type d -exec chmod 0750 {} +
  find "$release_dir" -type f -exec chmod 0640 {} +
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -print0)

if [[ -e "$lock_file" || -L "$lock_file" ]]; then
  if [[ ! -f "$lock_file" || -L "$lock_file" ]]; then
    echo "$lock_file must be a regular non-symlink file" >&2
    exit 1
  fi
  chown "$deploy_owner:$deploy_group" "$lock_file"
  chmod 0640 "$lock_file"
else
  install -o "$deploy_owner" -g "$deploy_group" -m 0640 /dev/null "$lock_file"
fi

install -d -o root -g cleo -m 0750 "$env_dir"
if [[ ! -e "$env_file" ]]; then
  install -o root -g cleo -m 0640 \
    "$repository_root/ops/discord/discord-bot.env.example" \
    "$env_file"
  echo "Created $env_file from the non-secret template. Replace every placeholder before smoke validation."
elif [[ -f "$env_file" && ! -L "$env_file" ]]; then
  chown root:cleo "$env_file"
  chmod 0640 "$env_file"
  echo "Preserved existing $env_file and enforced root:cleo 0640 permissions."
else
  echo "$env_file exists but is not a regular non-symlink file" >&2
  exit 1
fi

install -d -o root -g root -m 0755 "$libexec_dir"
node_staging="$(mktemp "$libexec_dir/.node.XXXXXX")"
install -o root -g root -m 0755 "$trusted_node" "$node_staging"
if [[ ! -f "$node_staging" || -L "$node_staging" ||   "$(stat -c %U:%G "$node_staging")" != "root:root" ]]; then
  echo "Staged Discord host Node is not a root-owned regular file." >&2
  exit 1
fi
if [[ "$(sha256sum "$node_staging" | cut -d ' ' -f 1)" != "$trusted_node_hash" ]]; then
  echo "Staged Discord host Node differs from the verified official runtime." >&2
  exit 1
fi
if [[ "$("$node_staging" --version)" != "$trusted_node_version" ]] ||   [[ "$("$node_staging" -p '`${process.platform}-${process.arch}`')" != "linux-x64" ]]; then
  echo "Staged Discord host Node failed version/platform verification." >&2
  exit 1
fi
if [[ -e "$host_node" || -L "$host_node" ]]; then
  if [[ ! -f "$host_node" || -L "$host_node" ]]; then
    echo "Discord host Node path is not a regular non-symlink file." >&2
    exit 1
  fi
fi
mv -fT -- "$node_staging" "$host_node"
if [[ ! -f "$host_node" || -L "$host_node" || ! -x "$host_node" ]] ||
  [[ "$(stat -c %U:%G "$host_node")" != "root:root" ]]; then
  echo "Installed Discord host Node is not a root-owned regular executable." >&2
  exit 1
fi
node_staging=""
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/check-discord-runner" \
  "$libexec_dir/check-discord-runner"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/check-discord-env" \
  "$libexec_dir/check-discord-env"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/deploy-discord-release" \
  "$libexec_dir/deploy-discord-release"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/migrate-discord-deployment-state" \
  "$libexec_dir/migrate-discord-deployment-state"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/read-discord-deployment-state" \
  "$libexec_dir/read-discord-deployment-state"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/check-discord-runtime" \
  "$libexec_dir/check-discord-runtime"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/run-discord-release" \
  "$libexec_dir/run-discord-release"

CLEO_DISCORD_DEPLOY_ROOT="$deploy_root" \
CLEO_DISCORD_STATE_OWNER="$deploy_owner" \
CLEO_DISCORD_STATE_GROUP="$deploy_group" \
CLEO_DISCORD_STATE_READER="$libexec_dir/read-discord-deployment-state" \
  "$libexec_dir/migrate-discord-deployment-state" "$state_file"

install -o root -g root -m 0644 \
  "$repository_root/ops/discord/systemd/cleo-discord.service" \
  /etc/systemd/system/cleo-discord.service
install -o root -g root -m 0644 \
  "$repository_root/ops/discord/systemd/cleo-discord-register-commands.service" \
  /etc/systemd/system/cleo-discord-register-commands.service

install -o root -g root -m 0440 \
  "$repository_root/ops/discord/sudoers/cleo-discord-deploy" \
  "$sudoers_candidate"
visudo -cf "$sudoers_candidate"
install -o root -g root -m 0440 "$sudoers_candidate" "$sudoers_target"
visudo -cf "$sudoers_target"

systemctl daemon-reload
systemctl enable cleo-discord.service
systemctl try-restart cleo-discord.service

cat <<EOF

Cleo Discord host files are installed.

Still required before runner smoke:
1. Edit $env_file with real production values.
2. Ensure the cleo user's NVM installation contains Node $expected_node.
3. Restart the GitHub Actions runner service so github-runner receives $deploy_group and $runtime_read_group membership.
4. Run Discord Production Runner Smoke from main.

An inactive bot service remains stopped until the first successful deployment; an active service was restarted to apply the read-only runtime group.
EOF
