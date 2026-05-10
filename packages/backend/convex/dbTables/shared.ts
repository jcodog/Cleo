import { v } from "convex/values"

export const userRole = v.union(
  v.literal("user"),
  v.literal("staff"),
  v.literal("admin"),
  v.literal("superadmin")
)

export const userStatus = v.union(v.literal("active"), v.literal("disabled"))

export const linkedProvider = v.union(
  v.literal("discord"),
  v.literal("kick"),
  v.literal("twitch"),
  v.literal("github")
)

export const appSource = v.union(
  v.literal("dashboard"),
  v.literal("discord-bot"),
  v.literal("kick-bot"),
  v.literal("ws-relay"),
  v.literal("backend")
)

export const logLevel = v.union(
  v.literal("debug"),
  v.literal("info"),
  v.literal("warn"),
  v.literal("error")
)

export const discordVerificationSource = v.union(
  v.literal("discord-bot"),
  v.literal("discord-oauth"),
  v.literal("manual")
)

export const plan = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("team"),
  v.literal("enterprise")
)

export const entitlementSource = v.union(
  v.literal("stripe"),
  v.literal("discord"),
  v.literal("manual"),
  v.literal("promo"),
  v.literal("internal")
)

export const entitlementStatus = v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("past_due"),
  v.literal("cancelled"),
  v.literal("expired")
)
