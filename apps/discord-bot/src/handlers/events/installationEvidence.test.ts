import assert from "node:assert/strict"
import { test } from "node:test"
import { ConvexHttpClient } from "convex/browser"

process.env.CONVEX_URL = "https://fixture.convex.cloud"
process.env.DISCORD_BOT_CONVEX_SECRET = "fixture-bot-secret"

test("a stalled installation evidence request cannot delay the command response and rejection is handled", async (t) => {
  let reject: (error: Error) => void = () => {}
  const pending = new Promise<never>((_, fail) => {
    reject = fail
  })
  const action = t.mock.method(
    ConvexHttpClient.prototype,
    "action",
    () => pending
  )
  const handler = (await import("./interactionCreate")).default
  let executed = false
  const interaction = {
    id: ((BigInt(Date.now()) - 1420070400000n) << 22n).toString(),
    user: { id: "111111111111111111" },
    authorizingIntegrationOwners: { userId: "111111111111111111" },
    isChatInputCommand: () => true,
    commandName: "ping",
    client: {
      commands: new Map([
        [
          "ping",
          {
            execute: async () => {
              executed = true
            },
          },
        ],
      ]),
    },
  }
  const execution = handler.execute(interaction as never)
  assert.equal(action.mock.callCount(), 1)
  assert.deepEqual(action.mock.calls[0]?.arguments[1], {
    secret: "fixture-bot-secret",
    discordUserId: interaction.user.id,
    interactionId: interaction.id,
  })
  assert.equal(executed, true)
  await execution
  reject(new Error("backend unavailable"))
  await new Promise((resolve) => setImmediate(resolve))
  action.mock.mockImplementation(() => {
    throw new Error("client construction or transport failed")
  })
  executed = false
  await handler.execute(interaction as never)
  assert.equal(executed, true)
  for (const authorizingIntegrationOwners of [
    { guildId: "222222222222222222" },
    { userId: "333333333333333333" },
  ]) {
    executed = false
    await handler.execute({
      ...interaction,
      authorizingIntegrationOwners,
    } as never)
    assert.equal(executed, true)
  }
  assert.equal(action.mock.callCount(), 2)
})
