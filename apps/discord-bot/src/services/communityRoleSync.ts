import { randomUUID } from "node:crypto"
import { ConvexHttpClient } from "convex/browser"
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
  const service = backend()
  if (!service) return
  const worker = randomUUID()
  let busy = false
  const run = async () => {
    if (busy) return
    busy = true
    try {
      const batch = await service.client.action(
        api.communityRuntime.claimJobs,
        { secret: service.secret, worker }
      )
      if (!batch || batch.guildId !== discordEnv.CLEO_OFFICIAL_GUILD_ID) return
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
      const guild = client.guilds.cache.get(batch.guildId)
      if (!guild) return
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
          if (member)
            for (const key of CLEO_COMMUNITY_ROLES) {
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
      }
    } catch {
      botLogError("Community role synchronisation unavailable.")
    } finally {
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
