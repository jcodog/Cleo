#!/usr/bin/env bash
set -euo pipefail
umask 0027

repository_root="${GITHUB_WORKSPACE:-$(pwd)}"
output_dir="${1:-${RUNNER_TEMP:-/tmp}/cleo-discord-artifact}"
sha="${CLEO_DISCORD_RELEASE_SHA:-$(git -C "$repository_root" rev-parse HEAD)}"
release_platform="$(node -p '`${process.platform}-${process.arch}`')"
discord_root="$repository_root/apps/discord-bot"

is_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

if ! is_sha "$sha"; then
  echo "Release SHA is invalid: $sha" >&2
  exit 1
fi

if [[ "$release_platform" != "linux-arm64" ]]; then
  echo "Discord production releases must be packaged for linux-arm64; got $release_platform" >&2
  exit 1
fi

command -v bun >/dev/null || {
  echo "Bun is required on the GitHub-hosted packaging runner." >&2
  exit 1
}

assert_no_dist_symlinks() {
  local root="$1"
  local link_path
  while IFS= read -r -d '' link_path; do
    echo "Validated Discord build output must not contain symlinks: $link_path" >&2
    return 1
  done < <(find "$root/dist" -type l -print0)
}

snapshot_dist() {
  local root="$1"
  local entry
  (
    cd "$root"
    while IFS= read -r -d '' entry; do
      if [[ -L "$entry" ]]; then
        printf 'link %s -> %s\n' "$entry" "$(readlink -- "$entry")"
      else
        sha256sum "$entry"
      fi
    done < <(find dist \( -type f -o -type l \) -print0 | sort -z)
  )
}

