import { ConvexError, v } from "convex/values"
import type { Doc } from "../../../../_generated/dataModel"
import { mutation } from "../../../../_generated/server"
import { requireDiscordGuildManager } from "../../../../lib/auth"
import { guildConfigDoc } from "../../../../lib/validators"

const optionalChannelId = v.optional(v.union(v.string(), v.null()))

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

    const channelPatch = {
      ...(args.channels.logChannelId !== undefined
        ? { logChannelId: normalizeChannelId(args.channels.logChannelId) }
        : {}),
      ...(args.channels.modLogChannelId !== undefined
        ? { modLogChannelId: normalizeChannelId(args.channels.modLogChannelId) }
        : {}),
      ...(args.channels.welcomeChannelId !== undefined
        ? {
            welcomeChannelId: normalizeChannelId(
              args.channels.welcomeChannelId
            ),
          }
        : {}),
      ...(args.channels.updatesChannelId !== undefined
        ? {
            updatesChannelId: normalizeChannelId(
              args.channels.updatesChannelId
            ),
          }
        : {}),
      ...(args.channels.announcementChannelId !== undefined
        ? {
            announcementChannelId: normalizeChannelId(
              args.channels.announcementChannelId
            ),
          }
        : {}),
      updatedAt: now,
    }

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, channelPatch)
      const updatedConfig = await ctx.db.get(existingConfig._id)

      if (!updatedConfig) {
        throw new ConvexError({
          code: "CONFIG_NOT_FOUND",
          message: "Guild configuration could not be loaded after update.",
        })
      }

      return updatedConfig
    }

    const configId = await ctx.db.insert("guildConfigs", {
      guildId: guild._id,
      aiEnabled: true,
      moderationEnabled: false,
      welcomeEnabled: false,
      loggingEnabled: false,
      commandPrefix: "/",
      ...channelPatch,
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

    return createdConfig
  },
})

function normalizeChannelId(channelId: string | null): string | undefined {
  if (channelId === null) {
    return undefined
  }

  const trimmedChannelId = channelId.trim()

  return trimmedChannelId.length > 0 ? trimmedChannelId : undefined
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
