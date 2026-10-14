#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?Set RUNNER_TEMP to a disposable verification directory}"

test "$(node --version)" = "v24.15.0"
test "$(node -p '`${process.platform}-${process.arch}`')" = "linux-x64"
release_sha="$(git rev-parse HEAD)"
output_dir="${RUNNER_TEMP}/cleo-twitch-package-test"
extract_dir="$(mktemp -d "${RUNNER_TEMP}/cleo-twitch-package-extract.XXXXXX")"
bun run --filter @workspace/twitch-bot build
find apps/twitch-bot/dist -type f -print0 | sort -z | xargs -0 sha256sum > "${RUNNER_TEMP}/twitch-dist-before.sha256"
bun run --filter @workspace/twitch-bot package:release "$output_dir" "$release_sha"
find apps/twitch-bot/dist -type f -print0 | sort -z | xargs -0 sha256sum > "${RUNNER_TEMP}/twitch-dist-after.sha256"
diff -u "${RUNNER_TEMP}/twitch-dist-before.sha256" "${RUNNER_TEMP}/twitch-dist-after.sha256"
archive="$output_dir/cleo-twitch-${release_sha}.tar.gz"
checksum="$archive.sha256"
test -f "$archive"
test -f "$checksum"
(cd "$output_dir" && sha256sum -c "$(basename "$checksum")")
tar -tzf "$archive" > "$RUNNER_TEMP/twitch-release-contents.txt"
tar -xzf "$archive" -C "$extract_dir"
node --input-type=module - "$extract_dir" "$release_sha" <<'NODE'
import { validateArtifact } from "./apps/twitch-bot/src/deployment/validateArtifact.mjs"
await validateArtifact(process.argv[2], process.argv[3])
NODE
node .github/scripts/check-twitch-entrypoints.mjs "$extract_dir"
node .github/scripts/test-twitch-package.mjs
node .github/scripts/test-twitch-private-files.mjs
