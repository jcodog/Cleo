import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

test("all Twitch workspace pages protect auth and use the shared non-card workspace components", async () => {
  for (const route of ["page.tsx", "alerts/page.tsx", "timers/page.tsx"]) {
    const source = await readFile(
      new URL(`../../app/(app)/twitch/${route}`, import.meta.url),
      "utf8"
    )
    assert.match(source, /await auth\.protect\(\)/)
    assert.doesNotMatch(source, /Card|grid-cols-3/)
  }
  const live = await readFile(
    new URL(
      "../discord-guild-workspace/sections/LiveNotificationsSection.tsx",
      import.meta.url
    ),
    "utf8"
  )
  assert.doesNotMatch(live, /Manage Twitch/)
  assert.match(live, /Connect Twitch/)
  assert.match(live, /Reconnect Twitch/)
})
