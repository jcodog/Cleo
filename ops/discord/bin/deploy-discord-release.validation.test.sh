#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
controller="${CLEO_DISCORD_TEST_CONTROLLER:-$script_dir/deploy-discord-release}"
fixture_root="$(mktemp -d)"
trap 'rm -rf -- "$fixture_root"' EXIT

deploy_root="$fixture_root/deploy"
release_fixture="$fixture_root/release"
bin_dir="$fixture_root/bin"
runtime_check="$fixture_root/check-runtime"
env_file="$fixture_root/discord.env"
archive="$fixture_root/release.tar.gz"
checksum="$archive.sha256"
release_sha="0123456789abcdef0123456789abcdef01234567"
active_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
active_fingerprint="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
runtime_user="$(id -un)"
runtime_read_group="$(id -g)"
host_node="$(command -v node)"
release_platform="$($host_node -p '`${process.platform}-${process.arch}`')"
release_os="${release_platform%%-*}"
release_architecture="${release_platform#*-}"

mkdir -p "$deploy_root/releases" "$deploy_root/shared" "$bin_dir"
chmod 2775 "$deploy_root" "$deploy_root/releases" "$deploy_root/shared"
runtime_group="$(stat -c %G "$deploy_root")"
touch "$env_file"
touch "$deploy_root/shared/deployment.lock"
chmod 0640 "$deploy_root/shared/deployment.lock"

cat > "$runtime_check" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$bin_dir/sudo" <<'EOF'
#!/usr/bin/env bash
while [[ "${1:-}" == "-n" || "${1:-}" == "-u" ]]; do
  if [[ "$1" == "-u" ]]; then shift 2; else shift; fi
done
exec "$@"
EOF
cat > "$bin_dir/systemctl" <<'EOF'
#!/usr/bin/env bash
operation="${1:-}"
shift || true
case "$operation" in
  show)
    unit="$1"
    property="$3"
    case "$property" in
      LoadState) printf '%s\n' loaded ;;
      User) printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_USER" ;;
      Group) printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_GROUP" ;;
      SupplementaryGroups)
        printf '%s\n' "${CLEO_DISCORD_TEST_SUPPLEMENTARY_GROUPS:-$CLEO_DISCORD_TEST_RUNTIME_READ_GROUP}"
        ;;
      WorkingDirectory) printf '%s\n' "$CLEO_DISCORD_TEST_DEPLOY_ROOT/current" ;;
      EnvironmentFiles) printf '%s\n' "$CLEO_DISCORD_TEST_ENV_FILE" ;;
      ExecStart)
        if [[ "$unit" == *register* ]]; then
          printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_LAUNCHER register-commands"
        else
          printf '%s\n' "$CLEO_DISCORD_TEST_RUNTIME_LAUNCHER runtime"
        fi
        ;;
    esac
    ;;
  *) exit 0 ;;
esac
EOF
cat > "$bin_dir/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod 0755 \
  "$runtime_check" \
  "$bin_dir/flock" \
  "$bin_dir/sudo" \
  "$bin_dir/systemctl"

