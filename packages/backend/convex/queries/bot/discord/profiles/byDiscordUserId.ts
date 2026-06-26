import { v } from "convex/values"

import type { Doc } from "../../../../_generated/dataModel"
import { internalQuery } from "../../../../_generated/server"
import {
  botDiscordProfileResult,
  type BotDiscordProfileResult,
} from "../../../../lib/botDiscordProfiles"

export const get = internalQuery({
  args: {
    discordUserId: v.string(),
  },
  returns: botDiscordProfileResult,
  handler: async (ctx, args): Promise<BotDiscordProfileResult> => {
    const linkedAccount = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "discord").eq("providerAccountId", args.discordUserId)
      )
      .unique()

    if (!linkedAccount) {
      return {
        status: "unlinked",
      }
    }

    const user = await ctx.db.get(linkedAccount.userId)

    if (!user) {
      return {
        status: "unlinked",
      }
    }

    return toBotDiscordProfileResult(user, linkedAccount)
  },
})

export function toBotDiscordProfileResult(
  user: Pick<Doc<"users">, "displayName" | "role" | "status">,
  linkedAccount: Pick<Doc<"linkedAccounts">, "username" | "displayName">
): BotDiscordProfileResult {
  return {
    status: "linked",
    account: {
      ...(user.displayName !== undefined ? { displayName: user.displayName } : {}),
      role: user.role,
      status: user.status ?? "active",
    },
    discordIdentity: {
      ...(linkedAccount.username !== undefined
        ? { username: linkedAccount.username }
        : {}),
      ...(linkedAccount.displayName !== undefined
        ? { displayName: linkedAccount.displayName }
        : {}),
    },
  }
}
