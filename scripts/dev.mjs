// Node tasks must trust the same system certificate authorities as the host.
// Preserve operator options and keep certificate verification enabled.
const nodeOptions = process.env.NODE_OPTIONS || ""
const child = Bun.spawn(
  [
    process.execPath,
    "x",
    "--no-install",
    "turbo",
    "dev",
    ...process.argv.slice(2),
  ],
  {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: `${nodeOptions} --use-system-ca`.trim(),
    },
  }
)
process.on("SIGINT", () => child.kill("SIGINT"))
process.on("SIGTERM", () => child.kill("SIGTERM"))
process.exit(await child.exited)
