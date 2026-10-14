#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?Set RUNNER_TEMP to a disposable verification directory}"

output_dir="${RUNNER_TEMP}/cleo-discord-package-test"
extract_dir="${RUNNER_TEMP}/cleo-discord-package-extract"
release_sha="$(git rev-parse HEAD)"
bun run --filter @workspace/discord-bot build
find apps/discord-bot/dist -type f -print0 | sort -z | xargs -0 sha256sum > "${RUNNER_TEMP}/discord-dist-before.sha256"
CLEO_DISCORD_RELEASE_SHA="$release_sha" \
  bash .github/scripts/package-discord-release.sh "$output_dir"
find apps/discord-bot/dist -type f -print0 | sort -z | xargs -0 sha256sum > "${RUNNER_TEMP}/discord-dist-after.sha256"
diff -u "${RUNNER_TEMP}/discord-dist-before.sha256" "${RUNNER_TEMP}/discord-dist-after.sha256"
archive="$output_dir/cleo-discord-${release_sha}.tar.gz"
checksum="$archive.sha256"
test -f "$archive"
test -f "$checksum"
(cd "$output_dir" && sha256sum -c "$(basename "$checksum")")
tar -tzf "$archive" > "$RUNNER_TEMP/discord-release-contents.txt"
rm -rf "$extract_dir"
mkdir -p "$extract_dir"
tar -xzf "$archive" -C "$extract_dir"
test -f "$extract_dir/dist/index.js"
test -f "$extract_dir/dist/index.js.map"
test -f "$extract_dir/dist/scripts/registerCommands.js"
test -f "$extract_dir/dist/scripts/registerCommands.js.map"
test -f "$extract_dir/runtime-artifact.json"
test -f "$extract_dir/release-manifest.json"
test ! -e "$extract_dir/node_modules/@workspace/discord-bot"
test ! -e "$extract_dir/src/index.ts"
test ! -e "$extract_dir/node_modules/tsx/dist/cli.mjs"
test -f "$extract_dir/.cleo-release-sha"
test -f "$extract_dir/.cleo-release-platform"
test "$(cat "$extract_dir/.cleo-release-sha")" = "$release_sha"
test "$(cat "$extract_dir/.cleo-release-platform")" = "linux-x64"
test "$(node -p "require('$extract_dir/release-manifest.json').commitSha")" = "$release_sha"
test "$(node -p "require('$extract_dir/release-manifest.json').platform")" = "linux"
test "$(node -p "require('$extract_dir/release-manifest.json').architecture")" = "x64"
CLEO_DISCORD_TEST_BUNDLE_ROOT="$extract_dir" \
  bash ops/discord/bin/run-discord-release.test.sh
(
  cd apps/discord-bot
  node --import tsx --input-type=module - "$extract_dir" <<'NODE'
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { commandVerificationVersion, getGlobalCommandDefinitions } from "./src/scripts/registerCommands.ts"
const root = process.argv[2]
const sourcePackage = JSON.parse(readFileSync("package.json", "utf8"))
const packagedPackage = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
const manifest = JSON.parse(readFileSync(path.join(root, "release-manifest.json"), "utf8"))
const packaged = await import(pathToFileURL(path.join(root, "dist/scripts/registerCommands.js")).href)
const intended = await getGlobalCommandDefinitions()
assert.equal(packagedPackage.name, sourcePackage.name)
assert.equal(packagedPackage.version, sourcePackage.version)
assert.equal(manifest.botVersion, sourcePackage.version)
assert.equal(manifest.commandVerificationVersion, commandVerificationVersion)
assert.deepEqual(manifest.globalCommandNames, intended.map(command => command.name).sort())
assert.deepEqual(await packaged.getGlobalCommandDefinitions(), intended)
NODE
)
(
  cd "$extract_dir"
  node --input-type=module -e '
    import assert from "node:assert/strict"
    import { readFileSync } from "node:fs"
    const { commandVerificationVersion, getGlobalCommandDefinitions, verifyCommandDefinitions } =
      await import("./dist/scripts/registerCommands.js")
    const commands = await getGlobalCommandDefinitions()
    const pkg = JSON.parse(readFileSync("package.json", "utf8"))
    const manifest = JSON.parse(readFileSync("release-manifest.json", "utf8"))
    assert.equal(pkg.name, "@workspace/discord-bot")
    assert.equal(pkg.version, manifest.botVersion)
    assert.equal(commandVerificationVersion, manifest.commandVerificationVersion)
    assert.equal(commandVerificationVersion, 1)
    assert.ok(commands.some(command => command.name === "8ball"))
    assert.deepEqual(commands.map(command => command.name).sort(), manifest.globalCommandNames)
    assert.throws(() => verifyCommandDefinitions(commands, commands.filter(command => command.name !== "8ball")))
  '
  node --input-type=module -e '
    const { createCanvas } = await import("@napi-rs/canvas")
    await createCanvas(2, 2).encode("png")
  '
)
mv apps/discord-bot/dist "${RUNNER_TEMP}/discord-dist"
# Restore the validated build even if an expected rejection test fails.
cleanup() {
  rm -f apps/discord-bot/dist/untrusted-runtime-link.js
  if [[ -d "$RUNNER_TEMP/discord-dist" && ! -e apps/discord-bot/dist ]]; then
    mv "$RUNNER_TEMP/discord-dist" apps/discord-bot/dist
  fi
}
trap cleanup EXIT
if CLEO_DISCORD_RELEASE_SHA="$release_sha" \
  bash .github/scripts/package-discord-release.sh "$output_dir"; then
  echo "Packaging unexpectedly succeeded without compiled output" >&2
  exit 1
fi
mv "${RUNNER_TEMP}/discord-dist" apps/discord-bot/dist

ln -s index.js apps/discord-bot/dist/untrusted-runtime-link.js
if CLEO_DISCORD_RELEASE_SHA="$release_sha" \
  bash .github/scripts/package-discord-release.sh "$output_dir"; then
  echo "Packaging unexpectedly accepted a symlink in validated dist output" >&2
  exit 1
fi
rm -f apps/discord-bot/dist/untrusted-runtime-link.js

symlink_fixture="$(mktemp -d "${RUNNER_TEMP}/discord-symlink-fixture.XXXXXX")"
outside_fixture="$(mktemp "${RUNNER_TEMP}/discord-symlink-outside.XXXXXX")"
symlink_log="$(mktemp "${RUNNER_TEMP}/discord-symlink-log.XXXXXX")"
ln -s missing-target "$symlink_fixture/dangling-link"
if bash .github/scripts/check-discord-bundle-symlinks.sh \
  "$symlink_fixture" >"$symlink_log" 2>&1; then
  echo "Packaging symlink validation unexpectedly accepted a dangling link" >&2
  exit 1
fi
grep -F "contains a dangling symlink" "$symlink_log"
rm -f "$symlink_fixture/dangling-link"
ln -s "$outside_fixture" "$symlink_fixture/escaping-link"
if bash .github/scripts/check-discord-bundle-symlinks.sh \
  "$symlink_fixture" >"$symlink_log" 2>&1; then
  echo "Packaging symlink validation unexpectedly accepted a bundle-escaping link" >&2
  exit 1
fi
grep -F "symlink escapes the bundle" "$symlink_log"
rm -rf "$symlink_fixture"
rm -f "$outside_fixture" "$symlink_log"
