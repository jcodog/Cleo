import { readFile } from "node:fs/promises"
import { createServer } from "node:https"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const [keyPath, certPath] = process.argv.slice(2)
if (!keyPath || !certPath) throw new Error("Provide a TLS key and certificate")

const require = createRequire(
  new URL("../../apps/dashboard/package.json", import.meta.url)
)
const next = require("next")
const app = next({
  dev: false,
  dir: fileURLToPath(new URL("../../apps/dashboard", import.meta.url)),
  hostname: "localhost",
  port: 3100,
})
await app.prepare()
const server = createServer(
  { key: await readFile(keyPath), cert: await readFile(certPath) },
  app.getRequestHandler()
)
server.listen(3100, "localhost")

/** Releases the test listener and Next resources when CI exits. */
async function stop() {
  server.closeAllConnections()
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await app.close()
}
process.once("SIGTERM", stop)
process.once("SIGINT", stop)
