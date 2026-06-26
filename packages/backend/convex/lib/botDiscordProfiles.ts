import { v, type Infer } from "convex/values"

export const botDiscordProfileResult = v.union(
  v.object({
    status: v.literal("unlinked"),
  }),
  v.object({
    status: v.literal("linked"),
    account: v.object({
      displayName: v.optional(v.union(v.string(), v.null())),
      role: v.union(
        v.literal("user"),
        v.literal("staff"),
        v.literal("admin"),
        v.literal("superadmin")
      ),
      status: v.union(v.literal("active"), v.literal("disabled")),
    }),
    discordIdentity: v.object({
      username: v.optional(v.string()),
      displayName: v.optional(v.string()),
    }),
  })
)

export type BotDiscordProfileResult = Infer<typeof botDiscordProfileResult>
