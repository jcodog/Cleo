import { ConvexError, v } from "convex/values"
import type { Doc } from "../../../../_generated/dataModel"
import { mutation } from "../../../../_generated/server"
import { requireDiscordGuildManager } from "../../../../lib/auth"
import { guildConfigDoc } from "../../../../lib/validators"

export const update = mutation({
  args: {
    discordGuildId: v.string(),
    modules: v.object({
      aiEnabled: v.optional(v.boolean()),
      moderationEnabled: v.optional(v.boolean()),
      welcomeEnabled: v.optional(v.boolean()),
      loggingEnabled: v.optional(v.boolean()),
    }),
  },
  returns: guildConfigDoc,
  handler: async (ctx, args) => {
    const guild = await loadManagedGuild(ctx, args.discordGuildId)
    const existingConfig = await getGuildConfig(ctx, guild._id)
    const now = Date.now()

    const patch = {
      ...(args.modules.aiEnabled !== undefined
        ? { aiEnabled: args.modules.aiEnabled }
        : {}),
      ...(args.modules.moderationEnabled !== undefined
        ? { moderationEnabled: args.modules.moderationEnabled }
        : {}),
      ...(args.modules.welcomeEnabled !== undefined
        ? { welcomeEnabled: args.modules.welcomeEnabled }
        : {}),
      ...(args.modules.loggingEnabled !== undefined
        ? { loggingEnabled: args.modules.loggingEnabled }
        : {}),
      updatedAt: now,
    }

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, patch)
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
      aiEnabled: args.modules.aiEnabled ?? true,
      moderationEnabled: args.modules.moderationEnabled ?? false,
      welcomeEnabled: args.modules.welcomeEnabled ?? false,
      loggingEnabled: args.modules.loggingEnabled ?? false,
      commandPrefix: "/",
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
