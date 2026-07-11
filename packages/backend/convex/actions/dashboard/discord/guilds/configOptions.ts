"use node"

import { backendEnv } from "@workspace/env/backend"
import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import {
  fetchDiscordGuildChannels,
  fetchDiscordGuildRoles,
} from "../../../../lib/discordRest"
import { verifyBotCanAccessDiscordGuild } from "../lib/restAccess"

const configOptionsResult = v.union(
  v.object({ status: v.literal("notFound") }),
  v.object({ status: v.literal("forbidden") }),
  v.object({ status: v.literal("botLeft") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({
    status: v.literal("ready"),
    channels: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        type: v.union(
          v.literal("text"),
          v.literal("announcement"),
          v.literal("thread"),
          v.literal("forum")
        ),
      })
    ),
    roles: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
      })
    ),
  })
)

export const get = action({
  args: {
    discordGuildId: v.string(),
  },
  returns: configOptionsResult,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.guilds.accessContext
        .getManagedGuildContext,
      args
    )

    if (context.status === "missingUser") {
      return { status: "forbidden" as const }
    }

    if (context.status !== "ready") {
      return context
    }

    if (context.guild.botLeftAt !== undefined) {
      return { status: "botLeft" as const }
    }

    if (!backendEnv.DISCORD_BOT_TOKEN) {
      return { status: "unavailable" as const }
    }

    const botGuild = await verifyBotCanAccessDiscordGuild(args.discordGuildId)

    if (botGuild.status === "notInstalled") {
      return { status: "botLeft" as const }
    }

    if (botGuild.status === "unavailable") {
      return { status: "unavailable" as const }
    }

    const [channelResult, roles] = await Promise.all([
      fetchDiscordGuildChannels(
        args.discordGuildId,
        backendEnv.DISCORD_BOT_TOKEN,
        { includeSupportTargets: true }
      ),
      fetchDiscordGuildRoles(args.discordGuildId, backendEnv.DISCORD_BOT_TOKEN),
    ])

    if (channelResult.status !== "ready" || roles === null) {
      return { status: "unavailable" as const }
    }

    return {
      status: "ready" as const,
      channels: channelResult.channels.map((channel) => ({
        id: channel.discordChannelId,
        name: channel.name,
        type: channel.type,
      })),
      roles: roles
        .filter(
          (role) =>
            !role.managed &&
            role.discordRoleId !== args.discordGuildId &&
            role.name !== "@everyone"
        )
        .map((role) => ({
          id: role.discordRoleId,
          name: role.name,
        })),
    }
  },
})
