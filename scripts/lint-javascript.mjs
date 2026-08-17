const trackedJavaScript = Bun.spawnSync({
  cmd: ["git", "ls-files", "-z", "--", "*.js", "*.mjs", "*.cjs"],
  stdout: "pipe",
  stderr: "inherit",
})

if (trackedJavaScript.exitCode !== 0) {
  process.exit(trackedJavaScript.exitCode)
}

const files = new TextDecoder()
  .decode(trackedJavaScript.stdout)
  .split("\0")
  .filter(Boolean)

if (files.length === 0) {
  process.exit(0)
}

function run(command) {
  const result = Bun.spawnSync({
    cmd: command,
    stdout: "inherit",
    stderr: "inherit",
  })

  if (result.exitCode !== 0) {
    process.exit(result.exitCode)
  }
}

run([
  process.execPath,
  "x",
  "--no-install",
  "oxlint",
  "-c",
  ".oxlintrc.json",
  "--deny-warnings",
  ...files,
])
