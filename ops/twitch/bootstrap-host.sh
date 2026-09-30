#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run as root from a reviewed checkout.' >&2; exit 1; }
repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
root=/srv/cleo/twitch-bot
tools=/usr/local/libexec/cleo/twitch
for directory in "$root" "$root/releases" "$root/shared" "$tools" /etc/cleo /var/lib/cleo-twitch; do
  if [[ -e "$directory" || -L "$directory" ]]; then [[ -d "$directory" && ! -L "$directory" ]] || exit 1; fi
done
for user in cleo github-runner; do getent passwd "$user" >/dev/null || { echo "Required existing user: $user" >&2; exit 1; }; done
[[ "$(tr -d '[:space:]' < "$repository/.nvmrc")" == v24.15.0 ]] || exit 1
for command in curl tar sha256sum visudo; do command -v "$command" >/dev/null; done
temporary="$(mktemp -d)"
trap 'rm -rf -- "$temporary"' EXIT
archive=node-v24.15.0-linux-x64.tar.xz
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
  "https://nodejs.org/download/release/v24.15.0/$archive" -o "$temporary/$archive"
printf '%s  %s\n' 472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6 "$temporary/$archive" | sha256sum -c -
tar --no-same-owner -xJf "$temporary/$archive" -C "$temporary"
node="$temporary/node-v24.15.0-linux-x64/bin/node"
[[ "$("$node" --version)" == v24.15.0 && "$("$node" -p '`${process.platform}-${process.arch}`')" == linux-x64 ]] || exit 1
groupadd --force cleo-deploy
groupadd --force cleo-runtime
usermod -aG cleo-deploy,cleo-runtime github-runner
usermod -aG cleo-runtime cleo
gpasswd -d cleo cleo-deploy >/dev/null 2>&1 || true
install -d -o root -g cleo-deploy -m 2770 "$root" "$root/releases" "$root/shared"
if [[ ! -e "$root/shared/deployment.lock" ]]; then
  install -o github-runner -g cleo-deploy -m 0640 /dev/null "$root/shared/deployment.lock"
else
  [[ -f "$root/shared/deployment.lock" && ! -L "$root/shared/deployment.lock" ]] || exit 1
  chown github-runner:cleo-deploy "$root/shared/deployment.lock"
  chmod 0640 "$root/shared/deployment.lock"
fi
# The runtime needs traversal of the boundary, but cannot list or write it.
chmod o+x "$root" "$root/releases"
install -d -o root -g root -m 0755 "$tools"
install -o root -g root -m 0755 "$node" "$tools/node"
for script in run-twitch-release check-twitch-readiness check-twitch-secrets deploy-twitch-release check-twitch-runner; do
  install -o root -g root -m 0755 "$repository/ops/twitch/bin/$script" "$tools/$script"
done
install -o root -g root -m 0644 "$repository/apps/twitch-bot/src/deployment/validateArtifact.mjs" "$tools/validateArtifact.mjs"
install -o root -g root -m 0644 "$repository/ops/twitch/bin/validate-twitch-artifact.mjs" "$tools/validate-twitch-artifact.mjs"
install -d -o root -g cleo -m 0750 /etc/cleo
env_file=/etc/cleo/twitch-bot.env
if [[ ! -e "$env_file" && ! -L "$env_file" ]]; then
  install -o root -g cleo -m 0640 "$repository/ops/twitch/twitch-bot.env.example" "$env_file"
else
  [[ -f "$env_file" && ! -L "$env_file" ]] || exit 1
  chown root:cleo "$env_file"; chmod 0640 "$env_file"
fi
install -d -o cleo -g cleo -m 0700 /var/lib/cleo-twitch
install -o root -g root -m 0644 "$repository/ops/twitch/systemd/cleo-twitch.service" /etc/systemd/system/cleo-twitch.service
visudo -cf "$repository/ops/twitch/sudoers/cleo-twitch-deploy"
install -o root -g root -m 0440 "$repository/ops/twitch/sudoers/cleo-twitch-deploy" /etc/sudoers.d/cleo-twitch-deploy
systemctl daemon-reload
systemctl enable cleo-twitch.service
echo 'Twitch host contract 1 installed. Configure secrets and the private bot grant. Restart the runner session to apply groups. Service has not been started.'
