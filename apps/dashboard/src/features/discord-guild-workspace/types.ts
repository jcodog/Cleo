import { api } from "@workspace/backend/convex/_generated/api.js"
import type { FunctionReturnType } from "convex/server"

type GuildOverviewResult = FunctionReturnType<
  typeof api.queries.dashboard.discord.guilds.overview.get
>
type GuildLogsResult = FunctionReturnType<
  typeof api.queries.dashboard.discord.guilds.systemLogs.list
>
type GuildAuditEventsResult = FunctionReturnType<
  typeof api.queries.dashboard.discord.guilds.auditEvents.list
>

export type GuildOverview = Extract<
  GuildOverviewResult,
  { status: "ready" | "botLeft" }
>["overview"]
export type GuildConfig = NonNullable<GuildOverview["guildConfig"]>
export type GuildLog = Extract<
  GuildLogsResult,
  { status: "ready" }
>["logs"][number]
export type GuildAuditEvent = Extract<
  GuildAuditEventsResult,
  { status: "ready" }
>["events"][number]
export type SaveState = "idle" | "saving" | "success" | "error"
