#!/usr/bin/env bash
# Exercise the actual guard without host accounts, services or POSIX permission fixtures.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
controller="${CLEO_DISCORD_TEST_CONTROLLER:-$root/ops/discord/bin/deploy-discord-release}"
fixture_root="$(mktemp -d)"
trap 'rm -rf -- "$fixture_root"' EXIT
mkdir "$fixture_root/bin"
sed -n '/^verify_release_artifact() {$/,/^}$/p' "$controller" > "$fixture_root/guard.sh"
source "$fixture_root/guard.sh"
declare -F verify_release_artifact >/dev/null
release_archive="$fixture_root/release.tar.gz"
release_checksum="$release_archive.sha256"
printf 'checksum fixture\n' > "$release_archive"
(cd "$fixture_root" && sha256sum release.tar.gz > release.tar.gz.sha256)

# More than a pipe buffer after the first match forces a short-circuit reader
# to close before this producer finishes. No scheduling sleeps are necessary.
cat > "$fixture_root/bin/tar" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$GUARD_CASE" in
  safe) printf '%s\n' './dist/index.js' ;;
  absolute) printf '%s\n' '/outside' ;;
  failed) printf '%s\n' './dist/index.js'; exit 2 ;;
  traversal)
    printf '%s\n' '../outside'
    for ((i=0; i<5000; i++)); do printf '%0200d\n' "$i"; done
    ;;
  *) exit 99 ;;
esac
printf 'complete\n' > "$GUARD_COMPLETED"
EOF
chmod +x "$fixture_root/bin/tar"
export PATH="$fixture_root/bin:$PATH"
export GUARD_COMPLETED="$fixture_root/completed"
export GUARD_CASE
for GUARD_CASE in safe absolute traversal failed; do
  rm -f "$GUARD_COMPLETED"
  status=0
  verify_release_artifact > "$fixture_root/output" 2>&1 || status=$?
  if [[ "$GUARD_CASE" == safe ]]; then
    [[ "$status" == 0 && -f "$GUARD_COMPLETED" ]]
  else
    [[ "$status" != 0 ]] || {
      echo "Archive guard accepted $GUARD_CASE" >&2
      exit 1
    }
    if [[ "$GUARD_CASE" == failed ]]; then
      grep -F 'could not be listed safely' "$fixture_root/output" >/dev/null
    else
      grep -F 'contains an unsafe path' "$fixture_root/output" >/dev/null
      [[ -f "$GUARD_COMPLETED" ]]
    fi
  fi
done
echo 'Discord archive guard drains traversal listings and rejects listing failures.'
