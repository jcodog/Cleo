import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { api } from "./_generated/api"

test("unstamped backend health reads the database without exposing account data or claiming a release SHA", async () => {
  const t = convexTest(schema, {
    "./_generated/server.js": () => import("./_generated/server.js"),
    "./releaseHealth.ts": () => import("./releaseHealth"),
  })
  assert.deepEqual(await t.query(api.releaseHealth.read, {}), {
    sha: null,
    healthy: true,
  })
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId: "health-fixture",
      email: "private@example.com",
      role: "user",
      createdAt: 1,
      updatedAt: 1,
    })
  })
  assert.deepEqual(await t.query(api.releaseHealth.read, {}), {
    sha: null,
    healthy: true,
  })
})
