import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

const script = readFileSync(
  new URL("./test-dashboard-pwa.sh", import.meta.url),
  "utf8"
).replaceAll("\r\n", "\n")
const start = script.indexOf("ready=0\n")
const end = script.indexOf("if ! bun run")
assert.ok(start >= 0 && end > start, "Expected the real PWA readiness block")
const readiness = script.slice(start, end)
const directory = mkdtempSync(join(tmpdir(), "cleo-pwa-readiness-"))
// HTTP keeps this test focused on curl's transfer deadline. Hosted PWA tests
// still use the real HTTPS server and its generated trusted certificate.
writeFileSync(join(directory, "pwa.crt"), "")
writeFileSync(
  join(directory, "dashboard-pwa.log"),
  "Readiness fixture diagnostics\n"
)
let requests = 0
const server = createServer((request, response) => {
  assert.equal(request.url, "/sign-in")
  requests += 1
  if (requests === 1) return // Accept the first request but never send a response.
  response.writeHead(200)
  response.end("ready")
})

/** Run the real Bash readiness loop, with a harness timeout that exposes unbounded curl calls. */
async function checkReadiness(origin) {
  const child = spawn("bash", ["-e", "-o", "pipefail", "-c", readiness], {
    env: { ...process.env, RUNNER_TEMP: directory, PWA_TEST_ORIGIN: origin },
    timeout: 10000,
    killSignal: "SIGKILL",
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  child.stdout.resume()
  const [code, signal] = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (status, termination) => resolve([status, termination]))
  })
  assert.equal(
    signal,
    null,
    "PWA readiness must recover before the harness deadline"
  )
  assert.equal(code, 0, stderr)
}

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  await checkReadiness(`http://127.0.0.1:${address.port}`)
  assert.equal(
    requests,
    2,
    "The stalled request must time out before a successful retry"
  )
  console.log(
    "PWA readiness recovers from a stalled response within the transfer deadline."
  )
} finally {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  rmSync(directory, { recursive: true, force: true })
}
