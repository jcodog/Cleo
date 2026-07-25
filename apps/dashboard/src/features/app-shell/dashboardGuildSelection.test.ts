import assert from "node:assert/strict"
import test from "node:test"

import { getDashboardGuildSelection } from "./dashboardGuildSelection"

const manageableGuilds = [
  { discordGuildId: "111111111111111111" },
  { discordGuildId: "222222222222222222" },
]

test("uses a manageable route guild before the stored guild", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds,
      routeDiscordGuildId: "222222222222222222",
      storedDiscordGuildId: "111111111111111111",
    }),
    {
      activeDiscordGuildId: "222222222222222222",
      invalidRouteGuildId: undefined,
      safeDashboardPath: "/dashboard/222222222222222222",
    }
  )
})

test("rejects an unmanaged route guild and falls back safely", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds,
      routeDiscordGuildId: "999999999999999999",
      storedDiscordGuildId: "111111111111111111",
    }),
    {
      activeDiscordGuildId: "111111111111111111",
      invalidRouteGuildId: "999999999999999999",
      safeDashboardPath: "/dashboard/111111111111111111",
    }
  )
})

test("does not enable guild tools before manageable guilds load", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds: undefined,
      routeDiscordGuildId: "111111111111111111",
      storedDiscordGuildId: "111111111111111111",
    }),
    {
      activeDiscordGuildId: undefined,
      invalidRouteGuildId: undefined,
      safeDashboardPath: "/dashboard",
    }
  )
})
