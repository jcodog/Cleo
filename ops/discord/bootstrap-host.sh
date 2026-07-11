#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this script as root: sudo bash ops/discord/bootstrap-host.sh" >&2
  exit 1
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deploy_root="/srv/cleo/discord-bot"
env_dir="/etc/cleo"
env_file="$env_dir/discord-bot.env"
libexec_dir="/usr/local/libexec/cleo"

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

for file in \
  ops/discord/bin/check-discord-env \
  ops/discord/bin/check-discord-runtime \
  ops/discord/discord-bot.env.example \
  ops/discord/systemd/cleo-discord.service \
  ops/discord/systemd/cleo-discord-register-commands.service \
  ops/discord/sudoers/cleo-discord-deploy; do
  require_file "$file"
done

groupadd --force cleo-deploy
usermod -aG cleo-deploy github-runner
usermod -aG cleo-deploy cleo

install -d -o root -g cleo-deploy -m 2775 "$deploy_root"
install -d -o root -g cleo-deploy -m 2775 "$deploy_root/releases"
install -d -o root -g cleo-deploy -m 2775 "$deploy_root/shared"

install -d -o root -g cleo -m 0750 "$env_dir"
if [[ ! -e "$env_file" ]]; then
  install -o root -g cleo -m 0640 \
    "$repository_root/ops/discord/discord-bot.env.example" \
    "$env_file"
  echo "Created $env_file from the non-secret template. Replace every placeholder before smoke validation."
else
  chown root:cleo "$env_file"
  chmod 0640 "$env_file"
  echo "Preserved existing $env_file and enforced root:cleo 0640 permissions."
fi

install -d -o root -g root -m 0755 "$libexec_dir"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/check-discord-env" \
  "$libexec_dir/check-discord-env"
install -o root -g root -m 0755 \
  "$repository_root/ops/discord/bin/check-discord-runtime" \
  "$libexec_dir/check-discord-runtime"

install -o root -g root -m 0644 \
  "$repository_root/ops/discord/systemd/cleo-discord.service" \
  /etc/systemd/system/cleo-discord.service
install -o root -g root -m 0644 \
  "$repository_root/ops/discord/systemd/cleo-discord-register-commands.service" \
  /etc/systemd/system/cleo-discord-register-commands.service
install -o root -g root -m 0440 \
  "$repository_root/ops/discord/sudoers/cleo-discord-deploy" \
  /etc/sudoers.d/cleo-discord-deploy

visudo -cf /etc/sudoers.d/cleo-discord-deploy
systemctl daemon-reload
systemctl enable cleo-discord.service

expected_node="$(tr -d '[:space:]' < "$repository_root/.nvmrc")"
expected_pnpm="$(node -p "require('$repository_root/package.json').packageManager.split('@')[1].split('+')[0]" 2>/dev/null || true)"

cat <<EOF

Cleo Discord host files are installed.

Still required before runner smoke:
1. Edit $env_file with real production values.
2. Ensure the cleo user's NVM installation contains Node $expected_node.
3. Restart the GitHub Actions runner service so github-runner receives cleo-deploy membership.
4. Run Discord Production Runner Smoke from main.

Expected pnpm for Actions jobs: ${expected_pnpm:-see package.json}
The bot service was enabled but not started; the first successful deployment creates the current release.
EOF
