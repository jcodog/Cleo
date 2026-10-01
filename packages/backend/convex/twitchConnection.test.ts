import assert from "node:assert/strict"
import { test } from "node:test"
import { makeFunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import schema from "./schema"
import { getClerkLinkedProvider } from "./lib/clerkProviders"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./queries/dashboard/twitch/connection.ts": () =>
    import("./queries/dashboard/twitch/connection"),
  "./mutations/integrations/clerk/users.ts": () =>
    import("./mutations/integrations/clerk/users"),
}
const connection = makeFunctionReference<"query">(
  "queries/dashboard/twitch/connection:get"
)
const sync = makeFunctionReference<"mutation">(
  "mutations/integrations/clerk/users:upsertFromWebhook"
)

test("Twitch connection projects only public Clerk-verified metadata and bootstrap permission", async () => {
  const t = convexTest({ schema, modules })
  assert.equal(getClerkLinkedProvider("oauth_twitch"), "twitch")
  const data = {
    id: "test-user",
    email_addresses: [{ id: "email", email_address: "test@example.com" }],
    primary_email_address_id: "email",
    external_accounts: [
      {
        id: "test-external",
        provider: "oauth_twitch",
        provider_user_id: "222",
        username: "test-broadcaster",
        image_url: "https://test.example/avatar",
        approved_scopes: "channel:bot",
      },
    ],
  }
  const userId = await t.mutation(sync, { data })
  const user = t.withIdentity({ subject: "test-user" })
  const linked = await user.query(connection, {})
  assert.equal(linked.providerAccountId, "222")
  assert.equal(linked.username, "test-broadcaster")
  assert.equal(linked.hasBootstrapPermission, true)
  assert.deepEqual(
    Object.keys(linked).sort(),
    [
      "avatarUrl",
      "displayName",
      "hasBootstrapPermission",
      "providerAccountId",
      "syncedAt",
      "username",
    ].sort()
  )
  await t.mutation(sync, {
    data: {
      ...data,
      external_accounts: [
        { ...data.external_accounts[0], approved_scopes: "openid" },
      ],
    },
  })
  assert.equal((await user.query(connection, {})).hasBootstrapPermission, false)
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, { status: "disabled" })
  })
  await assert.rejects(user.query(connection, {}), /disabled/)
  await assert.rejects(t.query(connection, {}), /signed in/)
})

test("not-linked returns null; generic removal reconciliation remains an explicit JCN-213 boundary", async () => {
  const t = convexTest({ schema, modules })
  const data = {
    id: "test-user",
    email_addresses: [{ id: "email", email_address: "test@example.com" }],
    external_accounts: [],
  }
  await t.mutation(sync, { data })
  const user = t.withIdentity({ subject: "test-user" })
  assert.equal(await user.query(connection, {}), null)
  await t.mutation(sync, {
    data: {
      ...data,
      external_accounts: [
        {
          id: "test-external",
          provider: "oauth_twitch",
          provider_user_id: "222",
          approved_scopes: "channel:bot",
        },
      ],
    },
  })
  await t.mutation(sync, { data })
  // This documents the existing lifecycle limitation, never authorizes runtime use.
  assert.equal((await user.query(connection, {})).providerAccountId, "222")
})
