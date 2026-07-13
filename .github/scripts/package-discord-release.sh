#!/usr/bin/env bash
set -euo pipefail
umask 0027

repository_root="${GITHUB_WORKSPACE:-$(pwd)}"
output_dir="${1:-${RUNNER_TEMP:-/tmp}/cleo-discord-artifact}"
sha="${CLEO_DISCORD_RELEASE_SHA:-$(git -C "$repository_root" rev-parse HEAD)}"
release_platform="$(node -p '`${process.platform}-${process.arch}`')"

is_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

if ! is_sha "$sha"; then
  echo "Release SHA is invalid: $sha" >&2
  exit 1
fi

if [[ "$release_platform" != "linux-x64" ]]; then
  echo "Discord production releases must be packaged for linux-x64; got $release_platform" >&2
  exit 1
fi

bundle_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/cleo-discord-bundle.XXXXXX")"
trap 'rm -rf -- "$bundle_dir"' EXIT

rm -rf -- "$output_dir"
mkdir -p "$output_dir"

pnpm --dir "$repository_root" --filter @workspace/discord-bot run build
pnpm --dir "$repository_root" --filter @workspace/discord-bot --prod deploy \
  --legacy "$bundle_dir"

# pnpm deploy metadata and generated CLI shims include the temporary bundle path.
# The Node runtime does not use them, so remove them from the immutable artifact.
rm -f -- \
  "$bundle_dir/node_modules/.modules.yaml" \
  "$bundle_dir/node_modules/.package-map.json"
rm -rf -- "$bundle_dir/node_modules/.pnpm/node_modules/@workspace"
find "$bundle_dir/node_modules" -type d -name .bin -prune -exec rm -rf -- {} +

install -m 0644 "$repository_root/.nvmrc" "$bundle_dir/.nvmrc"
printf '%s\n' "$sha" > "$bundle_dir/.cleo-release-sha"
printf '%s\n' "$release_platform" > "$bundle_dir/.cleo-release-platform"

find "$bundle_dir" -type f -name '.env*' -delete

for required_path in runtime-artifact.json dist/deployment/validateReleaseArtifact.js; do
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

source_date_epoch="$(git -C "$repository_root" show -s --format=%ct "$sha")"
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
