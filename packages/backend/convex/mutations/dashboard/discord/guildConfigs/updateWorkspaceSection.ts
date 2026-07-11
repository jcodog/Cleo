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
const optionalText = v.optional(v.union(v.string(), v.null()))
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/
const WELCOME_SUBTEXT_MAX_LENGTH = 120
const logLevel = v.union(
  v.literal("none"),
  v.literal("minimal"),
  v.literal("medium"),
  v.literal("maximum")
)

export const update = mutation({
  args: {
    discordGuildId: v.string(),
    modules: v.object({
      moderationEnabled: v.optional(v.boolean()),
      welcomeEnabled: v.optional(v.boolean()),
      loggingEnabled: v.optional(v.boolean()),
    }),
    channels: v.object({
      logChannelId: optionalChannelId,
      modLogChannelId: optionalChannelId,
      welcomeChannelId: optionalChannelId,
      updatesChannelId: optionalChannelId,
      announcementChannelId: optionalChannelId,
    }),
    welcome: v.optional(
      v.object({
        subtext: optionalText,
      })
    ),
    logging: v.optional(
      v.object({
        level: logLevel,
      })
    ),
  },
  returns: guildConfigDoc,
  handler: async (ctx, args) => {
    const guild = await loadManagedGuild(ctx, args.discordGuildId)
    const existingConfig = await getGuildConfig(ctx, guild._id)
    const now = Date.now()
    const nextConfig = buildNextConfig({
      channels: args.channels,
      config: existingConfig,
      guildId: guild._id,
      modules: args.modules,
      now,
      welcome: args.welcome,
      logging: args.logging,
    })

    if (existingConfig) {
      await ctx.db.replace(existingConfig._id, nextConfig)
      const updatedConfig = await ctx.db.get(existingConfig._id)

      if (!updatedConfig) {
        throw new ConvexError({
          code: "CONFIG_NOT_FOUND",
          message: "Guild configuration could not be loaded after update.",
        })
      }

      await recordConfigAuditEvent(ctx, guild, existingConfig, updatedConfig)

      return updatedConfig
    }

    const configId = await ctx.db.insert("guildConfigs", nextConfig)
    const createdConfig = await ctx.db.get(configId)

    if (!createdConfig) {
      throw new ConvexError({
        code: "CONFIG_NOT_FOUND",
        message: "Guild configuration could not be loaded after creation.",
      })
    }

    await recordConfigAuditEvent(ctx, guild, null, createdConfig)

    return createdConfig
  },
})

function buildNextConfig({
  channels,
  config,
  guildId,
  modules,
  now,
  welcome,
  logging,
}: {
  channels: ChannelPatch
  config: Doc<"guildConfigs"> | null
  guildId: Doc<"guilds">["_id"]
  modules: ModulePatch
  now: number
  welcome: WelcomePatch | undefined
  logging: LoggingPatch | undefined
}): Omit<Doc<"guildConfigs">, "_id" | "_creationTime"> {
  return {
    guildId,
    aiEnabled: config?.aiEnabled ?? false,
    moderationEnabled:
      modules.moderationEnabled ?? config?.moderationEnabled ?? false,
    welcomeEnabled: modules.welcomeEnabled ?? config?.welcomeEnabled ?? false,
    loggingEnabled: modules.loggingEnabled ?? config?.loggingEnabled ?? false,
    ...(config?.commandPrefix !== undefined
      ? { commandPrefix: config.commandPrefix }
      : {}),
    ...(logging?.level !== undefined
      ? { logLevel: logging.level }
      : config?.logLevel !== undefined
        ? { logLevel: config.logLevel }
        : {}),
    ...(welcome?.subtext !== undefined
      ? buildWelcomeFields({ subtext: welcome.subtext })
      : config?.welcomeSubtext !== undefined
        ? { welcomeSubtext: config.welcomeSubtext }
        : {}),
    ...buildChannelFields({
      logChannelId:
        channels.logChannelId !== undefined
          ? channels.logChannelId
          : config?.logChannelId,
      modLogChannelId:
        channels.modLogChannelId !== undefined
          ? channels.modLogChannelId
          : config?.modLogChannelId,
      welcomeChannelId:
        channels.welcomeChannelId !== undefined
          ? channels.welcomeChannelId
          : config?.welcomeChannelId,
      updatesChannelId:
        channels.updatesChannelId !== undefined
          ? channels.updatesChannelId
          : config?.updatesChannelId,
      announcementChannelId:
        channels.announcementChannelId !== undefined
          ? channels.announcementChannelId
          : config?.announcementChannelId,
    }),
    createdAt: config?.createdAt ?? now,
    updatedAt: now,
  }
}

async function recordConfigAuditEvent(
  ctx: MutationCtx,
  guild: Doc<"guilds">,
  previousConfig: Doc<"guildConfigs"> | null,
  nextConfig: Doc<"guildConfigs">
) {
  const user = await getCurrentUser(ctx)
  const previous = previousConfig ? getConfigAuditFields(previousConfig) : null
  const next = getConfigAuditFields(nextConfig)

  if (previous !== null && JSON.stringify(previous) === JSON.stringify(next)) {
    return
  }

  await insertDashboardGuildAuditEvent(ctx, {
    guild,
    user,
    eventType:
      previousConfig === null
        ? "dashboard.guild_config.created"
        : "dashboard.guild_config.workspace_section_updated",
    summary:
      previousConfig === null
        ? "Dashboard guild configuration created"
        : "Dashboard workspace section settings updated",
    metadata: {
      previous,
      next,
    },
  })
}

function buildChannelFields(channels: ChannelPatch) {
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

function buildWelcomeFields(welcome: WelcomePatch) {
  const welcomeSubtext = normalizeOptionalText(
    "welcomeSubtext",
    welcome.subtext,
    WELCOME_SUBTEXT_MAX_LENGTH
  )

  return {
    ...(welcomeSubtext !== undefined ? { welcomeSubtext } : {}),
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

function normalizeOptionalText(
  fieldName: string,
  value: string | null | undefined,
  maxLength: number
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return undefined
  }

  if (trimmedValue.length > maxLength) {
    throw new ConvexError({
      code: "INVALID_TEXT_LENGTH",
      message: `${fieldName} must be ${maxLength} characters or fewer.`,
    })
  }

  return trimmedValue
}

function getConfigAuditFields(config: Doc<"guildConfigs">) {
  return {
    moderationEnabled: config.moderationEnabled,
    welcomeEnabled: config.welcomeEnabled,
    loggingEnabled: config.loggingEnabled,
    logLevel: config.logLevel ?? null,
    logChannelId: config.logChannelId ?? null,
    modLogChannelId: config.modLogChannelId ?? null,
    welcomeChannelId: config.welcomeChannelId ?? null,
    welcomeSubtext: config.welcomeSubtext ?? null,
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

type ModulePatch = {
  moderationEnabled?: boolean
  welcomeEnabled?: boolean
  loggingEnabled?: boolean
}

type ChannelPatch = {
  logChannelId?: string | null
  modLogChannelId?: string | null
  welcomeChannelId?: string | null
  updatesChannelId?: string | null
  announcementChannelId?: string | null
}

type WelcomePatch = {
  subtext?: string | null
}

type LoggingPatch = {
  level: "none" | "minimal" | "medium" | "maximum"
}