export PATH="$bin_dir:$PATH"
export CLEO_DISCORD_HOST_CONTRACT_VERSION=4
export CLEO_DISCORD_RELEASE_PLATFORM="$release_platform"
export CLEO_DISCORD_DEPLOY_ROOT="$deploy_root"
export CLEO_DISCORD_ENV_FILE="$env_file"
export CLEO_DISCORD_RUNTIME_USER="$runtime_user"
export CLEO_DISCORD_RUNTIME_GROUP="$runtime_group"
export CLEO_DISCORD_DEPLOY_GROUP="$runtime_group"
export CLEO_DISCORD_RUNTIME_READ_GROUP="$runtime_read_group"
export CLEO_DISCORD_DEPLOY_OWNER="$runtime_user"
export CLEO_DISCORD_DEPLOY_ROOT_OWNER="$runtime_user"
export CLEO_DISCORD_RUNTIME_LAUNCHER="$fixture_root/run-release"
export CLEO_DISCORD_RUNTIME_CHECK="$runtime_check"
export CLEO_DISCORD_HOST_NODE="$host_node"
export CLEO_DISCORD_STATE_READER="$script_dir/read-discord-deployment-state"
export CLEO_DISCORD_STATE_OWNER="$runtime_user"
export CLEO_DISCORD_STATE_GROUP="$runtime_group"
export CLEO_DISCORD_HEALTH_ATTEMPTS=1
export CLEO_DISCORD_HEALTH_DELAY_SECONDS=0
export CLEO_DISCORD_EXPECTED_SHA="$release_sha"
export CLEO_DISCORD_RELEASE_ARCHIVE="$archive"
export CLEO_DISCORD_RELEASE_CHECKSUM="$checksum"
export CLEO_DISCORD_TEST_RUNTIME_USER="$runtime_user"
export CLEO_DISCORD_TEST_RUNTIME_GROUP="$runtime_group"
export CLEO_DISCORD_TEST_DEPLOY_GROUP="$runtime_group"
export CLEO_DISCORD_TEST_RUNTIME_READ_GROUP="$runtime_read_group"
export CLEO_DISCORD_TEST_DEPLOY_ROOT="$deploy_root"
export CLEO_DISCORD_TEST_ENV_FILE="$env_file"
export CLEO_DISCORD_TEST_RUNTIME_LAUNCHER="$fixture_root/run-release"

create_valid_release() {
  rm -rf -- "$release_fixture"
  mkdir -p \
    "$release_fixture/dist/deployment" \
    "$release_fixture/dist/scripts"
  printf '%s\n' "$release_sha" > "$release_fixture/.cleo-release-sha"
  printf '%s\n' "$release_platform" > "$release_fixture/.cleo-release-platform"
  printf '%s\n' v24.15.0 > "$release_fixture/.nvmrc"
  for critical_path in \
    dist/index.js \
    dist/index.js.map \
    dist/scripts/registerCommands.js \
    dist/scripts/registerCommands.js.map \
    dist/deployment/validateReleaseArtifact.js \
    dist/deployment/validateReleaseArtifact.js.map; do
    printf '%s\n' "$critical_path" > "$release_fixture/$critical_path"
  done
  cat > "$release_fixture/runtime-artifact.json" <<'JSON'
{
  "schemaVersion": 2,
  "releaseManifest": "release-manifest.json",
  "runtimeEntrypoint": "dist/index.js",
  "commandRegistrationEntrypoint": "dist/scripts/registerCommands.js",
  "artifactValidatorEntrypoint": "dist/deployment/validateReleaseArtifact.js",
  "requiredFiles": [
    ".nvmrc",
    ".cleo-release-sha",
    ".cleo-release-platform",
    "release-manifest.json",
    "dist/index.js",
    "dist/index.js.map",
    "dist/scripts/registerCommands.js",
    "dist/scripts/registerCommands.js.map",
    "dist/deployment/validateReleaseArtifact.js",
    "dist/deployment/validateReleaseArtifact.js.map"
  ],
  "forbiddenFiles": ["bun.lock", "bunfig.toml"],
  "forbiddenPathPrefixes": ["src/", "node_modules/tsx/"]
}
JSON

  "$host_node" --input-type=module - \
    "$release_fixture" "$release_sha" "$release_os" "$release_architecture" <<'NODE'
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const [root, commitSha, platform, architecture] = process.argv.slice(2)
const contract = JSON.parse(readFileSync(path.join(root, "runtime-artifact.json"), "utf8"))
const criticalPaths = [
  contract.runtimeEntrypoint,
  `${contract.runtimeEntrypoint}.map`,
  contract.commandRegistrationEntrypoint,
  `${contract.commandRegistrationEntrypoint}.map`,
  contract.artifactValidatorEntrypoint,
  `${contract.artifactValidatorEntrypoint}.map`,
]
const criticalFileSha256 = Object.fromEntries(
  criticalPaths.map((relativePath) => [
    relativePath,
    createHash("sha256")
      .update(readFileSync(path.join(root, relativePath)))
      .digest("hex"),
  ])
)
const manifest = {
  architecture,
  artifactContractVersion: contract.schemaVersion,
  artifactValidatorEntrypoint: contract.artifactValidatorEntrypoint,
  buildTimestamp: "2026-08-17T20:00:00Z",
  commandFingerprint: criticalFileSha256[contract.commandRegistrationEntrypoint],
  commandRegistrationEntrypoint: contract.commandRegistrationEntrypoint,
  commitSha,
  criticalFileSha256,
  nodeVersion: "24.15.0",
  platform,
  runtimeEntrypoint: contract.runtimeEntrypoint,
}
writeFileSync(
  path.join(root, contract.releaseManifest),
  `${JSON.stringify(manifest, null, 2)}\n`
)
NODE
}

