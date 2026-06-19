import { ConvexError, v } from "convex/values"
import type { Doc } from "../../../../_generated/dataModel"
import type { MutationCtx } from "../../../../_generated/server"
import { mutation } from "../../../../_generated/server"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"
import { insertDashboardGuildAuditEvent } from "../../../../lib/guildAudit"
import { guildConfigDoc } from "../../../../lib/validators"

const optionalChannelId = v.optional(v.union(v.string(), v.null()))
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/

export const update = mutation({
  args: {
    discordGuildId: v.string(),
    channels: v.object({
      logChannelId: optionalChannelId,
      modLogChannelId: optionalChannelId,
      welcomeChannelId: optionalChannelId,
      updatesChannelId: optionalChannelId,
      announcementChannelId: optionalChannelId,
    }),
  },
  returns: guildConfigDoc,
  handler: async (ctx, args) => {
    const guild = await loadManagedGuild(ctx, args.discordGuildId)
    const existingConfig = await getGuildConfig(ctx, guild._id)
    const now = Date.now()

    if (existingConfig) {
      await ctx.db.replace(
        existingConfig._id,
        buildUpdatedConfig(existingConfig, args.channels, now)
      )
      const updatedConfig = await ctx.db.get(existingConfig._id)

      if (!updatedConfig) {
        throw new ConvexError({
          code: "CONFIG_NOT_FOUND",
          message: "Guild configuration could not be loaded after update.",
        })
      }

      await recordChannelAuditEvent(ctx, guild, existingConfig, updatedConfig)

      return updatedConfig
    }

    const configId = await ctx.db.insert("guildConfigs", {
      guildId: guild._id,
      aiEnabled: false,
      moderationEnabled: false,
      welcomeEnabled: false,
      loggingEnabled: false,
      ...buildChannelFields(args.channels),
      createdAt: now,
      updatedAt: now,
    })

    const createdConfig = await ctx.db.get(configId)

    if (!createdConfig) {
      throw new ConvexError({
        code: "CONFIG_NOT_FOUND",
        message: "Guild configuration could not be loaded after creation.",
      })
    }

    await recordChannelAuditEvent(ctx, guild, null, createdConfig)

    return createdConfig
  },
})

async function recordChannelAuditEvent(
  ctx: MutationCtx,
  guild: Doc<"guilds">,
  previousConfig: Doc<"guildConfigs"> | null,
  nextConfig: Doc<"guildConfigs">
) {
  const user = await getCurrentUser(ctx)
  const previous = previousConfig ? getChannelAuditFields(previousConfig) : null
  const next = getChannelAuditFields(nextConfig)

  if (previous !== null && JSON.stringify(previous) === JSON.stringify(next)) {
    return
  }

  await insertDashboardGuildAuditEvent(ctx, {
    guild,
    user,
    eventType:
      previousConfig === null
        ? "dashboard.guild_config.created"
        : "dashboard.guild_config.channels_updated",
    summary:
      previousConfig === null
        ? "Dashboard guild configuration created"
        : "Dashboard channel settings updated",
    metadata: {
      previous,
      next,
    },
  })
}

