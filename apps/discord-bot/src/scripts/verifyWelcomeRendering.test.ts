import { test } from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  verifyWelcomeAssetManifest,
  verifyWelcomeRendering,
} from "./verifyWelcomeRendering"

test("welcome PNG title pixels match local artwork for tones, ZWJ, flags, selectors and keycaps", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "cleo-welcome-proof-"))
  try {
    await verifyWelcomeRendering(output)
    await verifyWelcomeAssetManifest(
      fileURLToPath(new URL("../services/welcome-assets/", import.meta.url))
    )
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
