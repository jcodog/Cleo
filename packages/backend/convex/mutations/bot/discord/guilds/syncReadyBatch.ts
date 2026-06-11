import { v } from "convex/values"
import type { Doc, Id } from "../../../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../../../_generated/server"

const readyGuild = v.object({
  discordGuildId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
  iconHash: v.optional(v.string()),
  ownerDiscordId: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  presenceCount: v.optional(v.number()),
  botJoinedAt: v.optional(v.number()),
  readyShardId: v.number(),
  readyShardCount: v.number(),
  readyShardKey: v.string(),
})

export type ReadyGuildInput = {
  discordGuildId: string
  name: string
  description?: string
  iconUrl?: string
  iconHash?: string
  ownerDiscordId?: string
  memberCount?: number
  presenceCount?: number
  botJoinedAt?: number
  readyShardId: number
  readyShardCount: number
  readyShardKey: string
}

export type ReadyGuildWriteStats = {
  processed: number
  insertedGuilds: number
  patchedGuilds: number
  skippedStaleGuilds: number
  skippedUnchangedGuilds: number
  insertedConfigs: number
}

type ReadyGuildPatch = Partial<
  Pick<
    Doc<"guilds">,
    | "name"
    | "description"
    | "iconUrl"
    | "iconHash"
    | "ownerDiscordId"
    | "memberCount"
    | "presenceCount"
    | "botJoinedAt"
    | "botLeftAt"
    | "lastSyncedAt"
    | "readyShardId"
    | "readyShardCount"
    | "readyShardKey"
    | "updatedAt"
  >
>

export const sync = internalMutation({
  args: {
    guilds: v.array(readyGuild),
    lastSyncedAt: v.number(),
  },
  returns: v.object({
    processed: v.number(),
    insertedGuilds: v.number(),
    patchedGuilds: v.number(),
    skippedStaleGuilds: v.number(),
    skippedUnchangedGuilds: v.number(),
    insertedConfigs: v.number(),
  }),
  handler: async (ctx, args): Promise<ReadyGuildWriteStats> => {
    const now = Date.now()
    const stats: ReadyGuildWriteStats = {
      processed: args.guilds.length,
      insertedGuilds: 0,
      patchedGuilds: 0,
      skippedStaleGuilds: 0,
      skippedUnchangedGuilds: 0,
      insertedConfigs: 0,
    }

    for (const guild of args.guilds) {
      const existing = await ctx.db
        .query("guilds")
        .withIndex("by_discord_guild_id", (q) =>
          q.eq("discordGuildId", guild.discordGuildId)
        )
        .unique()

      let guildId: Id<"guilds">

      if (existing) {
        guildId = existing._id

        const patch = getReadyGuildPatch(existing, guild, {
          lastSyncedAt: args.lastSyncedAt,
          now,
        })

        if (patch === "stale") {
          stats.skippedStaleGuilds += 1
          continue
        }

        if (patch === null) {
          stats.skippedUnchangedGuilds += 1
        } else {
          await ctx.db.patch(existing._id, patch)
          stats.patchedGuilds += 1
        }
      } else {
        guildId = await ctx.db.insert("guilds", {
          discordGuildId: guild.discordGuildId,
          name: guild.name,
          ...(guild.description !== undefined
            ? { description: guild.description }
            : {}),
          ...(guild.iconUrl !== undefined ? { iconUrl: guild.iconUrl } : {}),
          ...(guild.iconHash !== undefined ? { iconHash: guild.iconHash } : {}),
          ...(guild.ownerDiscordId !== undefined
            ? { ownerDiscordId: guild.ownerDiscordId }
            : {}),
          ...(guild.memberCount !== undefined
            ? { memberCount: guild.memberCount }
            : {}),
          ...(guild.presenceCount !== undefined
            ? { presenceCount: guild.presenceCount }
            : {}),
          ...(guild.botJoinedAt !== undefined
            ? { botJoinedAt: guild.botJoinedAt }
            : {}),
          lastSyncedAt: args.lastSyncedAt,
          readyShardId: guild.readyShardId,
          readyShardCount: guild.readyShardCount,
          readyShardKey: guild.readyShardKey,
          createdAt: now,
          updatedAt: now,
        })
        stats.insertedGuilds += 1
      }

      const insertedConfig = await ensureGuildConfig(ctx, guildId, now)

      if (insertedConfig) {
        stats.insertedConfigs += 1
      }
    }

    return stats
  },
})

export function getReadyGuildPatch(
  existing: Pick<
    Doc<"guilds">,
    | "name"
    | "description"
    | "iconUrl"
    | "iconHash"
    | "ownerDiscordId"
    | "memberCount"
    | "presenceCount"
    | "botJoinedAt"
    | "botLeftAt"
    | "lastSyncedAt"
    | "readyShardId"
    | "readyShardCount"
    | "readyShardKey"
  >,
  incoming: ReadyGuildInput,
  options: {
    lastSyncedAt: number
    now: number
  }
): ReadyGuildPatch | "stale" | null {
  if (
    existing.botLeftAt !== undefined &&
    options.lastSyncedAt <= existing.botLeftAt
  ) {
    return "stale"
  }

  if (
    existing.lastSyncedAt !== undefined &&
    options.lastSyncedAt < existing.lastSyncedAt
  ) {
    return "stale"
  }

  const patch: ReadyGuildPatch = {}

  assignIfChanged(patch, existing, "name", incoming.name)
  assignIfChanged(patch, existing, "description", incoming.description)
  assignIfChanged(patch, existing, "iconUrl", incoming.iconUrl)
  assignIfChanged(patch, existing, "iconHash", incoming.iconHash)
  assignIfChanged(patch, existing, "ownerDiscordId", incoming.ownerDiscordId)
  assignIfChanged(patch, existing, "memberCount", incoming.memberCount)
  assignIfChanged(patch, existing, "presenceCount", incoming.presenceCount)

  if (incoming.botJoinedAt !== undefined) {
    assignIfChanged(patch, existing, "botJoinedAt", incoming.botJoinedAt)
  }

  assignIfChanged(patch, existing, "readyShardId", incoming.readyShardId)
  assignIfChanged(patch, existing, "readyShardCount", incoming.readyShardCount)
  assignIfChanged(patch, existing, "readyShardKey", incoming.readyShardKey)

  if (existing.botLeftAt !== undefined) {
    patch.botLeftAt = undefined
  }

  assignIfChanged(patch, existing, "lastSyncedAt", options.lastSyncedAt)

  if (Object.keys(patch).length === 0) {
    return null
  }

  patch.updatedAt = options.now
  return patch
}

async function ensureGuildConfig(
  ctx: MutationCtx,
  guildId: Id<"guilds">,
  now: number
): Promise<boolean> {
  const existing = await ctx.db
    .query("guildConfigs")
    .withIndex("by_guild_id", (q) => q.eq("guildId", guildId))
    .unique()

  if (existing) {
    return false
  }

  await ctx.db.insert("guildConfigs", {
    guildId,
    aiEnabled: false,
    moderationEnabled: false,
    welcomeEnabled: false,
    loggingEnabled: false,
    commandPrefix: "/",
    createdAt: now,
    updatedAt: now,
  })

  return true
}

function assignIfChanged<
  TKey extends keyof ReadyGuildPatch,
  TExisting extends Partial<Record<TKey, ReadyGuildPatch[TKey]>>,
>(
  patch: ReadyGuildPatch,
  existing: TExisting,
  key: TKey,
  nextValue: ReadyGuildPatch[TKey]
): void {
  if (existing[key] !== nextValue) {
    patch[key] = nextValue
  }
}
