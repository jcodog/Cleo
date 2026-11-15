import assert from "node:assert/strict"
import test from "node:test"

import { getDashboardGuildSelection } from "./dashboardGuildSelection"

const manageableGuilds = [
  { discordGuildId: "111111111111111111", lastOpenedAt: 100 },
  { discordGuildId: "222222222222222222", lastOpenedAt: 200 },
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

test("uses the persisted guild before backend recency", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds,
      routeDiscordGuildId: undefined,
      storedDiscordGuildId: "111111111111111111",
    }),
    {
      activeDiscordGuildId: "111111111111111111",
      invalidRouteGuildId: undefined,
      safeDashboardPath: "/dashboard/111111111111111111",
    }
  )
})

test("falls back to the most recently opened manageable guild", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds,
      routeDiscordGuildId: undefined,
      storedDiscordGuildId: undefined,
    }),
    {
      activeDiscordGuildId: "222222222222222222",
      invalidRouteGuildId: undefined,
      safeDashboardPath: "/dashboard/222222222222222222",
    }
  )
})

test("an absent deep link never silently selects another server", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds,
      routeDiscordGuildId: "999999999999999999",
      storedDiscordGuildId: "111111111111111111",
    }),
    {
      activeDiscordGuildId: undefined,
      invalidRouteGuildId: "999999999999999999",
      safeDashboardPath: "/dashboard/servers",
    }
  )
})

test("falls back to backend recency when the persisted guild is stale", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds,
      routeDiscordGuildId: undefined,
      storedDiscordGuildId: "999999999999999999",
    }),
    {
      activeDiscordGuildId: "222222222222222222",
      invalidRouteGuildId: undefined,
      safeDashboardPath: "/dashboard/222222222222222222",
    }
  )
})

test("does not invent a default when no guild has ever been opened", () => {
  assert.deepEqual(
    getDashboardGuildSelection({
      manageableGuilds: [
        { discordGuildId: "111111111111111111" },
        { discordGuildId: "222222222222222222" },
      ],
      routeDiscordGuildId: undefined,
      storedDiscordGuildId: undefined,
    }),
    {
      activeDiscordGuildId: undefined,
      invalidRouteGuildId: undefined,
      safeDashboardPath: "/dashboard/servers",
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
