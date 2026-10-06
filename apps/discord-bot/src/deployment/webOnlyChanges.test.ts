import assert from "node:assert/strict"
import { test } from "node:test"
import { isWebOnlyConfigChange, isWebOnlyPath } from "./classifyChanges"

test("web app and origin helpers do not require bot releases", () => {
  for (const path of [
    "apps/dashboard/package.json",
    "apps/landing/src/app/page.tsx",
    "packages/env/src/dashboard.ts",
    "packages/env/src/origins.ts",
    "packages/shared/src/appRoutes.ts",
  ])
    assert.equal(isWebOnlyPath(path), true, path)
  for (const path of [
    "packages/env/src/discord.ts",
    "packages/env/src/shared.ts",
    "packages/shared/src/providers.ts",
    "packages/backend/convex/schema.ts",
    "apps/twitch-bot/package.json",
  ])
    assert.equal(isWebOnlyPath(path), false, path)
})

test("web-only configuration additions keep all existing runtime inputs unchanged", () => {
  const turbo = {
    globalEnv: ["NODE_ENV"],
    tasks: { build: { dependsOn: ["^build"] } },
  }
  assert.equal(
    isWebOnlyConfigChange(
      "turbo.json",
      JSON.stringify(turbo),
      JSON.stringify({
        ...turbo,
        globalEnv: [
          "NODE_ENV",
          "NEXT_PUBLIC_SITE_URL",
          "VERCEL_URL",
          "VERCEL_ENV",
        ],
      })
    ),
    true
  )
  assert.equal(
    isWebOnlyConfigChange(
      "turbo.json",
      JSON.stringify(turbo),
      JSON.stringify({ ...turbo, tasks: { build: {} } })
    ),
    false
  )
  assert.equal(
    isWebOnlyConfigChange(
      "turbo.json",
      JSON.stringify(turbo),
      JSON.stringify({ ...turbo, globalEnv: ["NODE_ENV", "DISCORD_TOKEN"] })
    ),
    false
  )
  const pkg = {
    dependencies: { zod: "1" },
    exports: { "./discord": "./src/discord.ts" },
  }
  for (const file of [
    "packages/env/package.json",
    "packages/shared/package.json",
  ]) {
    assert.equal(
      isWebOnlyConfigChange(
        file,
        JSON.stringify(pkg),
        JSON.stringify({
          ...pkg,
          exports: {
            ...pkg.exports,
            "./landing": "./src/landing.ts",
            "./origins": "./src/origins.ts",
            "./appRoutes": "./src/appRoutes.ts",
          },
        })
      ),
      true
    )
    assert.equal(
      isWebOnlyConfigChange(
        file,
        JSON.stringify(pkg),
        JSON.stringify({ ...pkg, dependencies: { zod: "2" } })
      ),
      false
    )
  }
  const lock = {
    workspaces: { "apps/discord-bot": { dependencies: { zod: "1" } } },
    packages: { zod: ["zod@1", "integrity"] },
  }
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(lock),
      JSON.stringify({
        ...lock,
        workspaces: { ...lock.workspaces, "apps/landing": {} },
        packages: {
          ...lock.packages,
          "@workspace/landing": ["workspace:apps/landing"],
        },
      })
    ),
    true
  )
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(lock),
      JSON.stringify({ ...lock, packages: { zod: ["zod@2", "integrity"] } })
    ),
    false
  )
})

test("unknown or malformed configuration remains conservative", () => {
  for (const file of ["bun.lock", "turbo.json", "packages/env/package.json"]) {
    for (const value of ["invalid", "null", "[]", "{}"])
      assert.equal(isWebOnlyConfigChange(file, value, value), false)
  }
  assert.equal(isWebOnlyConfigChange("package.json", "{}", "{}"), false)
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      '{"workspaces":{},"packages":{"name,}":["v1",],},}',
      '{"workspaces":{},"packages":{"name}":["v1",],},}'
    ),
    false
  )
})
