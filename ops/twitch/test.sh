#!/usr/bin/env bash
set -euo pipefail
repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
for script in "$repository"/ops/twitch/bin/* "$repository/ops/twitch/bootstrap-host.sh"; do
  [[ "$script" == *.mjs ]] || bash -n "$script"
done
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
export CLEO_TWITCH_DEPLOY_ROOT="$test_root/host"
export CLEO_TWITCH_TOOLS="$test_root/tools"
export CLEO_TWITCH_READINESS_TIMEOUT=1
export TEST_LOG="$test_root/commands.log"
export TEST_READY=true TEST_RESTART=true TEST_RECOVER=true
mkdir -p "$CLEO_TWITCH_DEPLOY_ROOT"/{releases,shared} "$CLEO_TWITCH_TOOLS" "$test_root/mock" "$test_root/artifacts"
touch "$CLEO_TWITCH_DEPLOY_ROOT/shared/deployment.lock"
chmod 2770 "$CLEO_TWITCH_DEPLOY_ROOT/releases"
node="${TWITCH_TEST_NODE:-$(command -v node)}"
ln -s "$node" "$CLEO_TWITCH_TOOLS/node"
cp "$repository/apps/twitch-bot/src/deployment/validateArtifact.mjs" "$CLEO_TWITCH_TOOLS/validateArtifact.mjs"
cp "$repository/ops/twitch/bin/validate-twitch-artifact.mjs" "$CLEO_TWITCH_TOOLS/validate-twitch-artifact.mjs"
cat > "$test_root/mock/systemctl" <<'SH'
#!/usr/bin/env bash
printf 'systemctl %s\n' "$*" >> "$TEST_LOG"
case "$1" in
  reset-failed) touch "$CLEO_TWITCH_DEPLOY_ROOT/shared/start-limit-reset" ;;
  restart)
    [[ -f "$CLEO_TWITCH_DEPLOY_ROOT/shared/start-limit-reset" ]] || exit 1
    rm "$CLEO_TWITCH_DEPLOY_ROOT/shared/start-limit-reset"
    [[ "$TEST_RESTART" == true || "$(basename "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")")" == "$TEST_OLD_SHA" ]] ;;
  is-active) exit 0 ;;
  show) echo 4242 ;;
  stop) exit 0 ;;
  *) exit 1 ;;
esac
SH
cat > "$test_root/mock/sudo" <<'SH'
#!/usr/bin/env bash
printf 'sudo %s\n' "$*" >> "$TEST_LOG"
shift # -n
if [[ "${1:-}" == -u ]]; then
  shift 2
  [[ "$1" == "$CLEO_TWITCH_TOOLS/check-twitch-readiness" && "$2" == 4242 && "$3" =~ ^[1-9][0-9]*$ ]] || exit 1
  [[ "$TEST_READY" == true ]] && exit 0
  [[ "$TEST_RECOVER" == true && "$(basename "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")")" == "$TEST_OLD_SHA" ]]
else
  shift # fixed /usr/bin/systemctl
  if [[ "$1" == restart && "${TEST_INTERRUPT_ON_RESTART:-false}" == true ]]; then
    kill -KILL "$PPID" # Only this fixture's deployment controller parent.
    exit 1
  fi
  systemctl "$@"
fi
SH
cat > "$test_root/mock/chgrp" <<'SH'
#!/usr/bin/env bash
# The disposable fixture uses the test user's group, without host accounts.
exit 0
SH
chmod +x "$test_root/mock/"*
export PATH="$test_root/mock:$PATH"
export TEST_OLD_SHA="$(printf 'a%.0s' {1..40})"
new_sha="$(printf 'b%.0s' {1..40})"
next_sha="$(printf 'c%.0s' {1..40})"
"$node" --input-type=module - "$repository" "$test_root/artifacts" "$TEST_OLD_SHA" "$new_sha" "$next_sha" <<'NODE'
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
const [repo, output, ...shas] = process.argv.slice(2)
const { releaseFiles, validateArtifact } = await import(`file://${repo}/apps/twitch-bot/src/deployment/validateArtifact.mjs`)
for (const sha of shas) {
  const root = join(output, sha)
  mkdirSync(join(root, "dist/scripts"), { recursive: true })
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@workspace/twitch-bot", version: "0.1.0", type: "module" }))
  writeFileSync(join(root, "runtime-artifact.json"), readFileSync(join(repo, "apps/twitch-bot/runtime-artifact.json")))
  for (const path of releaseFiles.filter(p => p.endsWith(".js"))) writeFileSync(join(root, path), `// ${sha}\nexport {}\n`)
  const files = releaseFiles.map(path => { const data = readFileSync(join(root, path)); return { path, size: data.length, sha256: createHash("sha256").update(data).digest("hex") } })
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ contractVersion: 1, sha, service: "twitch-bot", platform: "linux-x64", nodeVersion: "v24.15.0", files }))
  await validateArtifact(root, sha)
  const archive = join(output, `cleo-twitch-${sha}.tar.gz`)
  execFileSync("tar", ["-czf", archive, "-C", root, "--", ...releaseFiles, "manifest.json"])
  writeFileSync(`${archive}.sha256`, `${createHash("sha256").update(readFileSync(archive)).digest("hex")}  cleo-twitch-${sha}.tar.gz\n`)
}
NODE
controller="$repository/ops/twitch/bin/deploy-twitch-release"
deploy() { bash "$controller" deploy "$1" "$test_root/artifacts/cleo-twitch-$1.tar.gz" "$test_root/artifacts/cleo-twitch-$1.tar.gz.sha256"; }
expect_failure() { if "$@"; then echo 'Expected deployment failure.' >&2; exit 1; fi; }
[[ "$(bash "$controller" contract-version)" == 2 ]]
grep -Fx 'ConditionPathIsDirectory=/srv/cleo/twitch-bot/current' "$repository/ops/twitch/systemd/cleo-twitch.service" >/dev/null
grep -F '/usr/bin/systemctl reset-failed cleo-twitch.service' "$repository/ops/twitch/sudoers/cleo-twitch-deploy" >/dev/null

# Interrupted first deployment has no rollback target and must stop cleanly.
export TEST_INTERRUPT_ON_RESTART=true
expect_failure deploy "$TEST_OLD_SHA"
export TEST_INTERRUPT_ON_RESTART=false
expect_failure bash "$controller" rollback
[[ ! -e "$CLEO_TWITCH_DEPLOY_ROOT/current" && ! -L "$CLEO_TWITCH_DEPLOY_ROOT/current" ]]

deploy "$TEST_OLD_SHA"
[[ "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")" == "$CLEO_TWITCH_DEPLOY_ROOT/releases/$TEST_OLD_SHA" ]]

export TEST_INTERRUPT_ON_RESTART=true
expect_failure deploy "$new_sha"
export TEST_INTERRUPT_ON_RESTART=false
"$node" --input-type=module - "$CLEO_TWITCH_DEPLOY_ROOT/shared/deployment-state.json" "$new_sha" "$TEST_OLD_SHA" <<'NODE'
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
const state = JSON.parse(readFileSync(process.argv[2], "utf8"))
assert.equal(state.result, "activating")
assert.equal(state.currentSha, process.argv[3])
assert.equal(state.previousSha, process.argv[4])
NODE
bash "$controller" rollback
[[ "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")" == "$CLEO_TWITCH_DEPLOY_ROOT/releases/$TEST_OLD_SHA" ]]

# Old host tooling could switch current while leaving the prior terminal record.
ln -sfn "$CLEO_TWITCH_DEPLOY_ROOT/releases/$new_sha" "$CLEO_TWITCH_DEPLOY_ROOT/current"
bash "$controller" rollback
[[ "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")" == "$CLEO_TWITCH_DEPLOY_ROOT/releases/$TEST_OLD_SHA" ]]
deploy "$new_sha"
[[ "$(stat -c %a "$CLEO_TWITCH_DEPLOY_ROOT/releases/$new_sha")" == 750 ]]
deploy "$new_sha" # Retain the earlier distinct rollback target on redeploy.
export TEST_READY=false
expect_failure deploy "$next_sha"
# The previous release in this fixture also failed readiness, so fail closed.
[[ "$(cat "$TEST_LOG")" == *'systemctl stop cleo-twitch.service'* ]]
export TEST_READY=true
deploy "$TEST_OLD_SHA"
export TEST_READY=false
expect_failure deploy "$new_sha"
[[ "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")" == "$CLEO_TWITCH_DEPLOY_ROOT/releases/$TEST_OLD_SHA" ]]
export TEST_READY=true TEST_RESTART=false
expect_failure deploy "$new_sha"
[[ "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")" == "$CLEO_TWITCH_DEPLOY_ROOT/releases/$TEST_OLD_SHA" ]]
export TEST_RESTART=true
deploy "$new_sha"
bash "$controller" rollback
[[ "$(readlink -f "$CLEO_TWITCH_DEPLOY_ROOT/current")" == "$CLEO_TWITCH_DEPLOY_ROOT/releases/$TEST_OLD_SHA" ]]
rm -rf -- "$CLEO_TWITCH_DEPLOY_ROOT/releases/$new_sha"
expect_failure bash "$controller" rollback
cp "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz.sha256" "$test_root/good.sha256"
printf '%064d  cleo-twitch-%s.tar.gz\n' 0 "$next_sha" > "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz.sha256"
expect_failure deploy "$next_sha"
cp "$test_root/good.sha256" "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz.sha256"
cp "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz" "$test_root/good.tar.gz"
printf 'test-only-secret' > "$test_root/artifacts/$next_sha/.env"
tar -czf "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz" -C "$test_root/artifacts/$next_sha" .env
printf '%s  cleo-twitch-%s.tar.gz\n' "$(sha256sum "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz" | cut -d ' ' -f 1)" "$next_sha" > "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz.sha256"
expect_failure deploy "$next_sha"
cp "$test_root/good.tar.gz" "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz"
cp "$test_root/good.sha256" "$test_root/artifacts/cleo-twitch-$next_sha.tar.gz.sha256"
# Restore and corrupt the state-selected rollback target, not the current release.
mkdir "$CLEO_TWITCH_DEPLOY_ROOT/releases/$new_sha"
tar -xzf "$test_root/artifacts/cleo-twitch-$new_sha.tar.gz" -C "$CLEO_TWITCH_DEPLOY_ROOT/releases/$new_sha"
printf 'tampered' > "$CLEO_TWITCH_DEPLOY_ROOT/releases/$new_sha/dist/index.js"
expect_failure bash "$controller" rollback
rm -rf -- "$CLEO_TWITCH_DEPLOY_ROOT/releases/$new_sha"
rm "$CLEO_TWITCH_DEPLOY_ROOT/current"
export TEST_READY=false TEST_RECOVER=false
expect_failure deploy "$new_sha"
"$node" --input-type=module - "$CLEO_TWITCH_DEPLOY_ROOT/shared/deployment-state.json" <<'NODE'
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
assert.equal(JSON.parse(readFileSync(process.argv[2], "utf8")).result, "unhealthy")
NODE
echo 'Twitch artifact, activation, readiness, rollback and missing-previous behavior checks passed. Controller performs no source build or smoke send.'
