import http from "node:http"
import https from "node:https"
import net from "node:net"
import tls from "node:tls"
import dgram from "node:dgram"
import { syncBuiltinESMExports } from "node:module"

let attempts = 0
function deny() {
  attempts++
  throw new Error("Twitch artifact check forbids network access.")
}
globalThis.fetch = deny
http.request = http.get = https.request = https.get = deny
net.Socket.prototype.connect = deny
net.Server.prototype.listen = deny
tls.connect = deny
dgram.Socket.prototype.send = dgram.Socket.prototype.connect = deny
syncBuiltinESMExports()
process.on("exit", () => {
  if (attempts) {
    process.stderr.write("TWITCH_ARTIFACT_NETWORK_ATTEMPT\n")
    process.exitCode = 1
  }
})
