import { rm } from "node:fs/promises"
import { fileURLToPath, URL } from "node:url"
import { build } from "esbuild"

const root = fileURLToPath(new URL("../", import.meta.url))
const dist = fileURLToPath(new URL("../dist", import.meta.url))
await rm(dist, { recursive: true, force: true })
await build({
  absWorkingDir: root,
  entryPoints: {
    index: "entrypoints/index.mjs",
    "scripts/authorizeBot": "entrypoints/authorizeBot.mjs",
    "scripts/sendSmokeMessage": "entrypoints/sendSmokeMessage.mjs",
    "scripts/checkReadiness": "entrypoints/checkReadiness.mjs",
  },
  outdir: dist,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  legalComments: "none",
  sourcemap: false,
})
