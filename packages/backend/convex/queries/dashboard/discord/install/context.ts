import { v } from "convex/values"
import type { Doc, Id } from "../../../../_generated/dataModel"
import { internalQuery } from "../../../../_generated/server"
import { getCurrentUser } from "../../../../lib/auth"
import {
  dashboardDiscordInstallableGuildViewModel,
  discordGuildInstallSessionDoc,
  linkedAccountDoc,
  userDoc,
} from "../../../../lib/validators"

const installableContextResult = v.union(
  v.object({
    status: v.literal("missingUser"),
  }),
  v.object({
    status: v.literal("ready"),
    user: userDoc,
    discordAccount: v.union(linkedAccountDoc, v.null()),
    guilds: v.array(dashboardDiscordInstallableGuildViewModel),
    installSessions: v.array(discordGuildInstallSessionDoc),
  })
)

const createInstallContextResult = v.union(
  v.object({
    status: v.literal("missingUser"),
  }),
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("alreadyInstalled"),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("verificationUnavailable"),
  }),
  v.object({
    status: v.literal("ready"),
    user: userDoc,
    discordAccount: linkedAccountDoc,
    discordGuildId: v.string(),
  })
)

const installSessionContextResult = v.union(
  v.object({
    status: v.literal("missingUser"),
  }),
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("ready"),
    user: userDoc,
    discordAccount: linkedAccountDoc,
    session: discordGuildInstallSessionDoc,
    guild: v.union(
      v.object({
        _id: v.id("guilds"),
        _creationTime: v.number(),
        discordGuildId: v.string(),
        name: v.string(),
        botJoinedAt: v.optional(v.number()),
        botLeftAt: v.optional(v.number()),
      }),
      v.null()
    ),
  })
)

export const getInstallableGuildsContext = internalQuery({
  args: {},
  returns: installableContextResult,
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return { status: "missingUser" as const }
    }

    const discordAccount = await getDiscordAccount(ctx, user._id)
    const installSessions = await getActiveInstallSessions(ctx, user._id)
    const guilds = discordAccount
      ? await getKnownManageableGuilds(
          ctx,
          user,
          discordAccount,
          installSessions
        )
      : []

    return {
      status: "ready" as const,
      user,
      discordAccount,
      guilds,
      installSessions,
    }
  },
})

export const getCreateServerInstallContext = internalQuery({
  args: {
    discordGuildId: v.string(),
  },
  returns: createInstallContextResult,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return { status: "missingUser" as const }
    }

    const discordAccount = await getDiscordAccount(ctx, user._id)

    if (!discordAccount) {
      return { status: "missingDiscordIdentity" as const }
    }

    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (!guild) {
      return { status: "verificationUnavailable" as const }
    }

    const membership = await getVerifiedManagerMembership(
      ctx,
      user,
      discordAccount,
      guild._id
    )

    if (!membership) {
      return { status: "verificationUnavailable" as const }
    }

    if (guild.botJoinedAt !== undefined && guild.botLeftAt === undefined) {
      return {
        status: "alreadyInstalled" as const,
        discordGuildId: guild.discordGuildId,
      }
    }

    return {
      status: "ready" as const,
      user,
      discordAccount,
      discordGuildId: guild.discordGuildId,
    }
  },
})

export const getInstallSessionContext = internalQuery({
  args: {
    installSessionId: v.optional(v.id("discordGuildInstallSessions")),
    discordGuildId: v.optional(v.string()),
  },
  returns: installSessionContextResult,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return { status: "missingUser" as const }
    }

    const discordAccount = await getDiscordAccount(ctx, user._id)

    if (!discordAccount) {
      return { status: "missingDiscordIdentity" as const }
    }

    const session = await getInstallSession(ctx, user._id, args)

    if (!session) {
      return { status: "notFound" as const }
    }

    if (
      session.userId !== user._id ||
      session.discordUserId !== discordAccount.providerAccountId
    ) {
      return { status: "forbidden" as const }
    }

    if (session.status === "expired" || session.expiresAt <= Date.now()) {
      return { status: "notFound" as const }
    }

    const guildDoc = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", session.discordGuildId)
      )
      .unique()

    const guild =
      guildDoc === null
        ? null
        : {
            _id: guildDoc._id,
            _creationTime: guildDoc._creationTime,
            discordGuildId: guildDoc.discordGuildId,
            name: guildDoc.name,
            ...(guildDoc.botJoinedAt !== undefined
              ? { botJoinedAt: guildDoc.botJoinedAt }
              : {}),
            ...(guildDoc.botLeftAt !== undefined
              ? { botLeftAt: guildDoc.botLeftAt }
              : {}),
          }

    return {
      status: "ready" as const,
      user,
      discordAccount,
      session,
      guild,
    }
  },
})

async function getDiscordAccount(
  ctx: Parameters<typeof getCurrentUser>[0],
  userId: Id<"users">
): Promise<Doc<"linkedAccounts"> | null> {
  return await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("provider"), "discord"))
    .first()
}

