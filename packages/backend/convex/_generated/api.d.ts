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
                    | "discordBotTokenUnavailable"
                    | "discordApiUnavailable";
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
                      | "pending"
                      | "bot_joined"
                      | "configured"
                      | "expired";
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
                      | "pending"
                      | "bot_joined"
                      | "configured"
                      | "expired";
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
                    | "guildNotFoundForUser"
                    | "missingManageGuildPermission";
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
                    | "guildNotFoundForUser"
                    | "missingManageGuildPermission";
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
                      | "pending"
                      | "bot_joined"
                      | "configured"
                      | "expired";
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
                      | "pending"
                      | "bot_joined"
                      | "configured"
                      | "expired";
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
                modules: {
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
                        | "discord-bot"
                        | "discord-oauth"
                        | "manual";
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
                        | "discord-bot"
                        | "discord-oauth"
                        | "manual";
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
                  | "discord-bot"
                  | "discord-oauth"
                  | "manual";
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
                  | "discord-bot"
                  | "discord-oauth"
                  | "manual";
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
        guilds: {
          readyReconciliation: {
            listPage: FunctionReference<
              "query",
              "internal",
              {
                paginationOpts: {
                  cursor: string | null;
                  endCursor?: string | null;
                  id?: number;
                  maximumBytesRead?: number;
                  maximumRowsRead?: number;
                  numItems: number;
                };
              },
              {
                continueCursor: string;
                isDone: boolean;
                page: Array<{ botLeftAt?: number; discordGuildId: string }>;
                pageStatus?: "SplitRecommended" | "SplitRequired" | null;
                splitCursor?: string | null;
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
                      | "pending"
                      | "bot_joined"
                      | "configured"
                      | "expired";
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
