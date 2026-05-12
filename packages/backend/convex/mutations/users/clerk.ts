import { ConvexError, v, type Validator } from "convex/values"
import type { Id } from "../../_generated/dataModel"
import { internalMutation } from "../../_generated/server"

type ClerkEmailAddress = {
  id: string
  email_address: string
}

type ClerkUserData = {
  id: string
  primary_email_address_id?: string | null
  email_addresses?: ClerkEmailAddress[]
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

      return existing._id
    }

    return await ctx.db.insert("users", {
      clerkUserId: data.id,
      email,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      role: "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
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
