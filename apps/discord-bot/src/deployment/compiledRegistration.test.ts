import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { build } from "esbuild"

const packageRoot = fileURLToPath(new URL("../../", import.meta.url))

test("compiled registration executes through current and propagates REST and verification failures non-zero", async () => {
  const fixture = mkdtempSync(
    path.join(packageRoot, "node_modules", ".cleo-register-")
  )
  try {
    const entrypoint = path.join(fixture, "registerCommands.mjs")
    await build({
      absWorkingDir: packageRoot,
      entryPoints: ["src/scripts/registerCommands.ts"],
      bundle: true,
      packages: "bundle",
      external: ["@napi-rs/canvas", "discord.js"],
      platform: "node",
      format: "esm",
      outfile: entrypoint,
    })
    const current = path.join(fixture, "current")
    symlinkSync(
      fixture,
      current,
      process.platform === "win32" ? "junction" : "dir"
    )
    const preload = path.join(fixture, "rest-fixture.mjs")
    writeFileSync(
      preload,
      `
      import { REST, Routes } from "discord.js"
      let intended
      REST.prototype.put = async (route, { body }) => {
        if (process.env.CLEO_TEST_FAILURE === "put") throw new Error("REST PUT fixture failure")
        intended = body
        return body
      }
      REST.prototype.get = async (route) => {
        if (route === Routes.currentApplication()) return { id: process.env.DISCORD_APPLICATION_ID }
        if (process.env.CLEO_TEST_FAILURE === "get") throw new Error("REST GET fixture failure")
        if (!intended?.some(command => command.name === "8ball")) throw new Error("8ball missing from bundle")
        if (process.env.CLEO_TEST_FAILURE === "missing") return intended.filter(command => command.name !== "8ball")
        if (process.env.CLEO_TEST_FAILURE === "stale") return [...intended, { name: "stale" }]
        if (process.env.CLEO_TEST_FAILURE === "definition") return intended.map(command => ({ ...command, description: "incorrect" }))
        return intended
      }
    `
    )
    const importProbe = spawnSync(
      process.execPath,
      ["--input-type=module", "-"],
      {
        input: `await import(${JSON.stringify(pathToFileURL(entrypoint).href)})`,
        encoding: "utf8",
        env: {
          ...process.env,
          DISCORD_BOT_TOKEN: "",
          DISCORD_APPLICATION_ID: "",
        },
      }
    )
    assert.equal(importProbe.status, 0, importProbe.stdout + importProbe.stderr)
    assert.equal(importProbe.stdout + importProbe.stderr, "")

    const sourceProbe = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/scripts/registerCommands.ts", "--global"],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DISCORD_BOT_TOKEN: "",
          DISCORD_APPLICATION_ID: "",
        },
      }
    )
    assert.equal(sourceProbe.status, 1, sourceProbe.stdout + sourceProbe.stderr)
    assert.match(sourceProbe.stderr, /Missing DISCORD_BOT_TOKEN/)
    for (const failure of [
      "",
      "put",
      "get",
      "missing",
      "stale",
      "definition",
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          path.join(current, "registerCommands.mjs"),
          "--global",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            DISCORD_BOT_TOKEN: "offline-test-token",
            DISCORD_APPLICATION_ID: "123456789012345678",
            CLEO_TEST_FAILURE: failure,
          },
        }
      )
      assert.equal(result.error, undefined)
      assert.equal(
        result.status,
        failure ? 1 : 0,
        result.stdout + result.stderr
      )
      if (!failure) {
        assert.match(result.stdout, /Verified 5 command\(s\) on Discord/)
        assert.match(result.stdout, /\/8ball/)
      }
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
