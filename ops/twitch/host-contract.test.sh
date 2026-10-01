#!/usr/bin/env bash
set -euo pipefail
repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'chmod -R u+rwX -- "$fixture"; rm -rf -- "$fixture"' EXIT
chmod 755 "$fixture"
root="$fixture/srv/cleo/twitch-bot"
tools="$fixture/usr/local/libexec/cleo/twitch"
mkdir -p "$root"/{releases,shared} "$tools" "$fixture/etc/cleo" "$fixture/mock"
touch "$root/shared/deployment.lock" "$fixture/etc/cleo/twitch-bot.env"
chmod 000 "$fixture/etc/cleo/twitch-bot.env"
chmod 777 "$root" "$root/releases" "$root/shared"
for path in "$fixture/srv" "$fixture/srv/cleo" "$fixture/usr" "$fixture/usr/local" "$fixture/usr/local/libexec" "$fixture/usr/local/libexec/cleo" "$tools" "$fixture/mock"; do chmod 555 "$path"; done
# Populate before freezing the tooling directory.
chmod 755 "$tools"
for name in validateArtifact.mjs validate-twitch-artifact.mjs run-twitch-release check-twitch-readiness check-twitch-secrets check-twitch-runner; do touch "$tools/$name"; done
cp "$repository/ops/twitch/nginx/eventsub.conf.example" "$tools/eventsub.nginx.example"
cat > "$tools/deploy-twitch-release" <<'SH'
#!/usr/bin/env bash
[[ "${TEST_CASE:-}" != stale ]] && echo 3 || echo 2
SH
cat > "$tools/node" <<'SH'
#!/usr/bin/env bash
[[ "$1" != --version ]] && echo linux-x64 || echo v24.15.0
SH
chmod 444 "$tools"/*
chmod 555 "$tools/node" "$tools/deploy-twitch-release"
chmod 555 "$tools"
# Run the real checker against fixture paths, with OS/service facts supplied by mocks.
sed -e "s|/srv|$fixture/srv|g" -e "s|/usr/local|$fixture/usr/local|g" -e "s|/etc/cleo|$fixture/etc/cleo|g" "$repository/ops/twitch/bin/check-twitch-runner" > "$fixture/check"
chmod 755 "$fixture/mock"
cat > "$fixture/mock/command" <<'SH'
#!/usr/bin/env bash
case "$(basename "$0")" in
 id) [[ "$*" == *-un* ]] && echo github-runner || { [[ "$*" == *cleo* ]] && echo cleo-runtime || echo 'cleo-runtime cleo-deploy'; } ;;
 uname) echo Linux ;;
 find) exit 0 ;;
 sudo) [[ "${TEST_CASE:-}" != secrets || "$*" != *check-twitch-secrets* ]] ;;
 stat)
  path="${@: -1}"
  case "$2" in
   %U) echo root ;;
   %U:%G) echo root:root ;;
   *) case "$path" in
     */tools|*/twitch) [[ "$path" == */libexec/* ]] && echo root:root:755 || echo root:cleo-deploy:2771 ;;
     */twitch-bot|*/releases) echo root:cleo-deploy:2771 ;;
     */shared) echo root:cleo-deploy:2770 ;;
     */deployment.lock) echo github-runner:cleo-deploy:640 ;;
     */eventsub.nginx.example) [[ "${TEST_CASE:-}" != ingressMode ]] && echo root:root:644 || echo root:root:666 ;;
     *) echo root:root:755 ;;
    esac ;;
  esac ;;
 systemctl)
  if [[ "$1" == is-enabled ]]; then echo enabled; exit; fi
  case "$4" in
   LoadState) echo loaded;; User) [[ "${TEST_CASE:-}" != serviceUser ]] && echo cleo || echo root;; Group) echo cleo;;
   SupplementaryGroups) echo cleo-runtime;; WorkingDirectory) echo "$FIXTURE_ROOT/current";;
   EnvironmentFiles) echo "$FIXTURE_ENV";; ExecStart) echo "$FIXTURE_TOOLS/run-twitch-release runtime";;
   NoNewPrivileges|ProtectHome) echo yes;; ProtectSystem) echo strict;;
  esac ;;
 esac
SH
for command in id uname find sudo stat systemctl; do cp "$fixture/mock/command" "$fixture/mock/$command"; chmod 755 "$fixture/mock/$command"; done
chmod 555 "$fixture/mock"
export FIXTURE_ROOT="$root" FIXTURE_TOOLS="$tools" FIXTURE_ENV="$fixture/etc/cleo/twitch-bot.env"
export PATH="$fixture/mock:$PATH"
run_check() {
 if [[ "$EUID" == 0 ]]; then runuser -u nobody --preserve-environment -- bash "$fixture/check"; else bash "$fixture/check"; fi
}
export TEST_CASE=success
run_check
for TEST_CASE in stale secrets serviceUser ingressMode; do export TEST_CASE; if run_check; then echo "Expected $TEST_CASE rejection" >&2; exit 1; fi; done
export TEST_CASE=success
chmod 755 "$tools"
mv "$tools/eventsub.nginx.example" "$tools/saved.example"
chmod 555 "$tools" # tools is writable to root/fixture owner only
if run_check; then echo 'Expected missing ingress rejection' >&2; exit 1; fi
chmod 755 "$tools"
mv "$tools/saved.example" "$tools/eventsub.nginx.example"
chmod 555 "$tools"
echo 'Host contract 3 fixture success, secret isolation, ingress and service failure checks passed.'