package_release() {
  rm -f -- "$archive" "$checksum"
  tar -czf "$archive" -C "$release_fixture" .
  (
    cd "$fixture_root"
    sha256sum "$(basename "$archive")" > "$(basename "$checksum")"
  )
}

reset_deployment() {
  rm -rf -- "$deploy_root/releases"
  mkdir -p "$deploy_root/releases"
  chmod 2775 "$deploy_root/releases"
  rm -f -- "$deploy_root/current" "$deploy_root/shared/deployment-state.env"
}

expect_rejected() {
  local name="$1"
  local expected_message="$2"
  local output="$fixture_root/controller-output"
  if bash "$controller" deploy >"$output" 2>&1; then
    echo "Host validation unexpectedly accepted $name" >&2
    exit 1
  fi
  grep -F "$expected_message" "$output" >/dev/null || {
    echo "Host validation rejected $name for the wrong reason" >&2
    cat "$output" >&2
    exit 1
  }
}

initialize_active_release() {
  mkdir -p "$deploy_root/releases/$active_sha"
  ln -s "$deploy_root/releases/$active_sha" "$deploy_root/current"
  printf 'APPLICATION_SHA=%s\nPREVIOUS_APPLICATION_SHA=\nCOMMAND_FINGERPRINT=%s\n' \
    "$active_sha" "$active_fingerprint" > "$deploy_root/shared/deployment-state.env"
  chmod 0640 "$deploy_root/shared/deployment-state.env"
}

expect_rejected_preserving_active() {
  local name="$1"
  local expected_message="$2"
  local state_snapshot="$fixture_root/active-state.snapshot"
  local current_before
  initialize_active_release
  current_before="$(readlink "$deploy_root/current")"
  cp "$deploy_root/shared/deployment-state.env" "$state_snapshot"
  expect_rejected "$name" "$expected_message"
  [[ "$(readlink "$deploy_root/current")" == "$current_before" ]]
  cmp "$state_snapshot" "$deploy_root/shared/deployment-state.env"
}

set_manifest_timestamp() {
  local value="$1"
  "$host_node" --input-type=module - "$release_fixture/release-manifest.json" "$value" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs"
const [manifestPath, value] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
manifest.buildTimestamp = value
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
NODE
}

assert_exact_release_permissions() {
  local release_root="$1"
  local entry

  while IFS= read -r -d '' entry; do
    [[ "$(stat -c %a "$entry")" == "750" ]] || {
      echo "Release directory mode was not normalized to 0750: $entry" >&2
      exit 1
    }
  done < <(find "$release_root" -type d -print0)

  while IFS= read -r -d '' entry; do
    [[ "$(stat -c %a "$entry")" == "640" ]] || {
      echo "Release file mode was not normalized to 0640: $entry" >&2
      exit 1
    }
  done < <(find "$release_root" -type f -print0)
}

export CLEO_DISCORD_TEST_SUPPLEMENTARY_GROUPS="$runtime_read_group $runtime_group"
expect_rejected \
  "a service unit with deployment-group write access" \
  "must not include supplementary group $runtime_group"
unset CLEO_DISCORD_TEST_SUPPLEMENTARY_GROUPS

