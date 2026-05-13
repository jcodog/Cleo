export const USER_ROLES = ["user", "staff", "admin", "superadmin"] as const

export const STAFF_ROLES = ["staff", "admin", "superadmin"] as const

export const ADMIN_ROLES = ["admin", "superadmin"] as const

export const USER_STATUSES = ["active", "disabled"] as const

export const APP_SOURCES = [
  "dashboard",
  "discord-bot",
  "kick-bot",
  "ws-relay",
  "backend",
] as const

export const PLANS = ["free", "pro", "team", "enterprise"] as const

export const ENTITLEMENT_SOURCES = [
  "stripe",
  "discord",
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

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const

export type UserRole = (typeof USER_ROLES)[number]
export type StaffRole = (typeof STAFF_ROLES)[number]
export type AdminRole = (typeof ADMIN_ROLES)[number]
export type UserStatus = (typeof USER_STATUSES)[number]
export type AppSource = (typeof APP_SOURCES)[number]
export type Plan = (typeof PLANS)[number]
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number]
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number]
export type LogLevel = (typeof LOG_LEVELS)[number]
