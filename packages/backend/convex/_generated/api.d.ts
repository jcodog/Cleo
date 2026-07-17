/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  actions: {
    bot: {
      discord: {
        gateway: {
          guildJoined: {
            sync: FunctionReference<
              "action",
              "public",
              {
                guild: {
                  botJoinedAt?: number;
                  description?: string;
                  discordGuildId: string;
                  iconHash?: string;
                  iconUrl?: string;
                  memberCount?: number;
                  name: string;
                  ownerDiscordId?: string;
                  presenceCount?: number;
                };
                secret: string;
                syncedAt: number;
              },
              null
            >;
          };
          guildLeft: {
            sync: FunctionReference<
              "action",
              "public",
              {
                guild: {
                  discordGuildId: string;
                  leftAt?: number;
                  name?: string;
                };
                secret: string;
              },
              null
            >;
          };
          syncReady: {
            sync: FunctionReference<
              "action",
              "public",
              {
                guilds: Array<{
                  botJoinedAt?: number;
                  description?: string;
                  discordGuildId: string;
                  iconHash?: string;
                  iconUrl?: string;
                  memberCount?: number;
                  name: string;
                  ownerDiscordId?: string;
                  presenceCount?: number;
                }>;
                secret: string;
                shardScope: { shardCount: number; shardIds: Array<number> };
                syncedAt: number;
              },
              null
            >;
          };
        };
        guildConfigs: {
          getRuntimeConfig: {
            fetch: FunctionReference<
              "action",
              "public",
              { discordGuildId: string; secret: string },
              | {
                  config: {
                    announcementChannelId?: string;
                    discordGuildId: string;
                    logChannelId?: string;
                    logLevel?: "none" | "minimal" | "medium" | "maximum";
                    loggingEnabled: boolean;
                    modLogChannelId?: string;
                    moderationEnabled: boolean;
                    supportEnabled: boolean;
                    supportEscalationPolicy?: "none" | "jcn-product-only";
                    supportStaffRoleIds?: Array<string>;
                    supportTargetId?: string;
                    supportTargetType?: "channel" | "thread" | "forum";
                    supportTranscriptPolicy?:
                      "metadata-only" | "explicit-messages";
                    updatesChannelId?: string;
                    welcomeChannelId?: string;
                    welcomeEnabled: boolean;
                    welcomeSubtext?: string;
                  };
                  status: "ready";
                }
              | {
                  reason: "unknownGuild" | "botLeft" | "missingConfig";
                  status: "disabled";
                }
            >;
          };
        };
        guildEvents: {
          record: {
            record: FunctionReference<
              "action",
              "public",
              {
                event: {
                  actorDiscordUserId?: string;
                  channelId?: string;
                  dedupeKey?: string;
                  discordGuildId: string;
                  eventType:
                    | "guildMemberAdd"
                    | "guildMemberRemove"
                    | "guildBanAdd"
                    | "guildBanRemove"
                    | "channelCreate"
                    | "channelDelete"
                    | "roleCreate"
                    | "roleDelete"
                    | "messageDelete";
                  metadata?:
                    | null
                    | boolean
                    | number
                    | string
                    | Array<
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >;
                  occurredAt: number;
                  reason?: string;
                  roleId?: string;
                  targetDiscordId?: string;
                  targetDisplayName?: string;
                  targetType:
                    "member" | "user" | "channel" | "role" | "message";
                };
                secret: string;
              },
              { deduplicated: boolean; id: Id<"discordGuildEvents"> }
            >;
          };
        };
        moderationActions: {
          record: {
            record: FunctionReference<
              "action",
              "public",
              {
                action: {
                  actionType: "ban" | "kick";
                  actorDiscordUserId: string;
                  discordGuildId: string;
                  failureCode?: string;
                  metadata?:
                    | null
                    | boolean
                    | number
                    | string
                    | Array<
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >;
                  occurredAt: number;
                  operationId: string;
                  reason?: string;
                  result: "success" | "failed" | "denied";
                  targetDiscordUserId: string;
                };
                secret: string;
              },
              { deduplicated: boolean; id: Id<"discordModerationActions"> }
            >;
          };
        };
        runtimeErrors: {
          report: {
            report: FunctionReference<
              "action",
              "public",
              {
                commandName?: string;
                discordGuildId?: string;
                eventName?: string;
                fingerprint?: string;
                guildId?: Id<"guilds">;
                message: string;
                metadata?:
                  | null
                  | boolean
                  | number
                  | string
                  | Array<
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >
                  | Record<
                      string,
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >;
                occurredAt?: number;
                operation?: string;
                secret: string;
                serviceArea:
                  | "startup"
                  | "gateway"
                  | "command"
                  | "configuration"
                  | "permission"
                  | "backend"
                  | "transport"
                  | "welcome"
                  | "moderation"
                  | "logging"
                  | "unknown";
                severity: "info" | "warn" | "error" | "critical";
                stack?: string;
              },
              {
                deduplicated: boolean;
                id: Id<"discordBotRuntimeErrors">;
                occurrenceCount: number;
              }
            >;
          };
        };
        supportTickets: {
          openOrResume: {
            openOrResume: FunctionReference<
              "action",
              "public",
              {
                input: {
                  discordGuildId?: string;
                  message?: string;
                  requesterDiscordUserId: string;
                };
                secret: string;
              },
              | {
                  reason:
                    "notConfigured" | "disabled" | "unknownGuild" | "botLeft";
                  status: "guildSupportUnavailable";
                }
              | {
                  messageStored: boolean;
                  route?: {
                    staffRoleIds: Array<string>;
                    targetId: string;
                    targetType: "channel" | "thread" | "forum";
                    threadId?: string;
                  };
                  scope: "jcn" | "guild";
                  status: "opened" | "resumed";
                  submittedMessage?: string;
                  ticketId: Id<"supportTickets">;
                }
            >;
          };
          setRoutingThread: {
            set: FunctionReference<
              "action",
              "public",
              {
                secret: string;
                threadId: string;
                ticketId: Id<"supportTickets">;
              },
              null
            >;
          };
        };
      };
    };
    dashboard: {
      account: {
        syncDiscordIdentity: {
          sync: FunctionReference<
            "action",
            "public",
            {},
            | { status: "ready" }
            | { status: "missingDiscordIdentity" }
            | {
                reason: "clerkSecretUnavailable" | "clerkUserUnavailable";
                status: "unavailable";
              }
          >;
        };
        syncLinkedAccounts: {
          sync: FunctionReference<
            "action",
            "public",
            {},
            | {
                linkedAccounts: Array<{
                  _creationTime: number;
                  _id: Id<"linkedAccounts">;
                  accessTokenSecretId?: string;
                  avatarUrl?: string;
                  createdAt: number;
                  displayName?: string;
                  expiresAt?: number;
                  externalProvider?: string;
                  provider: "discord" | "kick" | "twitch" | "github";
                  providerAccountId: string;
                  refreshTokenSecretId?: string;
                  scopes: Array<string>;
                  updatedAt: number;
                  userId: Id<"users">;
                  username?: string;
                }>;
                status: "ready";
              }
            | {
                reason: "clerkSecretUnavailable" | "clerkUserUnavailable";
                status: "unavailable";
              }
          >;
        };
      };
      discord: {
        guilds: {
          configOptions: {
            get: FunctionReference<
              "action",
              "public",
              { discordGuildId: string },
              | { status: "notFound" }
              | { status: "forbidden" }
              | { status: "botLeft" }
              | { status: "unavailable" }
              | {
                  channels: Array<{
                    id: string;
                    name: string;
                    type: "text" | "announcement" | "thread" | "forum";
                  }>;
                  roles: Array<{ id: string; name: string }>;
                  status: "ready";
                }
            >;
          };
          syncAuditLogs: {
            sync: FunctionReference<
              "action",
              "public",
              { discordGuildId: string; force?: boolean; limit?: number },
              | { status: "notFound" }
              | { status: "forbidden" }
              | { discordGuildId: string; status: "pendingBotSync" }
              | {
                  discordGuildId: string;
                  reason:
                    "discordBotTokenUnavailable" | "discordApiUnavailable";
                  status: "auditLogSyncUnavailable";
                }
              | {
                  discordGuildId: string;
                  inserted: number;
                  lastSyncedAt: number;
                  newestDiscordAuditLogId?: string;
                  skipped: number;
                  status: "ready";
                }
            >;
          };
          syncDashboardGuilds: {
            sync: FunctionReference<
              "action",
              "public",
              {},
              | { status: "missingDiscordIdentity" }
              | {
                  guilds: Array<{
                    dashboardHref?: string;
                    discordGuildId: string;
                    iconHash?: string;
                    iconUrl?: string;
                    installSessionExpiresAt?: number;
                    installSessionId?: Id<"discordGuildInstallSessions">;
                    installSessionStatus?:
                      "pending" | "bot_joined" | "configured" | "expired";
                    isOwner?: boolean;
                    memberCount?: number;
                    name: string;
                    permissions?: string;
                    presenceCount?: number;
                    state:
                      | "installed"
                      | "installable"
                      | "pending"
                      | "verificationNeeded"
                      | "unavailable"
                      | "forbidden";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable"
                      | "discordBotTokenUnavailable"
                      | "discordApiUnavailable"
                      | "discordRestDeniedAccess";
                  }>;
                  reason:
                    | "clerkSecretUnavailable"
                    | "discordAccessTokenUnavailable"
                    | "discordTokenResolutionUnavailable"
                    | "discordGuildScopeUnavailable"
                    | "discordApiUnavailable"
                    | "discordBotTokenUnavailable"
                    | "discordRestDeniedAccess";
                  status: "discordGuildDiscoveryUnavailable";
                }
              | {
                  guilds: Array<{
                    dashboardHref?: string;
                    discordGuildId: string;
                    iconHash?: string;
                    iconUrl?: string;
                    installSessionExpiresAt?: number;
                    installSessionId?: Id<"discordGuildInstallSessions">;
                    installSessionStatus?:
                      "pending" | "bot_joined" | "configured" | "expired";
                    isOwner?: boolean;
                    memberCount?: number;
                    name: string;
                    permissions?: string;
                    presenceCount?: number;
                    state:
                      | "installed"
                      | "installable"
                      | "pending"
                      | "verificationNeeded"
                      | "unavailable"
                      | "forbidden";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable"
                      | "discordBotTokenUnavailable"
                      | "discordApiUnavailable"
                      | "discordRestDeniedAccess";
                  }>;
                  status: "ready";
                }
            >;
          };
          verifyInstalled: {
            verify: FunctionReference<
              "action",
              "public",
              { discordGuildId: string },
              | { status: "missingDiscordIdentity" }
              | {
                  discordGuildId: string;
                  reason:
                    | "clerkSecretUnavailable"
                    | "discordAccessTokenUnavailable"
                    | "discordTokenResolutionUnavailable"
                    | "discordGuildScopeUnavailable"
                    | "discordApiUnavailable"
                    | "discordBotTokenUnavailable"
                    | "discordRestDeniedAccess";
                  status: "userGuildDiscoveryUnavailable";
                }
              | {
                  discordGuildId: string;
                  reason:
                    "guildNotFoundForUser" | "missingManageGuildPermission";
                  status: "forbidden";
                }
              | {
                  discordGuildId: string;
                  reason:
                    | "discordBotTokenUnavailable"
                    | "discordApiUnavailable"
                    | "discordRestDeniedAccess";
                  status: "botVerificationUnavailable";
                }
              | { discordGuildId: string; status: "notInstalled" }
              | {
                  discordGuildId: string;
                  status: "installed";
                  targetPath: string;
                }
            >;
          };
        };
        install: {
          completeServerInstall: {
            complete: FunctionReference<
              "action",
              "public",
              { installSessionId: Id<"discordGuildInstallSessions"> },
              | { status: "missingDiscordIdentity" }
              | { status: "notFound" }
              | { status: "forbidden" }
              | { discordGuildId: string; status: "pendingBotSync" }
              | { discordGuildId: string; status: "notInstalled" }
              | {
                  discordGuildId: string;
                  reason:
                    | "clerkSecretUnavailable"
                    | "discordAccessTokenUnavailable"
                    | "discordTokenResolutionUnavailable"
                    | "discordGuildScopeUnavailable"
                    | "discordApiUnavailable"
                    | "discordBotTokenUnavailable"
                    | "discordRestDeniedAccess";
                  status: "userGuildDiscoveryUnavailable";
                }
              | {
                  discordGuildId: string;
                  reason:
                    | "discordBotTokenUnavailable"
                    | "discordApiUnavailable"
                    | "discordRestDeniedAccess";
                  status: "botVerificationUnavailable";
                }
              | {
                  discordGuildId: string;
                  status: "completed";
                  targetPath: string;
                }
            >;
          };
          createServerInstall: {
            create: FunctionReference<
              "action",
              "public",
              { discordGuildId: string },
              | { status: "missingDiscordIdentity" }
              | {
                  discordGuildId: string;
                  status: "alreadyInstalled";
                  targetPath: string;
                }
              | {
                  reason:
                    | "clerkSecretUnavailable"
                    | "discordAccessTokenUnavailable"
                    | "discordTokenResolutionUnavailable"
                    | "discordGuildScopeUnavailable"
                    | "discordApiUnavailable"
                    | "discordBotTokenUnavailable"
                    | "discordRestDeniedAccess";
                  status: "verificationUnavailable";
                }
              | {
                  reason:
                    "guildNotFoundForUser" | "missingManageGuildPermission";
                  status: "forbidden";
                }
              | {
                  reason: "discordApplicationIdMissing";
                  status: "configUnavailable";
                }
              | {
                  discordGuildId: string;
                  expiresAt: number;
                  installSessionId: Id<"discordGuildInstallSessions">;
                  installUrl: string;
                  status: "created";
                }
            >;
          };
          getPendingChannels: {
            get: FunctionReference<
              "action",
              "public",
              {
                discordGuildId?: string;
                installSessionId?: Id<"discordGuildInstallSessions">;
              },
              | { status: "missingDiscordIdentity" }
              | { status: "notFound" }
              | { status: "forbidden" }
              | { discordGuildId: string; status: "pendingBotSync" }
              | { discordGuildId: string; status: "notInstalled" }
              | {
                  discordGuildId: string;
                  reason:
                    | "clerkSecretUnavailable"
                    | "discordAccessTokenUnavailable"
                    | "discordTokenResolutionUnavailable"
                    | "discordGuildScopeUnavailable"
                    | "discordApiUnavailable"
                    | "discordBotTokenUnavailable"
                    | "discordRestDeniedAccess";
                  status: "userGuildDiscoveryUnavailable";
                }
              | {
                  discordGuildId: string;
                  reason:
                    | "discordBotTokenUnavailable"
                    | "discordApiUnavailable"
                    | "discordRestDeniedAccess";
                  status: "channelDiscoveryUnavailable";
                }
              | {
                  channels: Array<{
                    discordChannelId: string;
                    name: string;
                    position?: number;
                    type: "text" | "announcement";
                  }>;
                  discordGuildId: string;
                  status: "ready";
                }
            >;
          };
          listInstallableGuilds: {
            list: FunctionReference<
              "action",
              "public",
              {},
              | { status: "missingDiscordIdentity" }
              | {
                  guilds: Array<{
                    dashboardHref?: string;
                    discordGuildId: string;
                    iconHash?: string;
                    iconUrl?: string;
                    installSessionExpiresAt?: number;
                    installSessionId?: Id<"discordGuildInstallSessions">;
                    installSessionStatus?:
                      "pending" | "bot_joined" | "configured" | "expired";
                    isOwner?: boolean;
                    memberCount?: number;
                    name: string;
                    permissions?: string;
                    presenceCount?: number;
                    state:
                      | "installed"
                      | "installable"
                      | "pending"
                      | "verificationNeeded"
                      | "unavailable"
                      | "forbidden";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable"
                      | "discordBotTokenUnavailable"
                      | "discordApiUnavailable"
                      | "discordRestDeniedAccess";
                  }>;
                  reason:
                    | "clerkSecretUnavailable"
                    | "discordAccessTokenUnavailable"
                    | "discordTokenResolutionUnavailable"
                    | "discordGuildScopeUnavailable"
                    | "discordApiUnavailable"
                    | "discordBotTokenUnavailable"
                    | "discordRestDeniedAccess";
                  status: "discordGuildDiscoveryUnavailable";
                }
              | {
                  guilds: Array<{
                    dashboardHref?: string;
                    discordGuildId: string;
                    iconHash?: string;
                    iconUrl?: string;
                    installSessionExpiresAt?: number;
                    installSessionId?: Id<"discordGuildInstallSessions">;
                    installSessionStatus?:
                      "pending" | "bot_joined" | "configured" | "expired";
                    isOwner?: boolean;
                    memberCount?: number;
                    name: string;
                    permissions?: string;
                    presenceCount?: number;
                    state:
                      | "installed"
                      | "installable"
                      | "pending"
                      | "verificationNeeded"
                      | "unavailable"
                      | "forbidden";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable"
                      | "discordBotTokenUnavailable"
                      | "discordApiUnavailable"
                      | "discordRestDeniedAccess";
                  }>;
                  status: "ready";
                }
            >;
          };
        };
      };
    };
  };
  mutations: {
    dashboard: {
      account: {
        linkedAccounts: {
          upsert: {
            upsertForCurrentUser: FunctionReference<
              "mutation",
              "public",
              {
                accessTokenSecretId?: string;
                avatarUrl?: string;
                displayName?: string;
                expiresAt?: number;
                externalProvider?: string;
                provider: "discord" | "kick" | "twitch" | "github";
                providerAccountId: string;
                refreshTokenSecretId?: string;
                scopes: Array<string>;
                username?: string;
              },
              Id<"linkedAccounts">
            >;
          };
        };
        onboarding: {
          complete: FunctionReference<
            "mutation",
            "public",
            {},
            { onboardingCompletedAt: number; onboardingVersion: number }
          >;
        };
      };
      discord: {
        guildConfigs: {
          updateChannels: {
            update: FunctionReference<
              "mutation",
              "public",
              {
                channels: {
                  announcementChannelId?: string | null;
                  logChannelId?: string | null;
                  modLogChannelId?: string | null;
                  updatesChannelId?: string | null;
                  welcomeChannelId?: string | null;
                };
                discordGuildId: string;
              },
              {
                _creationTime: number;
                _id: Id<"guildConfigs">;
                aiEnabled: boolean;
                announcementChannelId?: string;
                commandPrefix?: string;
                createdAt: number;
                guildId: Id<"guilds">;
                logChannelId?: string;
                logLevel?: "none" | "minimal" | "medium" | "maximum";
                loggingEnabled: boolean;
                modLogChannelId?: string;
                moderationEnabled: boolean;
                updatedAt: number;
                updatesChannelId?: string;
                welcomeChannelId?: string;
                welcomeEnabled: boolean;
                welcomeSubtext?: string;
              }
            >;
          };
          updateModules: {
            update: FunctionReference<
              "mutation",
              "public",
              {
                discordGuildId: string;
                modules: {
                  aiEnabled?: boolean;
                  loggingEnabled?: boolean;
                  moderationEnabled?: boolean;
                  welcomeEnabled?: boolean;
                };
              },
              {
                _creationTime: number;
                _id: Id<"guildConfigs">;
                aiEnabled: boolean;
                announcementChannelId?: string;
                commandPrefix?: string;
                createdAt: number;
                guildId: Id<"guilds">;
                logChannelId?: string;
                logLevel?: "none" | "minimal" | "medium" | "maximum";
                loggingEnabled: boolean;
                modLogChannelId?: string;
                moderationEnabled: boolean;
                updatedAt: number;
                updatesChannelId?: string;
                welcomeChannelId?: string;
                welcomeEnabled: boolean;
                welcomeSubtext?: string;
              }
            >;
          };
          updateWorkspaceSection: {
            update: FunctionReference<
              "mutation",
              "public",
              {
                channels: {
                  announcementChannelId?: string | null;
                  logChannelId?: string | null;
                  modLogChannelId?: string | null;
                  updatesChannelId?: string | null;
                  welcomeChannelId?: string | null;
                };
                discordGuildId: string;
                logging?: { level: "none" | "minimal" | "medium" | "maximum" };
                modules: {
                  loggingEnabled?: boolean;
                  moderationEnabled?: boolean;
                  welcomeEnabled?: boolean;
                };
                welcome?: { subtext?: string | null };
              },
              {
                _creationTime: number;
                _id: Id<"guildConfigs">;
                aiEnabled: boolean;
                announcementChannelId?: string;
                commandPrefix?: string;
                createdAt: number;
                guildId: Id<"guilds">;
                logChannelId?: string;
                logLevel?: "none" | "minimal" | "medium" | "maximum";
                loggingEnabled: boolean;
                modLogChannelId?: string;
                moderationEnabled: boolean;
                updatedAt: number;
                updatesChannelId?: string;
                welcomeChannelId?: string;
                welcomeEnabled: boolean;
                welcomeSubtext?: string;
              }
            >;
          };
        };
        guilds: {
          markOpened: {
            markOpened: FunctionReference<
              "mutation",
              "public",
              { guildId: Id<"guilds"> },
              null
            >;
          };
        };
        guildSupportConfigs: {
          update: {
            update: FunctionReference<
              "mutation",
              "public",
              {
                discordGuildId: string;
                enabled: boolean;
                escalationPolicy: "none" | "jcn-product-only";
                staffRoleIds: Array<string>;
                targetId?: string | null;
                targetType: "channel" | "thread" | "forum";
                transcriptPolicy: "metadata-only" | "explicit-messages";
              },
              {
                enabled: boolean;
                escalationPolicy: "none" | "jcn-product-only";
                staffRoleIds: Array<string>;
                supportConfigId: Id<"guildSupportConfigs">;
                targetId?: string;
                targetType: "channel" | "thread" | "forum";
                transcriptPolicy: "metadata-only" | "explicit-messages";
                updatedAt: number;
              }
            >;
          };
        };
      };
    };
  };
  queries: {
    dashboard: {
      account: {
        currentUser: {
          get: FunctionReference<
            "query",
            "public",
            {},
            {
              _creationTime: number;
              _id: Id<"users">;
              clerkUserId: string;
              createdAt: number;
              displayName?: string | null;
              email: string;
              imageUrl?: string | null;
              onboardingCompletedAt?: number;
              onboardingVersion?: number;
              role: "user" | "staff" | "admin" | "superadmin";
              status?: "active" | "disabled";
              updatedAt: number;
            } | null
          >;
        };
        discordIdentity: {
          get: FunctionReference<
            "query",
            "public",
            {},
            {
              _creationTime: number;
              _id: Id<"linkedAccounts">;
              accessTokenSecretId?: string;
              avatarUrl?: string;
              createdAt: number;
              displayName?: string;
              expiresAt?: number;
              externalProvider?: string;
              provider: "discord" | "kick" | "twitch" | "github";
              providerAccountId: string;
              refreshTokenSecretId?: string;
              scopes: Array<string>;
              updatedAt: number;
              userId: Id<"users">;
              username?: string;
            } | null
          >;
        };
        linkedAccounts: {
          listForCurrentUser: FunctionReference<
            "query",
            "public",
            {},
            Array<{
              _creationTime: number;
              _id: Id<"linkedAccounts">;
              accessTokenSecretId?: string;
              avatarUrl?: string;
              createdAt: number;
              displayName?: string;
              expiresAt?: number;
              externalProvider?: string;
              provider: "discord" | "kick" | "twitch" | "github";
              providerAccountId: string;
              refreshTokenSecretId?: string;
              scopes: Array<string>;
              updatedAt: number;
              userId: Id<"users">;
              username?: string;
            }>
          >;
        };
        onboarding: {
          get: FunctionReference<
            "query",
            "public",
            {},
            | { status: "accountSyncPending" }
            | {
                account: {
                  displayName: string | null;
                  imageUrl: string | null;
                  onboardingCompletedAt: number | null;
                  onboardingVersion: number | null;
                };
                discordIdentity: {
                  avatarUrl: string | null;
                  displayName: string | null;
                  username: string | null;
                } | null;
                status: "ready";
              }
          >;
        };
      };
      discord: {
        guildConfigs: {
          byGuildId: {
            get: FunctionReference<
              "query",
              "public",
              { guildId: Id<"guilds"> },
              {
                _creationTime: number;
                _id: Id<"guildConfigs">;
                aiEnabled: boolean;
                announcementChannelId?: string;
                commandPrefix?: string;
                createdAt: number;
                guildId: Id<"guilds">;
                logChannelId?: string;
                logLevel?: "none" | "minimal" | "medium" | "maximum";
                loggingEnabled: boolean;
                modLogChannelId?: string;
                moderationEnabled: boolean;
                updatedAt: number;
                updatesChannelId?: string;
                welcomeChannelId?: string;
                welcomeEnabled: boolean;
                welcomeSubtext?: string;
              } | null
            >;
          };
        };
        guilds: {
          auditEvents: {
            list: FunctionReference<
              "query",
              "public",
              {
                discordGuildId: string;
                source?: "dashboard" | "discord-audit-log" | "bot-action";
              },
              | { status: "notFound" }
              | { status: "forbidden" }
              | {
                  events: Array<{
                    actorDiscordUserId?: string;
                    actorDisplayName?: string;
                    auditEventId: Id<"guildAuditEvents">;
                    details: Array<string>;
                    eventType: string;
                    externalId?: string;
                    occurredAt: number;
                    source: "dashboard" | "discord-audit-log" | "bot-action";
                    summary: string;
                    targetDiscordId?: string;
                    targetType?: string;
                  }>;
                  status: "ready";
                  syncState: {
                    lastSyncError?: string;
                    lastSyncStatus:
                      | "ready"
                      | "pendingBotSync"
                      | "discordBotTokenUnavailable"
                      | "discordApiUnavailable";
                    lastSyncedAt?: number;
                    newestDiscordAuditLogId?: string;
                    newestOccurredAt?: number;
                    syncStateId: Id<"guildAuditLogSyncStates">;
                    updatedAt: number;
                  } | null;
                }
            >;
          };
          byDiscordId: {
            get: FunctionReference<
              "query",
              "public",
              { discordGuildId: string },
              {
                _creationTime: number;
                _id: Id<"guilds">;
                botInstallationVerifiedAt?: number;
                botJoinedAt?: number;
                botLeftAt?: number;
                createdAt: number;
                description?: string;
                discordGuildId: string;
                iconHash?: string;
                iconUrl?: string;
                lastOpenedAt?: number;
                lastSyncedAt?: number;
                memberCount?: number;
                name: string;
                ownerDiscordId?: string;
                presenceCount?: number;
                readyShardCount?: number;
                readyShardId?: number;
                readyShardKey?: string;
                updatedAt: number;
              } | null
            >;
          };
          manageable: {
            list: FunctionReference<
              "query",
              "public",
              {},
              Array<{
                botInstallationVerifiedAt?: number;
                botJoinedAt?: number;
                description?: string;
                discordGuildId: string;
                guildId: Id<"guilds">;
                iconHash?: string;
                iconUrl?: string;
                isOwner?: boolean;
                lastOpenedAt?: number;
                lastSyncedAt?: number;
                memberCount?: number;
                name: string;
                permissions?: string;
                presenceCount?: number;
              }>
            >;
          };
          moderationActions: {
            list: FunctionReference<
              "query",
              "public",
              { discordGuildId: string },
              | { status: "notFound" }
              | { status: "forbidden" }
              | {
                  actions: Array<{
                    actionType: "ban" | "kick";
                    actorDiscordUserId: string;
                    failureCode?: string;
                    moderationActionId: Id<"discordModerationActions">;
                    occurredAt: number;
                    reason?: string;
                    result: "success" | "failed" | "denied";
                    targetDiscordUserId: string;
                  }>;
                  status: "ready";
                }
            >;
          };
          overview: {
            get: FunctionReference<
              "query",
              "public",
              { discordGuildId: string },
              | { status: "notFound" }
              | { status: "forbidden" }
              | {
                  overview: {
                    botInstallationVerifiedAt?: number;
                    botJoinedAt?: number;
                    botLeftAt?: number;
                    description?: string;
                    discordGuildId: string;
                    guildConfig: {
                      aiEnabled: boolean;
                      announcementChannelId?: string;
                      commandPrefix?: string;
                      guildConfigId: Id<"guildConfigs">;
                      guildId: Id<"guilds">;
                      logChannelId?: string;
                      logLevel?: "none" | "minimal" | "medium" | "maximum";
                      loggingEnabled: boolean;
                      modLogChannelId?: string;
                      moderationEnabled: boolean;
                      updatedAt: number;
                      updatesChannelId?: string;
                      welcomeChannelId?: string;
                      welcomeEnabled: boolean;
                      welcomeSubtext?: string;
                    } | null;
                    guildId: Id<"guilds">;
                    iconHash?: string;
                    iconUrl?: string;
                    lastOpenedAt?: number;
                    lastSyncedAt?: number;
                    memberCount?: number;
                    membership: {
                      canManage: boolean;
                      discordUserId: string;
                      guildId: Id<"guilds">;
                      isOwner?: boolean;
                      lastSyncedAt?: number;
                      managementVerificationSource?:
                        "discord-bot" | "discord-oauth" | "manual";
                      managementVerifiedAt?: number;
                      membershipId: Id<"discordGuildMemberships">;
                      permissions?: string;
                      userId?: Id<"users">;
                    };
                    name: string;
                    presenceCount?: number;
                  };
                  status: "botLeft";
                }
              | {
                  overview: {
                    botInstallationVerifiedAt?: number;
                    botJoinedAt?: number;
                    botLeftAt?: number;
                    description?: string;
                    discordGuildId: string;
                    guildConfig: {
                      aiEnabled: boolean;
                      announcementChannelId?: string;
                      commandPrefix?: string;
                      guildConfigId: Id<"guildConfigs">;
                      guildId: Id<"guilds">;
                      logChannelId?: string;
                      logLevel?: "none" | "minimal" | "medium" | "maximum";
                      loggingEnabled: boolean;
                      modLogChannelId?: string;
                      moderationEnabled: boolean;
                      updatedAt: number;
                      updatesChannelId?: string;
                      welcomeChannelId?: string;
                      welcomeEnabled: boolean;
                      welcomeSubtext?: string;
                    } | null;
                    guildId: Id<"guilds">;
                    iconHash?: string;
                    iconUrl?: string;
                    lastOpenedAt?: number;
                    lastSyncedAt?: number;
                    memberCount?: number;
                    membership: {
                      canManage: boolean;
                      discordUserId: string;
                      guildId: Id<"guilds">;
                      isOwner?: boolean;
                      lastSyncedAt?: number;
                      managementVerificationSource?:
                        "discord-bot" | "discord-oauth" | "manual";
                      managementVerifiedAt?: number;
                      membershipId: Id<"discordGuildMemberships">;
                      permissions?: string;
                      userId?: Id<"users">;
                    };
                    name: string;
                    presenceCount?: number;
                  };
                  status: "ready";
                }
            >;
          };
          support: {
            get: FunctionReference<
              "query",
              "public",
              { discordGuildId: string },
              | { status: "notFound" }
              | { status: "forbidden" }
              | {
                  config: null | {
                    enabled: boolean;
                    escalationPolicy: "none" | "jcn-product-only";
                    staffRoleIds: Array<string>;
                    supportConfigId: Id<"guildSupportConfigs">;
                    targetId?: string;
                    targetType: "channel" | "thread" | "forum";
                    transcriptPolicy: "metadata-only" | "explicit-messages";
                    updatedAt: number;
                  };
                  status: "ready";
                  tickets: Array<{
                    createdAt: number;
                    escalationPolicy: "none" | "jcn-product-only";
                    lastActivityAt: number;
                    latestMessage?: string;
                    openCount: number;
                    requesterDiscordUserId: string;
                    status:
                      | "open"
                      | "waiting-on-requester"
                      | "waiting-on-staff"
                      | "resolved"
                      | "closed";
                    ticketId: Id<"supportTickets">;
                    transcriptPolicy: "metadata-only" | "explicit-messages";
                  }>;
                }
            >;
          };
          systemLogs: {
            list: FunctionReference<
              "query",
              "public",
              { discordGuildId: string },
              | { status: "notFound" }
              | { status: "forbidden" }
              | {
                  logs: Array<{
                    createdAt: number;
                    level: "debug" | "info" | "warn" | "error";
                    logId: Id<"errorLogs">;
                    message: string;
                    source:
                      | "dashboard"
                      | "discord-bot"
                      | "kick-bot"
                      | "ws-relay"
                      | "backend";
                  }>;
                  status: "ready";
                }
            >;
          };
        };
        runtimeIncidents: {
          access: {
            get: FunctionReference<
              "query",
              "public",
              {},
              | { status: "forbidden" }
              | { status: "disabled" }
              | { status: "ready" }
            >;
          };
          list: {
            list: FunctionReference<
              "query",
              "public",
              {
                discordGuildId?: string;
                guildId?: Id<"guilds">;
                lastSeenAtFrom?: number;
                lastSeenAtTo?: number;
                limit?: number;
                serviceArea?:
                  | "startup"
                  | "gateway"
                  | "command"
                  | "configuration"
                  | "permission"
                  | "backend"
                  | "transport"
                  | "welcome"
                  | "moderation"
                  | "logging"
                  | "unknown";
                severity?: "info" | "warn" | "error" | "critical";
              },
              | { status: "forbidden" }
              | { status: "disabled" }
              | {
                  incidents: Array<{
                    commandName?: string;
                    discordGuildId?: string;
                    eventName?: string;
                    fingerprint: string;
                    firstSeenAt: number;
                    guildId?: Id<"guilds">;
                    id: Id<"discordBotRuntimeErrors">;
                    lastSeenAt: number;
                    message: string;
                    metadata?:
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                        >;
                    occurrenceCount: number;
                    operation?: string;
                    serviceArea:
                      | "startup"
                      | "gateway"
                      | "command"
                      | "configuration"
                      | "permission"
                      | "backend"
                      | "transport"
                      | "welcome"
                      | "moderation"
                      | "logging"
                      | "unknown";
                    severity: "info" | "warn" | "error" | "critical";
                  }>;
                  status: "ready";
                }
            >;
          };
        };
      };
      staff: {
        access: {
          get: FunctionReference<
            "query",
            "public",
            {},
            { status: "forbidden" | "ready" }
          >;
        };
      };
      supportTickets: {
        listJcn: {
          list: FunctionReference<
            "query",
            "public",
            {},
            | { status: "forbidden" }
            | {
                status: "ready";
                tickets: Array<{
                  createdAt: number;
                  escalationPolicy: "none" | "jcn-product-only";
                  lastActivityAt: number;
                  latestMessage?: string;
                  openCount: number;
                  requesterDiscordUserId: string;
                  status:
                    | "open"
                    | "waiting-on-requester"
                    | "waiting-on-staff"
                    | "resolved"
                    | "closed";
                  ticketId: Id<"supportTickets">;
                }>;
              }
          >;
        };
      };
    };
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  mutations: {
    bot: {
      discord: {
        guildConfigs: {
          ensure: {
            forGuild: FunctionReference<
              "mutation",
              "internal",
              { guildId: Id<"guilds"> },
              Id<"guildConfigs">
            >;
          };
        };
        guildEvents: {
          record: {
            record: FunctionReference<
              "mutation",
              "internal",
              {
                event: {
                  actorDiscordUserId?: string;
                  channelId?: string;
                  dedupeKey?: string;
                  discordGuildId: string;
                  eventType:
                    | "guildMemberAdd"
                    | "guildMemberRemove"
                    | "guildBanAdd"
                    | "guildBanRemove"
                    | "channelCreate"
                    | "channelDelete"
                    | "roleCreate"
                    | "roleDelete"
                    | "messageDelete";
                  metadata?:
                    | null
                    | boolean
                    | number
                    | string
                    | Array<
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >;
                  occurredAt: number;
                  reason?: string;
                  roleId?: string;
                  targetDiscordId?: string;
                  targetDisplayName?: string;
                  targetType:
                    "member" | "user" | "channel" | "role" | "message";
                };
              },
              { deduplicated: boolean; id: Id<"discordGuildEvents"> }
            >;
          };
        };
        guildMemberships: {
          upsertVerified: {
            upsert: FunctionReference<
              "mutation",
              "internal",
              {
                canManage: boolean;
                discordUserId: string;
                guildId: Id<"guilds">;
                isOwner?: boolean;
                lastSyncedAt?: number;
                managementVerificationSource:
                  "discord-bot" | "discord-oauth" | "manual";
                managementVerifiedAt: number;
                permissions?: string;
                userId?: Id<"users">;
              },
              Id<"discordGuildMemberships">
            >;
          };
        };
        guilds: {
          markBotLeft: {
            mark: FunctionReference<
              "mutation",
              "internal",
              { discordGuildId: string; leftAt?: number; name?: string },
              null
            >;
          };
          markBotLeftBatch: {
            mark: FunctionReference<
              "mutation",
              "internal",
              { discordGuildIds: Array<string>; leftAt: number },
              { markedLeft: number; requested: number; skipped: number }
            >;
            markAbsentForReadyScopePage: FunctionReference<
              "mutation",
              "internal",
              {
                leftAt: number;
                paginationOpts: {
                  cursor: string | null;
                  endCursor?: string | null;
                  id?: number;
                  maximumBytesRead?: number;
                  maximumRowsRead?: number;
                  numItems: number;
                };
                shardCount: number;
                shardIds: Array<number>;
              },
              {
                continueCursor: string;
                isDone: boolean;
                markedLeft: number;
                scanned: number;
                skipped: number;
              }
            >;
            markAbsentForReadyShardPage: FunctionReference<
              "mutation",
              "internal",
              {
                leftAt: number;
                paginationOpts: {
                  cursor: string | null;
                  endCursor?: string | null;
                  id?: number;
                  maximumBytesRead?: number;
                  maximumRowsRead?: number;
                  numItems: number;
                };
                readyShardKey: string;
              },
              {
                continueCursor: string;
                isDone: boolean;
                markedLeft: number;
                scanned: number;
                skipped: number;
              }
            >;
          };
          syncReadyBatch: {
            sync: FunctionReference<
              "mutation",
              "internal",
              {
                guilds: Array<{
                  botJoinedAt?: number;
                  description?: string;
                  discordGuildId: string;
                  iconHash?: string;
                  iconUrl?: string;
                  memberCount?: number;
                  name: string;
                  ownerDiscordId?: string;
                  presenceCount?: number;
                  readyShardCount: number;
                  readyShardId: number;
                  readyShardKey: string;
                }>;
                lastSyncedAt: number;
              },
              {
                insertedConfigs: number;
                insertedGuilds: number;
                patchedGuilds: number;
                processed: number;
                skippedStaleGuilds: number;
                skippedUnchangedGuilds: number;
              }
            >;
          };
          upsertFromGateway: {
            upsert: FunctionReference<
              "mutation",
              "internal",
              {
                botJoinedAt?: number;
                description?: string;
                discordGuildId: string;
                iconHash?: string;
                iconUrl?: string;
                lastSyncedAt: number;
                memberCount?: number;
                name: string;
                ownerDiscordId?: string;
                presenceCount?: number;
              },
              Id<"guilds">
            >;
          };
        };
        moderationActions: {
          record: {
            record: FunctionReference<
              "mutation",
              "internal",
              {
                action: {
                  actionType: "ban" | "kick";
                  actorDiscordUserId: string;
                  discordGuildId: string;
                  failureCode?: string;
                  metadata?:
                    | null
                    | boolean
                    | number
                    | string
                    | Array<
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                                | Record<
                                    string,
                                    | null
                                    | boolean
                                    | number
                                    | string
                                    | Array<null | boolean | number | string>
                                    | Record<
                                        string,
                                        null | boolean | number | string
                                      >
                                  >
                              >
                          >
                      >;
                  occurredAt: number;
                  operationId: string;
                  reason?: string;
                  result: "success" | "failed" | "denied";
                  targetDiscordUserId: string;
                };
              },
              { deduplicated: boolean; id: Id<"discordModerationActions"> }
            >;
          };
        };
        runtimeErrors: {
          record: {
            record: FunctionReference<
              "mutation",
              "internal",
              {
                commandName?: string;
                discordGuildId?: string;
                eventName?: string;
                fingerprint?: string;
                guildId?: Id<"guilds">;
                message: string;
                metadata?:
                  | null
                  | boolean
                  | number
                  | string
                  | Array<
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >
                  | Record<
                      string,
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >;
                occurredAt?: number;
                operation?: string;
                serviceArea:
                  | "startup"
                  | "gateway"
                  | "command"
                  | "configuration"
                  | "permission"
                  | "backend"
                  | "transport"
                  | "welcome"
                  | "moderation"
                  | "logging"
                  | "unknown";
                severity: "info" | "warn" | "error" | "critical";
                stack?: string;
              },
              {
                deduplicated: boolean;
                id: Id<"discordBotRuntimeErrors">;
                occurrenceCount: number;
              }
            >;
          };
        };
        supportTickets: {
          openOrResume: {
            openOrResume: FunctionReference<
              "mutation",
              "internal",
              {
                discordGuildId?: string;
                message?: string;
                requesterDiscordUserId: string;
              },
              | {
                  reason:
                    "notConfigured" | "disabled" | "unknownGuild" | "botLeft";
                  status: "guildSupportUnavailable";
                }
              | {
                  messageStored: boolean;
                  route?: {
                    staffRoleIds: Array<string>;
                    targetId: string;
                    targetType: "channel" | "thread" | "forum";
                    threadId?: string;
                  };
                  scope: "jcn" | "guild";
                  status: "opened" | "resumed";
                  submittedMessage?: string;
                  ticketId: Id<"supportTickets">;
                }
            >;
          };
          setRoutingThread: {
            set: FunctionReference<
              "mutation",
              "internal",
              { threadId: string; ticketId: Id<"supportTickets"> },
              null
            >;
          };
        };
      };
    };
    dashboard: {
      discord: {
        guildAuditEvents: {
          upsertDiscordAuditLogs: {
            createBotAction: FunctionReference<
              "mutation",
              "internal",
              {
                actorDiscordUserId?: string;
                actorDisplayName?: string;
                eventType: string;
                externalId?: string;
                guildId: Id<"guilds">;
                metadata?:
                  | null
                  | boolean
                  | number
                  | string
                  | Array<
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >
                  | Record<
                      string,
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >;
                occurredAt?: number;
                summary: string;
                targetDiscordId?: string;
                targetType?: string;
              },
              Id<"guildAuditEvents">
            >;
            createDashboardAction: FunctionReference<
              "mutation",
              "internal",
              {
                eventType: string;
                guildId: Id<"guilds">;
                metadata?:
                  | null
                  | boolean
                  | number
                  | string
                  | Array<
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >
                  | Record<
                      string,
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<null | boolean | number | string>
                                  | Record<
                                      string,
                                      null | boolean | number | string
                                    >
                                >
                            >
                        >
                    >;
                occurredAt?: number;
                summary: string;
                userId?: Id<"users">;
              },
              Id<"guildAuditEvents">
            >;
            upsertMany: FunctionReference<
              "mutation",
              "internal",
              {
                entries: Array<{
                  actionType: number;
                  actorDiscordUserId?: string;
                  actorDisplayName?: string;
                  changes?: Array<
                    Record<
                      string,
                      | null
                      | boolean
                      | number
                      | string
                      | Array<
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                        >
                      | Record<
                          string,
                          | null
                          | boolean
                          | number
                          | string
                          | Array<
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                          | Record<
                              string,
                              | null
                              | boolean
                              | number
                              | string
                              | Array<
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                              | Record<
                                  string,
                                  | null
                                  | boolean
                                  | number
                                  | string
                                  | Array<
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                  | Record<
                                      string,
                                      | null
                                      | boolean
                                      | number
                                      | string
                                      | Array<null | boolean | number | string>
                                      | Record<
                                          string,
                                          null | boolean | number | string
                                        >
                                    >
                                >
                            >
                        >
                    >
                  >;
                  discordAuditLogId: string;
                  occurredAt: number;
                  options?: Record<
                    string,
                    | null
                    | boolean
                    | number
                    | string
                    | Array<null | boolean | number | string>
                    | Record<string, null | boolean | number | string>
                  >;
                  reason?: string;
                  summary: string;
                  targetDiscordId?: string;
                }>;
                guildId: Id<"guilds">;
              },
              { inserted: number; skipped: number }
            >;
          };
        };
        guildAuditLogSyncStates: {
          upsert: {
            upsert: FunctionReference<
              "mutation",
              "internal",
              {
                guildId: Id<"guilds">;
                lastSyncError?: string;
                lastSyncedAt?: number;
                newestDiscordAuditLogId?: string;
                newestOccurredAt?: number;
                status:
                  | "ready"
                  | "pendingBotSync"
                  | "discordBotTokenUnavailable"
                  | "discordApiUnavailable";
              },
              null
            >;
          };
        };
        guilds: {
          markBotMissing: {
            mark: FunctionReference<
              "mutation",
              "internal",
              { discordGuildId: string; verifiedAt: number },
              null
            >;
          };
          upsertRestVerified: {
            upsert: FunctionReference<
              "mutation",
              "internal",
              {
                botInstallationVerifiedAt: number;
                canManage: boolean;
                description?: string;
                discordGuildId: string;
                discordUserId: string;
                iconHash?: string;
                iconUrl?: string;
                isOwner?: boolean;
                lastSyncedAt: number;
                managementVerificationSource:
                  "discord-bot" | "discord-oauth" | "manual";
                managementVerifiedAt: number;
                memberCount?: number;
                name: string;
                ownerDiscordId?: string;
                permissions?: string;
                presenceCount?: number;
                userId: Id<"users">;
              },
              {
                _creationTime: number;
                _id: Id<"guilds">;
                botInstallationVerifiedAt?: number;
                botJoinedAt?: number;
                botLeftAt?: number;
                createdAt: number;
                description?: string;
                discordGuildId: string;
                iconHash?: string;
                iconUrl?: string;
                lastOpenedAt?: number;
                lastSyncedAt?: number;
                memberCount?: number;
                name: string;
                ownerDiscordId?: string;
                presenceCount?: number;
                readyShardCount?: number;
                readyShardId?: number;
                readyShardKey?: string;
                updatedAt: number;
              }
            >;
          };
        };
        installSessions: {
          upsert: {
            configured: FunctionReference<
              "mutation",
              "internal",
              { installSessionId: Id<"discordGuildInstallSessions"> },
              {
                _creationTime: number;
                _id: Id<"discordGuildInstallSessions">;
                completedAt?: number;
                createdAt: number;
                discordGuildId: string;
                discordUserId: string;
                expiresAt: number;
                oauthState?: string;
                selectedUpdatesChannelId?: string;
                status: "pending" | "bot_joined" | "configured" | "expired";
                updatedAt: number;
                userId: Id<"users">;
              }
            >;
            pending: FunctionReference<
              "mutation",
              "internal",
              {
                discordGuildId: string;
                discordUserId: string;
                expiresAt: number;
                oauthState: string;
                userId: Id<"users">;
              },
              {
                _creationTime: number;
                _id: Id<"discordGuildInstallSessions">;
                completedAt?: number;
                createdAt: number;
                discordGuildId: string;
                discordUserId: string;
                expiresAt: number;
                oauthState?: string;
                selectedUpdatesChannelId?: string;
                status: "pending" | "bot_joined" | "configured" | "expired";
                updatedAt: number;
                userId: Id<"users">;
              }
            >;
          };
        };
      };
    };
    integrations: {
      clerk: {
        users: {
          deleteFromWebhook: FunctionReference<
            "mutation",
            "internal",
            { clerkUserId: string },
            null
          >;
          upsertFromWebhook: FunctionReference<
            "mutation",
            "internal",
            {
              data: {
                emailAddresses?: Array<{
                  emailAddress?: string;
                  email_address?: string;
                  id?: string;
                }>;
                email_addresses?: Array<{
                  emailAddress?: string;
                  email_address?: string;
                  id?: string;
                }>;
                externalAccounts?: Array<{
                  approvedScopes?: string | Array<string> | null;
                  approved_scopes?: string | Array<string> | null;
                  avatarUrl?: string | null;
                  avatar_url?: string | null;
                  emailAddress?: string | null;
                  email_address?: string | null;
                  externalAccountId?: string | null;
                  external_account_id?: string | null;
                  firstName?: string | null;
                  first_name?: string | null;
                  id?: string | null;
                  imageUrl?: string | null;
                  image_url?: string | null;
                  lastName?: string | null;
                  last_name?: string | null;
                  provider?: string | null;
                  providerUserId?: string | null;
                  provider_user_id?: string | null;
                  username?: string | null;
                }>;
                external_accounts?: Array<{
                  approvedScopes?: string | Array<string> | null;
                  approved_scopes?: string | Array<string> | null;
                  avatarUrl?: string | null;
                  avatar_url?: string | null;
                  emailAddress?: string | null;
                  email_address?: string | null;
                  externalAccountId?: string | null;
                  external_account_id?: string | null;
                  firstName?: string | null;
                  first_name?: string | null;
                  id?: string | null;
                  imageUrl?: string | null;
                  image_url?: string | null;
                  lastName?: string | null;
                  last_name?: string | null;
                  provider?: string | null;
                  providerUserId?: string | null;
                  provider_user_id?: string | null;
                  username?: string | null;
                }>;
                firstName?: string | null;
                first_name?: string | null;
                id: string;
                imageUrl?: string | null;
                image_url?: string | null;
                lastName?: string | null;
                last_name?: string | null;
                primaryEmailAddressId?: string | null;
                primary_email_address_id?: string | null;
                username?: string | null;
              };
            },
            Id<"users">
          >;
        };
      };
    };
    system: {
      logs: {
        create: {
          create: FunctionReference<
            "mutation",
            "internal",
            {
              level: "debug" | "info" | "warn" | "error";
              message: string;
              metadata?:
                | null
                | boolean
                | number
                | string
                | Array<
                    | null
                    | boolean
                    | number
                    | string
                    | Array<
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                      >
                  >
                | Record<
                    string,
                    | null
                    | boolean
                    | number
                    | string
                    | Array<
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                        | Record<
                            string,
                            | null
                            | boolean
                            | number
                            | string
                            | Array<
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                            | Record<
                                string,
                                | null
                                | boolean
                                | number
                                | string
                                | Array<null | boolean | number | string>
                                | Record<
                                    string,
                                    null | boolean | number | string
                                  >
                              >
                          >
                      >
                  >;
              source:
                | "dashboard"
                | "discord-bot"
                | "kick-bot"
                | "ws-relay"
                | "backend";
              stack?: string;
            },
            Id<"errorLogs">
          >;
        };
      };
    };
  };
  queries: {
    bot: {
      discord: {
        guildConfigs: {
          runtimeConfigByDiscordId: {
            get: FunctionReference<
              "query",
              "internal",
              { discordGuildId: string },
              | {
                  config: {
                    announcementChannelId?: string;
                    discordGuildId: string;
                    logChannelId?: string;
                    logLevel?: "none" | "minimal" | "medium" | "maximum";
                    loggingEnabled: boolean;
                    modLogChannelId?: string;
                    moderationEnabled: boolean;
                    supportEnabled: boolean;
                    supportEscalationPolicy?: "none" | "jcn-product-only";
                    supportStaffRoleIds?: Array<string>;
                    supportTargetId?: string;
                    supportTargetType?: "channel" | "thread" | "forum";
                    supportTranscriptPolicy?:
                      "metadata-only" | "explicit-messages";
                    updatesChannelId?: string;
                    welcomeChannelId?: string;
                    welcomeEnabled: boolean;
                    welcomeSubtext?: string;
                  };
                  status: "ready";
                }
              | {
                  reason: "unknownGuild" | "botLeft" | "missingConfig";
                  status: "disabled";
                }
            >;
          };
        };
      };
    };
    dashboard: {
      discord: {
        guilds: {
          accessContext: {
            getManagedGuildContext: FunctionReference<
              "query",
              "internal",
              { discordGuildId: string },
              | { status: "missingUser" }
              | { status: "notFound" }
              | { status: "forbidden" }
              | {
                  guild: {
                    _creationTime: number;
                    _id: Id<"guilds">;
                    botInstallationVerifiedAt?: number;
                    botJoinedAt?: number;
                    botLeftAt?: number;
                    createdAt: number;
                    description?: string;
                    discordGuildId: string;
                    iconHash?: string;
                    iconUrl?: string;
                    lastOpenedAt?: number;
                    lastSyncedAt?: number;
                    memberCount?: number;
                    name: string;
                    ownerDiscordId?: string;
                    presenceCount?: number;
                    readyShardCount?: number;
                    readyShardId?: number;
                    readyShardKey?: string;
                    updatedAt: number;
                  };
                  status: "ready";
                }
            >;
          };
          auditSyncState: {
            getByGuildId: FunctionReference<
              "query",
              "internal",
              { guildId: Id<"guilds"> },
              {
                lastSyncedAt?: number;
                newestDiscordAuditLogId?: string;
                newestOccurredAt?: number;
              } | null
            >;
          };
        };
        install: {
          context: {
            getCreateServerInstallContext: FunctionReference<
              "query",
              "internal",
              { discordGuildId: string },
              | { status: "missingUser" }
              | { status: "missingDiscordIdentity" }
              | { discordGuildId: string; status: "alreadyInstalled" }
              | { status: "verificationUnavailable" }
              | {
                  discordAccount: {
                    _creationTime: number;
                    _id: Id<"linkedAccounts">;
                    accessTokenSecretId?: string;
                    avatarUrl?: string;
                    createdAt: number;
                    displayName?: string;
                    expiresAt?: number;
                    externalProvider?: string;
                    provider: "discord" | "kick" | "twitch" | "github";
                    providerAccountId: string;
                    refreshTokenSecretId?: string;
                    scopes: Array<string>;
                    updatedAt: number;
                    userId: Id<"users">;
                    username?: string;
                  };
                  discordGuildId: string;
                  status: "ready";
                  user: {
                    _creationTime: number;
                    _id: Id<"users">;
                    clerkUserId: string;
                    createdAt: number;
                    displayName?: string | null;
                    email: string;
                    imageUrl?: string | null;
                    onboardingCompletedAt?: number;
                    onboardingVersion?: number;
                    role: "user" | "staff" | "admin" | "superadmin";
                    status?: "active" | "disabled";
                    updatedAt: number;
                  };
                }
            >;
            getInstallableGuildsContext: FunctionReference<
              "query",
              "internal",
              {},
              | { status: "missingUser" }
              | {
                  discordAccount: {
                    _creationTime: number;
                    _id: Id<"linkedAccounts">;
                    accessTokenSecretId?: string;
                    avatarUrl?: string;
                    createdAt: number;
                    displayName?: string;
                    expiresAt?: number;
                    externalProvider?: string;
                    provider: "discord" | "kick" | "twitch" | "github";
                    providerAccountId: string;
                    refreshTokenSecretId?: string;
                    scopes: Array<string>;
                    updatedAt: number;
                    userId: Id<"users">;
                    username?: string;
                  } | null;
                  guilds: Array<{
                    dashboardHref?: string;
                    discordGuildId: string;
                    iconHash?: string;
                    iconUrl?: string;
                    installSessionExpiresAt?: number;
                    installSessionId?: Id<"discordGuildInstallSessions">;
                    installSessionStatus?:
                      "pending" | "bot_joined" | "configured" | "expired";
                    isOwner?: boolean;
                    memberCount?: number;
                    name: string;
                    permissions?: string;
                    presenceCount?: number;
                    state:
                      | "installed"
                      | "installable"
                      | "pending"
                      | "verificationNeeded"
                      | "unavailable"
                      | "forbidden";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable"
                      | "discordBotTokenUnavailable"
                      | "discordApiUnavailable"
                      | "discordRestDeniedAccess";
                  }>;
                  installSessions: Array<{
                    _creationTime: number;
                    _id: Id<"discordGuildInstallSessions">;
                    completedAt?: number;
                    createdAt: number;
                    discordGuildId: string;
                    discordUserId: string;
                    expiresAt: number;
                    oauthState?: string;
                    selectedUpdatesChannelId?: string;
                    status: "pending" | "bot_joined" | "configured" | "expired";
                    updatedAt: number;
                    userId: Id<"users">;
                  }>;
                  status: "ready";
                  user: {
                    _creationTime: number;
                    _id: Id<"users">;
                    clerkUserId: string;
                    createdAt: number;
                    displayName?: string | null;
                    email: string;
                    imageUrl?: string | null;
                    onboardingCompletedAt?: number;
                    onboardingVersion?: number;
                    role: "user" | "staff" | "admin" | "superadmin";
                    status?: "active" | "disabled";
                    updatedAt: number;
                  };
                }
            >;
            getInstallSessionContext: FunctionReference<
              "query",
              "internal",
              {
                discordGuildId?: string;
                installSessionId?: Id<"discordGuildInstallSessions">;
              },
              | { status: "missingUser" }
              | { status: "missingDiscordIdentity" }
              | { status: "notFound" }
              | { status: "forbidden" }
              | {
                  discordAccount: {
                    _creationTime: number;
                    _id: Id<"linkedAccounts">;
                    accessTokenSecretId?: string;
                    avatarUrl?: string;
                    createdAt: number;
                    displayName?: string;
                    expiresAt?: number;
                    externalProvider?: string;
                    provider: "discord" | "kick" | "twitch" | "github";
                    providerAccountId: string;
                    refreshTokenSecretId?: string;
                    scopes: Array<string>;
                    updatedAt: number;
                    userId: Id<"users">;
                    username?: string;
                  };
                  guild: {
                    _creationTime: number;
                    _id: Id<"guilds">;
                    botInstallationVerifiedAt?: number;
                    botJoinedAt?: number;
                    botLeftAt?: number;
                    discordGuildId: string;
                    name: string;
                  } | null;
                  session: {
                    _creationTime: number;
                    _id: Id<"discordGuildInstallSessions">;
                    completedAt?: number;
                    createdAt: number;
                    discordGuildId: string;
                    discordUserId: string;
                    expiresAt: number;
                    oauthState?: string;
                    selectedUpdatesChannelId?: string;
                    status: "pending" | "bot_joined" | "configured" | "expired";
                    updatedAt: number;
                    userId: Id<"users">;
                  };
                  status: "ready";
                  user: {
                    _creationTime: number;
                    _id: Id<"users">;
                    clerkUserId: string;
                    createdAt: number;
                    displayName?: string | null;
                    email: string;
                    imageUrl?: string | null;
                    onboardingCompletedAt?: number;
                    onboardingVersion?: number;
                    role: "user" | "staff" | "admin" | "superadmin";
                    status?: "active" | "disabled";
                    updatedAt: number;
                  };
                }
            >;
          };
        };
      };
    };
  };
};

export declare const components: {};