async function getKnownManageableGuilds(
  ctx: Parameters<typeof getCurrentUser>[0],
  user: Doc<"users">,
  discordAccount: Doc<"linkedAccounts">,
  activeSessions: Doc<"discordGuildInstallSessions">[]
) {
  const directMemberships = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .collect()

  const discordMemberships = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_discord_user_id", (q) =>
      q.eq("discordUserId", discordAccount.providerAccountId)
    )
    .collect()

  const membershipsByGuildId = new Map<
    Id<"guilds">,
    Doc<"discordGuildMemberships">
  >()

  for (const membership of [...directMemberships, ...discordMemberships]) {
    if (!isVerifiedManagerMembership(membership)) {
      continue
    }

    membershipsByGuildId.set(membership.guildId, membership)
  }

  const sessionByDiscordGuildId = new Map(
    activeSessions.map((session) => [session.discordGuildId, session])
  )

  const guilds = await Promise.all(
    Array.from(membershipsByGuildId.values()).map(async (membership) => {
      const guild = await ctx.db.get(membership.guildId)

      if (!guild) {
        return null
      }

      const session = sessionByDiscordGuildId.get(guild.discordGuildId)
      const isInstalled =
        guild.botJoinedAt !== undefined && guild.botLeftAt === undefined
      const isPending = session !== undefined && !isInstalled
      const state = isInstalled
        ? ("installed" as const)
        : isPending
          ? ("pending" as const)
          : ("installable" as const)

      return {
        discordGuildId: guild.discordGuildId,
        name: guild.name,
        ...(guild.iconUrl !== undefined ? { iconUrl: guild.iconUrl } : {}),
        ...(guild.iconHash !== undefined ? { iconHash: guild.iconHash } : {}),
        ...(guild.memberCount !== undefined
          ? { memberCount: guild.memberCount }
          : {}),
        ...(guild.presenceCount !== undefined
          ? { presenceCount: guild.presenceCount }
          : {}),
        ...(membership.isOwner !== undefined
          ? { isOwner: membership.isOwner }
          : {}),
        ...(membership.permissions !== undefined
          ? { permissions: membership.permissions }
          : {}),
        state,
        ...(session !== undefined
          ? {
              installSessionId: session._id,
              installSessionStatus: session.status,
              installSessionExpiresAt: session.expiresAt,
            }
          : {}),
        ...(isInstalled
          ? { dashboardHref: `/dashboard/${guild.discordGuildId}` }
          : {}),
      }
    })
  )

  return guilds
    .filter(
      (guild): guild is Exclude<(typeof guilds)[number], null> => guild !== null
    )
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function getVerifiedManagerMembership(
  ctx: Parameters<typeof getCurrentUser>[0],
  user: Doc<"users">,
  discordAccount: Doc<"linkedAccounts">,
  guildId: Id<"guilds">
) {
  const directMembership = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_user_id_and_guild_id", (q) =>
      q.eq("userId", user._id).eq("guildId", guildId)
    )
    .unique()

  if (isVerifiedManagerMembership(directMembership)) {
    return directMembership
  }

  const discordMembership = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_guild_id_and_discord_user_id", (q) =>
      q
        .eq("guildId", guildId)
        .eq("discordUserId", discordAccount.providerAccountId)
    )
    .unique()

  return isVerifiedManagerMembership(discordMembership)
    ? discordMembership
    : null
}

function isVerifiedManagerMembership(
  membership: Doc<"discordGuildMemberships"> | null
): membership is Doc<"discordGuildMemberships"> {
  return Boolean(
    membership?.canManage &&
    membership.managementVerifiedAt !== undefined &&
    membership.revokedAt === undefined
  )
}

async function getActiveInstallSessions(
  ctx: Parameters<typeof getCurrentUser>[0],
  userId: Id<"users">
) {
  const pending = await ctx.db
    .query("discordGuildInstallSessions")
    .withIndex("by_user_id_and_status", (q) =>
      q.eq("userId", userId).eq("status", "pending")
    )
    .collect()

  const botJoined = await ctx.db
    .query("discordGuildInstallSessions")
    .withIndex("by_user_id_and_status", (q) =>
      q.eq("userId", userId).eq("status", "bot_joined")
    )
    .collect()

  const now = Date.now()

  return [...pending, ...botJoined].filter((session) => session.expiresAt > now)
}

async function getInstallSession(
  ctx: Parameters<typeof getCurrentUser>[0],
  userId: Id<"users">,
  args: {
    installSessionId?: Id<"discordGuildInstallSessions">
    discordGuildId?: string
  }
) {
  if (args.installSessionId !== undefined) {
    return await ctx.db.get(args.installSessionId)
  }

  if (args.discordGuildId === undefined) {
    return null
  }

  const discordGuildId = args.discordGuildId
  const sessions = await ctx.db
    .query("discordGuildInstallSessions")
    .withIndex("by_discord_guild_id", (q) =>
      q.eq("discordGuildId", discordGuildId)
    )
    .collect()

  return (
    sessions
      .filter(
        (session) =>
          session.userId === userId &&
          (session.status === "pending" || session.status === "bot_joined")
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
  )
}
