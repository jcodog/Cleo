const { getDefaultConfig } = require("expo/metro-config")
const { join } = require("node:path")
const { tmpdir } = require("node:os")
const { mkdirSync } = require("node:fs")

const config = getDefaultConfig(__dirname)

// Metro persists V8-serialized file maps. Node upgrades cannot read every older format.
config.fileMapCacheDirectory = join(
  tmpdir(),
  "cleo-metro-file-map",
  process.platform,
  `${process.versions.node}-${process.versions.v8}-${process.versions.bun || "node"}`
)
mkdirSync(config.fileMapCacheDirectory, { recursive: true })

if (process.platform === "win32") {
  const defaults = config.resolver.blockList
  // Bun retains foreign Sharp packages whose libvips junctions cannot be read
  // on Windows. Exclude their store parents before Metro's watcher walks them.
  config.resolver.blockList = [
    ...(Array.isArray(defaults) ? defaults : defaults ? [defaults] : []),
    /[/\\]node_modules[/\\]\.bun[/\\]@img\+sharp-(?!win32-)[^/\\]+(?:[/\\]|$)/,
  ]
}

module.exports = config
