import { ConvexError, v, type Validator } from "convex/values"
import type { Id } from "../../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../../_generated/server"
import { getClerkLinkedProvider } from "../../../lib/clerkProviders"

type ClerkEmailAddress = {
  id?: string
  email_address?: string
  emailAddress?: string
}

type ClerkExternalAccount = {
  id?: string | null
  provider?: string | null
  provider_user_id?: string | null
  providerUserId?: string | null
  external_account_id?: string | null
  externalAccountId?: string | null
  username?: string | null
  email_address?: string | null
  emailAddress?: string | null
  first_name?: string | null
  firstName?: string | null
  last_name?: string | null
  lastName?: string | null
  image_url?: string | null
  imageUrl?: string | null
  avatar_url?: string | null
  avatarUrl?: string | null
  approved_scopes?: string | string[] | null
  approvedScopes?: string | string[] | null
}

type ClerkUserData = {
  id: string
  primary_email_address_id?: string | null
  primaryEmailAddressId?: string | null
  email_addresses?: ClerkEmailAddress[]
  emailAddresses?: ClerkEmailAddress[]
  external_accounts?: ClerkExternalAccount[]
  externalAccounts?: ClerkExternalAccount[]
  first_name?: string | null
  firstName?: string | null
  last_name?: string | null
  lastName?: string | null
  username?: string | null
  image_url?: string | null
  imageUrl?: string | null
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
    const imageUrl = data.image_url ?? data.imageUrl ?? undefined
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
        displayName: displayName ?? undefined,
        imageUrl: imageUrl ?? undefined,
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

    await syncExternalAccounts(
      ctx,
      userId,
      data.external_accounts ?? data.externalAccounts ?? [],
      now
    )

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
  const emailAddresses = data.email_addresses ?? data.emailAddresses ?? []
  const primaryEmailAddressId =
    data.primary_email_address_id ?? data.primaryEmailAddressId
  const primaryEmail = emailAddresses.find(
    (email) => email.id === primaryEmailAddressId
  )

  return (
    primaryEmail?.email_address ??
    primaryEmail?.emailAddress ??
    emailAddresses[0]?.email_address ??
    emailAddresses[0]?.emailAddress ??
    ""
  )
}

function getDisplayName(data: ClerkUserData): string | undefined {
  const name = [
    data.first_name ?? data.firstName,
    data.last_name ?? data.lastName,
  ]
    .filter(Boolean)
    .join(" ")

  return name || data.username || undefined
}

async function syncExternalAccounts(
  ctx: MutationCtx,
  userId: Id<"users">,
  externalAccounts: ClerkExternalAccount[],
  now: number
) {
  for (const account of externalAccounts) {
    const provider = getClerkLinkedProvider(account.provider)
    const providerAccountId =
      account.provider_user_id ??
      account.providerUserId ??
      account.external_account_id ??
      account.externalAccountId ??
      account.id

    if (!provider || !providerAccountId) {
      continue
    }

    const existing = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", provider).eq("providerAccountId", providerAccountId)
      )
      .unique()

    const value = {
      userId,
      provider,
      ...(account.provider !== null && account.provider !== undefined
        ? { externalProvider: account.provider }
        : {}),
      providerAccountId,
      scopes: getExternalAccountScopes(account),
      ...(getExternalAccountUsername(account) !== undefined
        ? { username: getExternalAccountUsername(account) }
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

function getExternalAccountScopes(account: ClerkExternalAccount): string[] {
  const scopes = account.approved_scopes ?? account.approvedScopes

  if (Array.isArray(scopes)) {
    return scopes
  }

  if (typeof scopes === "string") {
    return scopes.split(" ").filter(Boolean)
  }

  return []
}

function getExternalAccountUsername(
  account: ClerkExternalAccount
): string | undefined {
  return (
    account.username ??
    account.email_address ??
    account.emailAddress ??
    undefined
  )
}

function getExternalAccountDisplayName(
  account: ClerkExternalAccount
): string | undefined {
  const name = [
    account.first_name ?? account.firstName,
    account.last_name ?? account.lastName,
  ]
    .filter(Boolean)
    .join(" ")

  return name || getExternalAccountUsername(account)
}

function getExternalAccountAvatarUrl(
  account: ClerkExternalAccount
): string | undefined {
  return (
    account.image_url ??
    account.imageUrl ??
    account.avatar_url ??
    account.avatarUrl ??
    undefined
  )
}