assert_bundle_symlinks() {
  local root="$1"
  local link_path resolved_path
  while IFS= read -r -d '' link_path; do
    if ! resolved_path="$(readlink -f -- "$link_path")"; then
      echo "Packaged Discord release contains a dangling symlink: $link_path" >&2
      return 1
    fi

    case "$resolved_path" in
      "$root" | "$root"/*) ;;
      *)
        echo "Packaged Discord release symlink escapes the bundle: $link_path -> $resolved_path" >&2
        return 1
        ;;
    esac
  done < <(find "$root" -type l -print0)
}

assert_no_dist_symlinks "$discord_root"

compiled_paths=(
  dist/index.js
  dist/index.js.map
  dist/scripts/registerCommands.js
  dist/scripts/registerCommands.js.map
  dist/deployment/validateReleaseArtifact.js
  dist/deployment/validateReleaseArtifact.js.map
)
for compiled_path in "${compiled_paths[@]}"; do
  if [[ ! -f "$discord_root/$compiled_path" ]]; then
    echo "Validated Discord build output is missing $compiled_path" >&2
    exit 1
  fi
done

bundle_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/cleo-discord-bundle.XXXXXX")"
compiled_snapshot="$(mktemp "${RUNNER_TEMP:-/tmp}/cleo-discord-dist.XXXXXX")"
trap 'rm -rf -- "$bundle_dir"; rm -f -- "$compiled_snapshot"' EXIT

rm -rf -- "$output_dir"
mkdir -p "$output_dir"
snapshot_dist "$discord_root" > "$compiled_snapshot"

# Recreate the locked workspace graph in a temporary directory, then install
# only the Discord runtime closure. A hoisted staging layout is intentional:
# the immutable release runs under Node and must not depend on workspace or
# external-cache symlinks.
install -m 0644 "$repository_root/package.json" "$bundle_dir/package.json"
install -m 0644 "$repository_root/bun.lock" "$bundle_dir/bun.lock"
install -m 0644 "$repository_root/bunfig.toml" "$bundle_dir/bunfig.toml"

while IFS= read -r manifest; do
  relative_manifest="${manifest#"$repository_root/"}"
  install -d "$bundle_dir/$(dirname "$relative_manifest")"
  install -m 0644 "$manifest" "$bundle_dir/$relative_manifest"
done < <(
  find "$repository_root/apps" "$repository_root/packages" \
    -mindepth 2 -maxdepth 2 -type f -name package.json -print
)

(
  cd "$bundle_dir"
  bun install --frozen-lockfile --omit=dev \
    --filter @workspace/discord-bot --linker hoisted
)

self_workspace_link="$bundle_dir/node_modules/@workspace/discord-bot"
if [[ -L "$self_workspace_link" ]]; then
  self_workspace_target="$(readlink -f -- "$self_workspace_link")"
  if [[ "$self_workspace_target" != "$bundle_dir/apps/discord-bot" ]]; then
    echo "Discord workspace self-link has an unexpected target: $self_workspace_target" >&2
    exit 1
  fi
  rm -f -- "$self_workspace_link"
fi

rm -rf -- "$bundle_dir/apps" "$bundle_dir/packages"
rm -f -- "$bundle_dir/bun.lock" "$bundle_dir/bunfig.toml"
find "$bundle_dir/node_modules" -type d -name .bin -prune -exec rm -rf -- {} +
assert_bundle_symlinks "$bundle_dir"

cp -a "$discord_root/dist" "$bundle_dir/dist"
assert_no_dist_symlinks "$bundle_dir"
assert_bundle_symlinks "$bundle_dir"
snapshot_dist "$discord_root" | diff -u "$compiled_snapshot" - >/dev/null || {
  echo "Packaging mutated the validated Discord build output." >&2
  exit 1
}
snapshot_dist "$bundle_dir" | diff -u "$compiled_snapshot" - >/dev/null || {
  echo "Packaged Discord build differs from the validated build output." >&2
  exit 1
}

install -m 0644 \
  "$discord_root/runtime-artifact.json" \
  "$bundle_dir/runtime-artifact.json"

node --input-type=module - "$repository_root" "$bundle_dir/package.json" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const [repositoryRoot, outputPath] = process.argv.slice(2)
const rootManifest = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8")
)
const appManifest = JSON.parse(
  readFileSync(
    path.join(repositoryRoot, "apps/discord-bot/package.json"),
    "utf8"
  )
)
const runtimeManifest = {
  name: appManifest.name,
  version: appManifest.version,
  private: true,
  type: appManifest.type,
  engines: rootManifest.engines,
  scripts: {
    start: appManifest.scripts["start:production"],
    "commands:register": appManifest.scripts["commands:register:production"],
  },
  dependencies: appManifest.dependencies,
}

writeFileSync(outputPath, `${JSON.stringify(runtimeManifest, null, 2)}\n`)
NODE

install -m 0644 "$repository_root/.nvmrc" "$bundle_dir/.nvmrc"
printf '%s\n' "$sha" > "$bundle_dir/.cleo-release-sha"
printf '%s\n' "$release_platform" > "$bundle_dir/.cleo-release-platform"

source_date_epoch="${SOURCE_DATE_EPOCH:-$(git -C "$repository_root" show -s --format=%ct "$sha")}"
build_timestamp="$(date -u -d "@$source_date_epoch" +'%Y-%m-%dT%H:%M:%SZ')"
node_version="$(tr -d '[:space:]' < "$repository_root/.nvmrc")"
node_version="${node_version#v}"

node --input-type=module - "$bundle_dir" "$sha" "$release_platform" \
  "$node_version" "$build_timestamp" <<'NODE'
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const [root, commitSha, target, nodeVersion, buildTimestamp] = process.argv.slice(2)
const contract = JSON.parse(
  readFileSync(path.join(root, "runtime-artifact.json"), "utf8")
)
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
const [platform, architecture] = target.split("-", 2)
const manifest = {
  architecture,
  artifactContractVersion: contract.schemaVersion,
  artifactValidatorEntrypoint: contract.artifactValidatorEntrypoint,
  buildTimestamp,
  commandFingerprint: criticalFileSha256[contract.commandRegistrationEntrypoint],
  commandRegistrationEntrypoint: contract.commandRegistrationEntrypoint,
  commitSha,
  criticalFileSha256,
  nodeVersion,
  platform,
  runtimeEntrypoint: contract.runtimeEntrypoint,
}
writeFileSync(
  path.join(root, contract.releaseManifest),
  `${JSON.stringify(manifest, null, 2)}\n`
)
NODE

find "$bundle_dir" -type f -name '.env*' -delete
chmod 0750 "$bundle_dir"

for required_path in \
  runtime-artifact.json \
  release-manifest.json \
  dist/deployment/validateReleaseArtifact.js; do
  if [[ ! -e "$bundle_dir/$required_path" ]]; then
    echo "Packaged Discord release is missing $required_path" >&2
    find "$bundle_dir" -maxdepth 4 \( -type f -o -type l \) | sort | head -200 >&2
    exit 1
  fi
done

node --input-type=module -e '
  import path from "node:path"
  import { pathToFileURL } from "node:url"
  const [root, expectedSha, expectedPlatform] = process.argv.slice(1)
  const validatorUrl = pathToFileURL(path.join(root, "dist/deployment/validateReleaseArtifact.js")).href
  const { validateReleaseArtifactDirectory } = await import(validatorUrl)
  validateReleaseArtifactDirectory(root, { expectedSha, expectedPlatform })
' "$bundle_dir" "$sha" "$release_platform"

(
  cd "$bundle_dir"
  node --input-type=module -e 'await import("./dist/scripts/registerCommands.js")'
  node --input-type=module -e '
    const { createCanvas } = await import("@napi-rs/canvas")
    const canvas = createCanvas(2, 2)
    await canvas.encode("png")
  '

  set +e
  runtime_output="$({
    NODE_ENV=production DISCORD_BOT_RUNTIME_MODE=invalid \
      node --enable-source-maps dist/index.js
  } 2>&1)"
  runtime_status=$?
  set -e

  if [[ "$runtime_status" -eq 0 ]] || \
    [[ "$runtime_output" != *"Invalid DISCORD_BOT_RUNTIME_MODE"* ]]; then
    echo "Compiled Discord runtime probe did not reach runtime configuration validation." >&2
    printf '%s\n' "$runtime_output" >&2
    exit 1
  fi
)

archive_name="cleo-discord-${sha}.tar.gz"
archive_path="$output_dir/$archive_name"
checksum_path="$archive_path.sha256"

tar --sort=name --mtime="@$source_date_epoch" --owner=0 --group=0 \
  --numeric-owner -C "$bundle_dir" -czf "$archive_path" .
(
  cd "$output_dir"
  sha256sum "$archive_name" > "${archive_name}.sha256"
)

printf 'archive=%s\n' "$archive_path" >> "${GITHUB_OUTPUT:-/dev/null}"
printf 'checksum=%s\n' "$checksum_path" >> "${GITHUB_OUTPUT:-/dev/null}"
printf 'artifact_name=discord-release-%s\n' "$sha" >> "${GITHUB_OUTPUT:-/dev/null}"
printf 'platform=%s\n' "$release_platform" >> "${GITHUB_OUTPUT:-/dev/null}"

echo "Packaged Discord release $sha for $release_platform at $archive_path"
