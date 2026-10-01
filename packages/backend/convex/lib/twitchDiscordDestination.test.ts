import assert from "node:assert/strict"
import { test } from "node:test"
import { validateLiveDestination } from "./twitchDiscordDestination"
const input = {
  guildId: "guild",
  ownerDiscordId: "owner",
  channelId: "channel",
  mentionMode: "none",
  token: "test-only-bot",
}
test("direct delivery checks actual bot and channel permissions with role and member overwrite precedence", async (t) => {
  const roles = [
    { id: "guild", permissions: "3072", managed: false, mentionable: false },
    { id: "role", permissions: "0", managed: false, mentionable: true },
  ]
  const overwrites: {
    id: string
    type: number
    allow: string
    deny: string
  }[] = []
  let owner = "owner"
  let channelGuild = "guild"
  let channelType = 0
  let status = 200
  let network = false
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (network) throw new Error("test failure")
    if (status !== 200) return Response.json({}, { status })
    const path = new URL(String(url)).pathname
    if (path.endsWith("/guilds/guild"))
      return Response.json({ owner_id: owner, roles })
    if (path.endsWith("/channels/channel"))
      return Response.json({
        guild_id: channelGuild,
        type: channelType,
        permission_overwrites: overwrites,
      })
    if (path.endsWith("/users/@me")) return Response.json({ id: "bot" })
    return Response.json({ roles: ["role"] })
  })
  await validateLiveDestination(input)
  await validateLiveDestination({
    ...input,
    mentionMode: "role",
    roleId: "role",
  })
  await assert.rejects(
    validateLiveDestination({ ...input, mentionMode: "everyone" }),
    /missingMentionPermission/
  )
  overwrites.push({ id: "guild", type: 0, allow: "0", deny: "2048" })
  await assert.rejects(
    validateLiveDestination(input),
    /missingDiscordPermission/
  )
  overwrites.push({ id: "role", type: 0, allow: "2048", deny: "0" })
  await validateLiveDestination(input)
  overwrites.push({ id: "bot", type: 1, allow: "0", deny: "2048" })
  await assert.rejects(
    validateLiveDestination(input),
    /missingDiscordPermission/
  )
  roles[1]!.permissions = "8"
  await validateLiveDestination({ ...input, mentionMode: "everyone" })
  roles[1]!.permissions = "0"
  overwrites.length = 0
  for (const roleId of [undefined, "missing", "guild"])
    await assert.rejects(
      validateLiveDestination({ ...input, mentionMode: "role", roleId }),
      /roleUnavailable/
    )
  roles[1]!.mentionable = false
  await assert.rejects(
    validateLiveDestination({ ...input, mentionMode: "role", roleId: "role" }),
    /roleUnavailable/
  )
  roles[0]!.permissions = "134144"
  await validateLiveDestination({
    ...input,
    mentionMode: "role",
    roleId: "role",
  })
  roles[1]!.managed = true
  await assert.rejects(
    validateLiveDestination({ ...input, mentionMode: "role", roleId: "role" }),
    /roleUnavailable/
  )
  owner = "changed"
  await assert.rejects(validateLiveDestination(input), /ownerChanged/)
  owner = "owner"
  channelGuild = "foreign"
  await assert.rejects(validateLiveDestination(input), /destinationUnavailable/)
  channelGuild = "guild"
  channelType = 15
  await assert.rejects(validateLiveDestination(input), /destinationUnavailable/)
  channelType = 5
  await validateLiveDestination(input)
  status = 503
  await assert.rejects(validateLiveDestination(input), /providerUnavailable/)
  status = 403
  await assert.rejects(validateLiveDestination(input), /destinationUnavailable/)
  status = 200
  network = true
  await assert.rejects(validateLiveDestination(input), /providerUnavailable/)
})