function buildUpdatedConfig(
  config: Doc<"guildConfigs">,
  channels: {
    logChannelId?: string | null
    modLogChannelId?: string | null
    welcomeChannelId?: string | null
    updatesChannelId?: string | null
    announcementChannelId?: string | null
  },
  updatedAt: number
) {
  return {
    guildId: config.guildId,
    aiEnabled: config.aiEnabled,
    moderationEnabled: config.moderationEnabled,
    welcomeEnabled: config.welcomeEnabled,
    loggingEnabled: config.loggingEnabled,
    ...(config.commandPrefix !== undefined
      ? { commandPrefix: config.commandPrefix }
      : {}),
    ...(config.logLevel !== undefined ? { logLevel: config.logLevel } : {}),
    ...(config.welcomeSubtext !== undefined
      ? { welcomeSubtext: config.welcomeSubtext }
      : {}),
    ...buildChannelFields({
      logChannelId:
        channels.logChannelId !== undefined
          ? channels.logChannelId
          : config.logChannelId,
      modLogChannelId:
        channels.modLogChannelId !== undefined
          ? channels.modLogChannelId
          : config.modLogChannelId,
      welcomeChannelId:
        channels.welcomeChannelId !== undefined
          ? channels.welcomeChannelId
          : config.welcomeChannelId,
      updatesChannelId:
        channels.updatesChannelId !== undefined
          ? channels.updatesChannelId
          : config.updatesChannelId,
      announcementChannelId:
        channels.announcementChannelId !== undefined
          ? channels.announcementChannelId
          : config.announcementChannelId,
    }),
    createdAt: config.createdAt,
    updatedAt,
  }
}

function buildChannelFields(channels: {
  logChannelId?: string | null
  modLogChannelId?: string | null
  welcomeChannelId?: string | null
  updatesChannelId?: string | null
  announcementChannelId?: string | null
}) {
  const logChannelId = normalizeChannelId(channels.logChannelId)
  const modLogChannelId = normalizeChannelId(channels.modLogChannelId)
  const welcomeChannelId = normalizeChannelId(channels.welcomeChannelId)
  const updatesChannelId = normalizeChannelId(channels.updatesChannelId)
  const announcementChannelId = normalizeChannelId(
    channels.announcementChannelId
  )

  return {
    ...(logChannelId !== undefined ? { logChannelId } : {}),
    ...(modLogChannelId !== undefined ? { modLogChannelId } : {}),
    ...(welcomeChannelId !== undefined ? { welcomeChannelId } : {}),
    ...(updatesChannelId !== undefined ? { updatesChannelId } : {}),
    ...(announcementChannelId !== undefined ? { announcementChannelId } : {}),
  }
}

function normalizeChannelId(
  channelId: string | null | undefined
): string | undefined {
  if (channelId === null || channelId === undefined) {
    return undefined
  }

  const trimmedChannelId = channelId.trim()

  if (trimmedChannelId.length === 0) {
    return undefined
  }

  if (!DISCORD_SNOWFLAKE_PATTERN.test(trimmedChannelId)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_CHANNEL_ID",
      message: "Discord channel IDs must be valid snowflakes.",
    })
  }

  return trimmedChannelId
}

function getChannelAuditFields(config: Doc<"guildConfigs">) {
  return {
    logChannelId: config.logChannelId ?? null,
    modLogChannelId: config.modLogChannelId ?? null,
    welcomeChannelId: config.welcomeChannelId ?? null,
    updatesChannelId: config.updatesChannelId ?? null,
    announcementChannelId: config.announcementChannelId ?? null,
  }
}

async function loadManagedGuild(
  ctx: Parameters<typeof requireDiscordGuildManager>[0],
  discordGuildId: string
): Promise<Doc<"guilds">> {
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discord_guild_id", (q) =>
      q.eq("discordGuildId", discordGuildId)
    )
    .unique()

  if (!guild) {
    throw new ConvexError({
      code: "GUILD_NOT_FOUND",
      message: "Discord server was not found.",
    })
  }

  await requireDiscordGuildManager(ctx, guild._id)

  if (guild.botLeftAt !== undefined) {
    throw new ConvexError({
      code: "BOT_LEFT",
      message: "Cleo is not currently in this Discord server.",
    })
  }

  return guild
}

async function getGuildConfig(
  ctx: Parameters<typeof requireDiscordGuildManager>[0],
  guildId: Doc<"guilds">["_id"]
): Promise<Doc<"guildConfigs"> | null> {
  return await ctx.db
    .query("guildConfigs")
    .withIndex("by_guild_id", (q) => q.eq("guildId", guildId))
    .unique()
}
