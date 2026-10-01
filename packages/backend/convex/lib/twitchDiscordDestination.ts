"use node"
import { z } from "zod"
import { fetchDiscordJson } from "./discordRestTransport"

const roleSchema = z.object({
  id: z.string(),
  permissions: z.string().regex(/^\d+$/),
  managed: z.boolean(),
  mentionable: z.boolean(),
})
const overwriteSchema = z.object({
  id: z.string(),
  type: z.number(),
  allow: z.string().regex(/^\d+$/),
  deny: z.string().regex(/^\d+$/),
})
export async function validateLiveDestination(input: {
  guildId: string
  ownerDiscordId?: string
  channelId: string
  mentionMode: string
  roleId?: string
  token: string
}) {
  const get = async (path: string) => {
    const result = await fetchDiscordJson(
      `https://discord.com/api/v10${path}`,
      { headers: { Authorization: `Bot ${input.token}` }, redirect: "error" }
    )
    if (!result || result.status === 429 || result.status >= 500)
      throw new Error("providerUnavailable")
    if (!result.ok) throw new Error("destinationUnavailable")
    return result.json
  }
  const guild = z
    .object({ owner_id: z.string(), roles: z.array(roleSchema) })
    .parse(await get(`/guilds/${input.guildId}`))
  if (guild.owner_id !== input.ownerDiscordId) throw new Error("ownerChanged")
  const channel = z
    .object({
      guild_id: z.string(),
      type: z.number(),
      permission_overwrites: z.array(overwriteSchema),
    })
    .parse(await get(`/channels/${input.channelId}`))
  if (channel.guild_id !== input.guildId || ![0, 5].includes(channel.type))
    throw new Error("destinationUnavailable")
  const bot = z.object({ id: z.string() }).parse(await get("/users/@me"))
  const member = z
    .object({ roles: z.array(z.string()) })
    .parse(await get(`/guilds/${input.guildId}/members/${bot.id}`))
  let permissions = guild.roles
    .filter(
      (role) => role.id === input.guildId || member.roles.includes(role.id)
    )
    .reduce((bits, role) => bits | BigInt(role.permissions), 0n)
  const admin = (permissions & 8n) !== 0n
  if (!admin) {
    const everyone = channel.permission_overwrites.find(
      (entry) => entry.id === input.guildId && entry.type === 0
    )
    if (everyone)
      permissions =
        (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow)
    const roles = channel.permission_overwrites.filter(
      (entry) => entry.type === 0 && member.roles.includes(entry.id)
    )
    permissions =
      (permissions &
        ~roles.reduce((bits, role) => bits | BigInt(role.deny), 0n)) |
      roles.reduce((bits, role) => bits | BigInt(role.allow), 0n)
    const own = channel.permission_overwrites.find(
      (entry) => entry.type === 1 && entry.id === bot.id
    )
    if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow)
  }
  const has = (bit: bigint) => admin || (permissions & bit) === bit
  if (!has(1024n | 2048n)) throw new Error("missingDiscordPermission")
  if (input.mentionMode === "everyone" && !has(131072n))
    throw new Error("missingMentionPermission")
  if (input.mentionMode === "role") {
    const role = guild.roles.find((role) => role.id === input.roleId)
    if (
      !role ||
      role.id === input.guildId ||
      role.managed ||
      (!role.mentionable && !has(131072n))
    )
      throw new Error("roleUnavailable")
  }
}
