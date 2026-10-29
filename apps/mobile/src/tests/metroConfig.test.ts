import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { runInNewContext } from "node:vm"

/** Load the real config with a controlled host and Expo defaults, without starting Metro. */
function configure(
  platform: string,
  defaultBlockList: RegExp | RegExp[] = [/__tests__/]
) {
  const source = readFileSync(
    new URL("../../metro.config.cjs", import.meta.url),
    "utf8"
  )
  const defaults = {
    watchFolders: ["workspace"],
    resolver: {
      blockList: defaultBlockList,
      unstable_enablePackageExports: true,
    },
  }
  const module = { exports: defaults }
  runInNewContext(source, {
    __dirname: "mobile",
    process: { platform },
    module,
    require: (name: string) => {
      assert.equal(name, "expo/metro-config")
      return { getDefaultConfig: () => defaults }
    },
  })
  const config = module.exports
  const patterns = Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  return {
    config,
    blocked: (path: string) => patterns.some((pattern) => pattern.test(path)),
  }
}

test("Windows Metro excludes foreign Sharp store directories before reaching their inaccessible junctions", () => {
  const { config, blocked } = configure("win32")
  for (const directory of [
    "@img+sharp-linuxmusl-x64@0.35.3",
    "@img+sharp-linux-x64@0.35.3",
    "@img+sharp-darwin-arm64@0.35.3",
    "@img+sharp-libvips-linuxmusl-x64@1.2.4",
  ]) {
    assert.ok(blocked(`E:\\Cleo\\node_modules\\.bun\\${directory}`), directory)
    assert.ok(
      blocked(`/Cleo/node_modules/.bun/${directory}/node_modules/@img/broken`),
      directory
    )
  }
  for (const directory of [
    "@img+sharp-win32-x64@0.35.3",
    "@img+sharp-win32-arm64@0.35.3",
    "sharp@0.35.3",
    "expo@58.0.19",
    "convex@1.48.0",
  ])
    assert.equal(
      blocked(`E:\\Cleo\\node_modules\\.bun\\${directory}`),
      false,
      directory
    )
  assert.ok(blocked("/workspace/__tests__/example.ts"))
  assert.ok(
    configure("win32", /__tests__/).blocked("/workspace/__tests__/example.ts")
  )
  assert.deepEqual(config.watchFolders, ["workspace"])
  assert.equal(config.resolver.unstable_enablePackageExports, true)
})

test("macOS and Linux retain Expo's original package visibility", () => {
  for (const platform of ["darwin", "linux"]) {
    const { blocked } = configure(platform)
    assert.equal(
      blocked("/Cleo/node_modules/.bun/@img+sharp-linux-x64@0.35.3"),
      false
    )
    assert.equal(
      blocked("/Cleo/node_modules/.bun/@img+sharp-darwin-arm64@0.35.3"),
      false
    )
    assert.ok(blocked("/workspace/__tests__/example.ts"))
  }
})
