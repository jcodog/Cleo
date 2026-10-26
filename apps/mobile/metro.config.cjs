const { getDefaultConfig } = require("expo/metro-config")

const config = getDefaultConfig(__dirname)

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
