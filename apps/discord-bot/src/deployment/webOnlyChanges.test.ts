import assert from "node:assert/strict"
import { test } from "node:test"
import {
  isWebOnlyConfigChange,
  isWebOnlyPath,
  isTwitchDeployPath,
} from "./classifyChanges"
import { readFileSync } from "node:fs"

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

test("landing-only lockfile dependencies and their transitive entries do not activate runtimes", () => {
  const before = {
    workspaces: {
      "apps/discord-bot": {
        name: "@workspace/discord-bot",
        dependencies: { shared: "1" },
      },
    },
    packages: { shared: ["shared@1", "", {}, "integrity"] },
  }
  const after = {
    ...before,
    workspaces: {
      ...before.workspaces,
      "apps/landing": {
        name: "@workspace/landing",
        dependencies: { marketing: "1", shared: "1" },
      },
    },
    packages: {
      ...before.packages,
      "@workspace/landing": ["workspace:apps/landing"],
      marketing: [
        "marketing@1",
        "",
        {
          dependencies: { child: "1" },
          optionalDependencies: { missing: "1" },
        },
        "integrity",
      ],
      child: [
        "child@1",
        "",
        { dependencies: { marketing: "1" }, peerDependencies: { shared: "1" } },
        "integrity",
      ],
    },
  }
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(before),
      JSON.stringify(after)
    ),
    true
  )
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(after),
      JSON.stringify(before)
    ),
    true
  )
  const runtimeChanged = {
    ...after,
    packages: {
      ...after.packages,
      shared: ["shared@2", "", {}, "new-integrity"],
    },
  }
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(before),
      JSON.stringify(runtimeChanged)
    ),
    false
  )
  const unresolved = {
    ...after,
    workspaces: {
      ...after.workspaces,
      "apps/landing": { dependencies: { unknown: "1" } },
    },
  }
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(before),
      JSON.stringify(unresolved)
    ),
    false
  )
})

test("nested landing versions are excluded while runtime resolution, workspace dependencies and orphan changes remain conservative", () => {
  const lock = {
    workspaces: {
      "apps/discord-bot": {
        dependencies: { "@workspace/shared": "workspace:*" },
      },
      "packages/shared": { dependencies: { nested: "1" } },
      "apps/landing": { dependencies: { "@site/marketing": "1" } },
    },
    packages: {
      "@workspace/shared": ["workspace:packages/shared"],
      nested: ["nested@1", "", {}],
      "@site/marketing": [
        "@site/marketing@1",
        "",
        { dependencies: { nested: "2" } },
      ],
      "@site/marketing/nested": [
        "nested@2",
        "",
        { dependencies: { leaf: "1" } },
      ],
      "@site/marketing/leaf": ["leaf@1", "", {}],
      orphan: ["orphan@1", "", {}],
    },
  }
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(lock),
      JSON.stringify({
        ...lock,
        packages: {
          ...lock.packages,
          "@site/marketing/leaf": ["leaf@2", "", {}],
        },
      })
    ),
    true
  )
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(lock),
      JSON.stringify({
        ...lock,
        packages: { ...lock.packages, nested: ["nested@2", "", {}] },
      })
    ),
    false
  )
  assert.equal(
    isWebOnlyConfigChange(
      "bun.lock",
      JSON.stringify(lock),
      JSON.stringify({
        ...lock,
        packages: { ...lock.packages, orphan: ["orphan@2", "", {}] },
      })
    ),
    false
  )
})

test("Twitch classifier and workflow retain runtime deployment and short-circuit web-only release work", () => {
  for (const path of [
    "apps/landing/src/app/page.tsx",
    "apps/dashboard/package.json",
    "packages/env/src/origins.ts",
    "packages/shared/src/appRoutes.ts",
  ])
    assert.equal(isTwitchDeployPath(path), false, path)
  for (const path of [
    "apps/twitch-bot/src/index.ts",
    "ops/twitch/test.sh",
    "packages/backend/convex/schema.ts",
    "packages/shared/src/providers.ts",
    "bun.lock",
  ])
    assert.equal(isTwitchDeployPath(path), true, path)
  const workflow = readFileSync(
    new URL(
      "../../../../.github/workflows/twitch-production.yml",
      import.meta.url
    ),
    "utf8"
  ).replace(/\r\n/g, "\n")
  for (const name of [
    "Frozen dependency install",
    "Twitch and backend behavior checks",
    "Host deployment behavior checks",
    "Build Twitch once",
    "Package and verify Linux x64 artifact",
    "Upload verified release",
  ]) {
    assert.ok(
      workflow.includes(
        `- name: ${name}\n        if: steps.changes.outputs.runtime == 'true'`
      ),
      name
    )
  }
  assert.ok(
    workflow.includes("needs.validate-package.outputs.runtime == 'true'")
  )
  assert.ok(
    workflow.includes(
      'runtime="$(node apps/discord-bot/src/deployment/classifyChanges.ts twitch'
    )
  )
})