reset_deployment
create_valid_release
find "$release_fixture" -type d -exec chmod 7750 {} +
find "$release_fixture" -type f -exec chmod 7640 {} +
[[ "$(stat -c %a "$release_fixture/dist/scripts")" == "7750" ]]
[[ "$(stat -c %a "$release_fixture/dist/index.js")" == "7640" ]]
package_release
[[ "$(stat -c %a "$deploy_root/releases")" == "2775" ]]
bash "$controller" deploy
assert_exact_release_permissions "$deploy_root/releases/$release_sha"
[[ "$(stat -c %a "$deploy_root/releases")" == "2775" ]]

reset_deployment
create_valid_release
package_release
mkdir -p "$deploy_root/releases/$release_sha"
cp -a "$release_fixture/." "$deploy_root/releases/$release_sha/"
find "$deploy_root/releases/$release_sha" -type d -exec chmod 7750 {} +
find "$deploy_root/releases/$release_sha" -type f -exec chmod 7640 {} +
[[ "$(stat -c %a "$deploy_root/releases/$release_sha")" == "7750" ]]
[[ "$(stat -c %a "$deploy_root/releases/$release_sha/dist/scripts")" == "7750" ]]
[[ "$(stat -c %a "$deploy_root/releases/$release_sha/dist/index.js")" == "7640" ]]
bash "$controller" deploy
assert_exact_release_permissions "$deploy_root/releases/$release_sha"
[[ "$(stat -c %a "$deploy_root/releases")" == "2775" ]]

for invalid_timestamp in \
  malformed \
  2026-02-30T20:00:00Z \
  2026-08-17T20:00:00.000Z; do
  reset_deployment
  create_valid_release
  set_manifest_timestamp "$invalid_timestamp"
  package_release
  expect_rejected "build timestamp $invalid_timestamp" "Discord release build timestamp is invalid"
done

reset_deployment
create_valid_release
rm -f -- "$archive" "$checksum"
tar -czf "$archive" --transform='s#^\./#../#' -C "$release_fixture" .
(
  cd "$fixture_root"
  sha256sum "$(basename "$archive")" > "$(basename "$checksum")"
)
expect_rejected "an archive traversal entry" "Discord release archive contains an unsafe path"

reset_deployment
create_valid_release
rm -f "$release_fixture/dist/index.js"
ln -s index.js.map "$release_fixture/dist/index.js"
package_release
expect_rejected "a symlinked critical file" "regular non-symlink path components"

reset_deployment
create_valid_release
mv "$release_fixture/dist" "$release_fixture/dist-real"
ln -s dist-real "$release_fixture/dist"
package_release
expect_rejected "a symlinked critical path component" "regular non-symlink path components"

reset_deployment
create_valid_release
rm -f "$release_fixture/dist/index.js"
mkdir "$release_fixture/dist/index.js"
package_release
expect_rejected "an irregular critical entry" "regular non-symlink path components"

reset_deployment
create_valid_release
mv "$release_fixture/release-manifest.json" "$release_fixture/release-manifest.real.json"
ln -s release-manifest.real.json "$release_fixture/release-manifest.json"
package_release
expect_rejected "a symlinked release manifest" "regular non-symlink path components"

reset_deployment
create_valid_release
package_release
ln -s "$release_fixture" "$deploy_root/releases/$release_sha"
expect_rejected "a staged release root escaping through a symlink" "regular non-symlink directory"

reset_deployment
create_valid_release
rm -f "$release_fixture/.nvmrc"
ln -s missing-nvmrc "$release_fixture/.nvmrc"
package_release
expect_rejected_preserving_active \
  "an archive with a dangling required-file symlink" \
  "Discord release contains a dangling symlink"

reset_deployment
create_valid_release
outside_required="$fixture_root/outside-required-file"
printf '%s\n' outside > "$outside_required"
rm -f "$release_fixture/.nvmrc"
ln -s "$outside_required" "$release_fixture/.nvmrc"
package_release
expect_rejected_preserving_active \
  "an archive with a staging-escaping required-file symlink" \
  "Discord release symlink escapes the staged release"

echo "Discord host release validation tests passed."
