import assert from "node:assert/strict"
import { test } from "node:test"
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  rename,
  readFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { assetsMatch, renameWithRetry } from "./prepare-welcome-assets.mjs"

test("unchanged assets are reused, while missing or corrupt bytes require repair", async (t) => {
  const output = await mkdtemp(path.join(tmpdir(), "cleo-assets-test-"))
  t.after(() => rm(output, { recursive: true, force: true }))
  const files = new Map([
    ["font.woff", Buffer.from("font")],
    ["manifest.json", Buffer.from("manifest")],
  ])
  assert.equal(await assetsMatch(output, files), false)
  for (const [name, source] of files)
    await writeFile(path.join(output, name), source)
  assert.equal(await assetsMatch(output, files), true)
  await writeFile(path.join(output, "font.woff"), "corrupt")
  assert.equal(await assetsMatch(output, files), false)
})

test("Windows transient rename failures retry without deleting the prepared source", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cleo-rename-test-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const source = path.join(directory, "staged"),
    destination = path.join(directory, "published")
  await mkdir(source)
  await writeFile(path.join(source, "asset"), "complete")
  let attempts = 0
  await renameWithRetry(source, destination, async (from, to) => {
    if (++attempts < 3)
      throw Object.assign(new Error("Windows watcher holds directory"), {
        code: "EPERM",
      })
    await rename(from, to)
  })
  assert.equal(attempts, 3)
  assert.equal(
    await readFile(path.join(destination, "asset"), "utf8"),
    "complete"
  )
  await assert.rejects(
    renameWithRetry(source, destination, async () => {
      throw Object.assign(new Error("Missing source"), { code: "ENOENT" })
    }),
    /Missing source/
  )
})

test("file-shaped output and nested directories are repairable mismatches", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cleo-assets-shape-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const output = path.join(root, "output")
  await writeFile(output, "not a directory")
  assert.equal(
    await assetsMatch(output, new Map([["font.woff", Buffer.from("font")]])),
    false
  )
  await rm(output)
  await mkdir(output)
  await writeFile(path.join(output, "emoji"), "not a directory")
  assert.equal(
    await assetsMatch(
      output,
      new Map([["emoji/one.svg", Buffer.from("emoji")]])
    ),
    false
  )
})

test("unexpected filesystem errors are reported instead of treated as absent assets", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cleo-assets-error-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await assert.rejects(
    assetsMatch(root, new Map([[".", Buffer.from("file")]])),
    { code: "EISDIR" }
  )
})
