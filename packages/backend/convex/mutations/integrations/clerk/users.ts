import { ConvexError, v, type Validator } from "convex/values"
import type { Doc, Id } from "../../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../../_generated/server"

type ClerkEmailAddress = {
  id: string
  email_address: string
}

type ClerkExternalAccount = {
  id?: string | null
  provider?: string | null
  provider_user_id?: string | null
  external_account_id?: string | null
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
  avatar_url?: string | null
  approved_scopes?: string | string[] | null
}

type ClerkUserData = {
  id: string
  primary_email_address_id?: string | null
  email_addresses?: ClerkEmailAddress[]
  external_accounts?: ClerkExternalAccount[]
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  image_url?: string | null
}

export const upsertFromWebhook = internalMutation({
  args: {
    data: v.any() as Validator<ClerkUserData>,
  },
  returns: v.id("users"),
  handler: async (ctx, { data }): Promise<Id<"users">> => {
    const now = Date.now()
    const email = getPrimaryEmail(data)
    const displayName = getDisplayName(data)
    const imageUrl = data.image_url ?? undefined
    let userId: Id<"users">

    if (!email) {
      throw new ConvexError({
        code: "EMAIL_REQUIRED",
        message: "A Clerk user email address is required.",
      })
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", data.id))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        ...(displayName !== undefined ? { displayName } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        updatedAt: now,
      })

      userId = existing._id
    } else {
      userId = await ctx.db.insert("users", {
        clerkUserId: data.id,
        email,
        ...(displayName !== undefined ? { displayName } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        role: "user",
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
    }

    await syncExternalAccounts(ctx, userId, data.external_accounts ?? [], now)

    return userId
  },
})

export const deleteFromWebhook = internalMutation({
  args: {
    clerkUserId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { clerkUserId }): Promise<null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique()

    if (!user) {
      return null
    }

    await ctx.db.patch(user._id, {
      status: "disabled",
      updatedAt: Date.now(),
    })

    return null
  },
})

function getPrimaryEmail(data: ClerkUserData): string {
  const primaryEmail = data.email_addresses?.find(
    (email) => email.id === data.primary_email_address_id
  )

  return (
    primaryEmail?.email_address ?? data.email_addresses?.[0]?.email_address ?? ""
  )
}

function getDisplayName(data: ClerkUserData): string | undefined {
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ")

  return name || data.username || undefined
}

async function syncExternalAccounts(
  ctx: MutationCtx,
  userId: Id<"users">,
  externalAccounts: ClerkExternalAccount[],
  now: number
) {
  for (const account of externalAccounts) {
    const provider = getLinkedProvider(account.provider)
    const providerAccountId =
      account.provider_user_id ?? account.external_account_id ?? account.id

    if (!provider || !providerAccountId) {
      continue
    }

    const existing = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", provider).eq("providerAccountId", providerAccountId)
      )
      .unique()

    if (existing && existing.userId !== userId) {
      continue
    }

    const value = {
      userId,
      provider,
      providerAccountId,
      scopes: getExternalAccountScopes(account),
      ...(account.username !== null && account.username !== undefined
        ? { username: account.username }
        : {}),
      ...(getExternalAccountDisplayName(account) !== undefined
        ? { displayName: getExternalAccountDisplayName(account) }
        : {}),
      ...(getExternalAccountAvatarUrl(account) !== undefined
        ? { avatarUrl: getExternalAccountAvatarUrl(account) }
        : {}),
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, value)
      continue
    }

    await ctx.db.insert("linkedAccounts", {
      ...value,
      createdAt: now,
    })
  }
}

function getLinkedProvider(
  provider: string | null | undefined
): Doc<"linkedAccounts">["provider"] | null {
  switch (provider) {
    case "discord":
    case "oauth_discord":
      return "discord"
    case "kick":
    case "oauth_kick":
      return "kick"
    case "twitch":
    case "oauth_twitch":
      return "twitch"
    default:
      return null
  }
}

function getExternalAccountScopes(account: ClerkExternalAccount): string[] {
  if (Array.isArray(account.approved_scopes)) {
    return account.approved_scopes
  }

  if (typeof account.approved_scopes === "string") {
    return account.approved_scopes.split(" ").filter(Boolean)
  }

  return []
}

function getExternalAccountDisplayName(
  account: ClerkExternalAccount
): string | undefined {
  const name = [account.first_name, account.last_name].filter(Boolean).join(" ")

  return name || account.username || undefined
}

function getExternalAccountAvatarUrl(
  account: ClerkExternalAccount
): string | undefined {
  return account.image_url ?? account.avatar_url ?? undefined
}
