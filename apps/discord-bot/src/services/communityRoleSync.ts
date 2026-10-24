import { randomUUID } from "node:crypto"
import { ConvexHttpClient } from "convex/browser"
import type { FunctionReturnType } from "convex/server"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { discordEnv } from "@workspace/env/discord"
import { CLEO_COMMUNITY_ROLES } from "@workspace/shared/cleoRoleEligibility"
import { z } from "zod"
import {
  PermissionFlagsBits,
  type Client,
  type ChatInputCommandInteraction,
} from "discord.js"
import { registerCleanupHook } from "@/runtime/shutdown"
import { botLogError } from "@/utils/botLog"

function backend() {
  return discordEnv.CONVEX_URL && discordEnv.DISCORD_BOT_CONVEX_SECRET
    ? {
        client: new ConvexHttpClient(discordEnv.CONVEX_URL),
        secret: discordEnv.DISCORD_BOT_CONVEX_SECRET,
      }
    : null
}
export async function recordUserInstallation(
  interaction: ChatInputCommandInteraction
) {
  if (interaction.authorizingIntegrationOwners?.userId !== interaction.user.id)
    return
  const service = backend()
  if (service)
    await service.client
      .action(api.communityRuntime.installationInteraction, {
        secret: service.secret,
        discordUserId: interaction.user.id,
        interactionId: interaction.id,
      })
      .catch(() => botLogError("User installation verification unavailable."))
}
export async function enqueueCommunityMember(
  guildId: string,
  discordUserId: string
) {
  if (guildId !== discordEnv.CLEO_OFFICIAL_GUILD_ID) return
  const service = backend()
  if (service)
    await service.client
      .action(api.communityRuntime.enqueue, {
        secret: service.secret,
        discordUserId,
      })
      .catch(() => botLogError("Community role queue unavailable."))
}
export function configureCommunityRoleSync(client: Client<true>) {
  if (discordEnv.CLEO_COMMUNITY_ROLES_ENABLED !== "true") return
  const officialGuildId = discordEnv.CLEO_OFFICIAL_GUILD_ID
  if (!officialGuildId) return
  const service = backend()
  if (!service) return
  const worker = randomUUID()
  let busy = false
  const run = async () => {
    if (busy || !client.guilds.cache.get(officialGuildId)?.available) return
    busy = true
    let batch: FunctionReturnType<typeof api.communityRuntime.claimJobs> = null
    const settled = new Set<string>()
    try {
      batch = await service.client.action(api.communityRuntime.claimJobs, {
        secret: service.secret,
        worker,
      })
      if (!batch) return
      if (batch.guildId !== officialGuildId)
        throw new Error("Official community guild configuration changed.")
      const guild = client.guilds.cache.get(officialGuildId)
      if (!guild?.available)
        throw new Error("Official community guild unavailable.")
      const requireAvailableGuild = () => {
        if (
          !guild.available ||
          client.guilds.cache.get(officialGuildId) !== guild
        )
          throw new Error("Official community guild unavailable.")
      }
      const mapping = z
        .record(
          z.enum(CLEO_COMMUNITY_ROLES.filter((r) => r !== "premiumSupporter")),
          z
            .string()
            .regex(/^\d{17,20}$/)
            .optional()
        )
        .parse(JSON.parse(batch.roleIdsJSON))
      const ids = Object.values(mapping).filter(
        (id): id is string => id !== undefined
      )
      if (new Set(ids).size !== ids.length)
        throw new Error("Managed community roles must have distinct IDs.")
      const roles = await guild.roles.fetch()
      const me = guild.members.me
      if (
        !me?.permissions.has(PermissionFlagsBits.ManageRoles) ||
        ids.some((id) => {
          const role = roles.get(id)
          return (
            !role ||
            role.permissions.bitfield !== 0n ||
            role.managed ||
            !role.editable
          )
        })
      )
        throw new Error(
          "Managed community role permissions or hierarchy unavailable."
        )
      for (const job of batch.jobs) {
        if (Date.now() >= job.leaseUntil - 10000) continue
        let success = false
        try {
          requireAvailableGuild()
          const member = await guild.members
            .fetch(job.discordUserId)
            .catch((error) => {
              if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === 10007
              )
                return null
              throw error
            })
          requireAvailableGuild()
          if (member)
            for (const key of CLEO_COMMUNITY_ROLES) {
              requireAvailableGuild()
              if (Date.now() >= job.leaseUntil - 5000)
                throw new Error("Role reconciliation lease expired.")
              if (key === "premiumSupporter") continue
              const id = mapping[key]
              if (!id) continue
              const wanted = job.eligibility[key] === "eligible"
              if (wanted && !member.roles.cache.has(id))
                await member.roles.add(
                  id,
                  "Verified Cleo community eligibility"
                )
              else if (!wanted && member.roles.cache.has(id))
                await member.roles.remove(
                  id,
                  "Cleo community eligibility revoked"
                )
            }
          success = true
        } catch {
          botLogError("Community role reconciliation deferred.")
        }
        await service.client.action(api.communityRuntime.settleJob, {
          secret: service.secret,
          worker,
          id: job.id,
          revision: job.revision,
          success,
        })
        settled.add(job.id)
      }
    } catch {
      botLogError("Community role synchronisation unavailable.")
    } finally {
      for (const job of batch?.jobs ?? []) {
        if (settled.has(job.id)) continue
        await service.client
          .action(api.communityRuntime.settleJob, {
            secret: service.secret,
            worker,
            id: job.id,
            revision: job.revision,
            success: false,
          })
          .catch(() => botLogError("Community role claim release unavailable."))
      }
      busy = false
    }
  }
  const timer = setInterval(() => {
    void run()
  }, 15000)
  timer.unref()
  registerCleanupHook(() => clearInterval(timer))
  void run()
}
