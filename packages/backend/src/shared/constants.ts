export const USER_ROLES = ["user", "staff", "admin"] as const

export const LINKED_PROVIDERS = ["discord", "kick", "twitch", "github"] as const

export const APP_SOURCES = [
  "web",
  "discord-bot",
  "kick-bot",
  "ws-relay",
  "backend",
] as const

export const PLANS = ["free", "pro", "team", "enterprise"] as const

export const ENTITLEMENT_SOURCES = [
  "stripe",
  "manual",
  "promo",
  "internal",
] as const

export const ENTITLEMENT_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "cancelled",
  "expired",
] as const

export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const

export type UserRole = (typeof USER_ROLES)[number]
export type LinkedProvider = (typeof LINKED_PROVIDERS)[number]
export type AppSource = (typeof APP_SOURCES)[number]
export type Plan = (typeof PLANS)[number]
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number]
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number]
export type LogLevel = (typeof LOG_LEVELS)[number]
