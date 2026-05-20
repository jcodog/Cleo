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
    dashboard: {
      discord: {
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
                  reason: "discordGuildDiscoveryUnavailable";
                  status: "verificationUnavailable";
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
              | {
                  discordGuildId: string;
                  reason:
                    | "discordBotTokenUnavailable"
                    | "discordApiUnavailable";
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
                      | "unavailable";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable";
                  }>;
                  reason:
                    | "discordAccessTokenUnavailable"
                    | "discordTokenResolutionUnavailable";
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
                      | "unavailable";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable";
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
              displayName?: string;
              email: string;
              imageUrl?: string;
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
          byDiscordId: {
            get: FunctionReference<
              "query",
              "public",
              { discordGuildId: string },
              {
                _creationTime: number;
                _id: Id<"guilds">;
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
                lastSyncedAt?: number;
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
            { data: any },
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
              metadata?: any;
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
    dashboard: {
      discord: {
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
                    displayName?: string;
                    email: string;
                    imageUrl?: string;
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
                      | "unavailable";
                    unavailableReason?:
                      | "missingManageGuildPermission"
                      | "botLeft"
                      | "botSyncUnavailable"
                      | "verificationUnavailable";
                  }>;
                  status: "ready";
                  user: {
                    _creationTime: number;
                    _id: Id<"users">;
                    clerkUserId: string;
                    createdAt: number;
                    displayName?: string;
                    email: string;
                    imageUrl?: string;
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
                    displayName?: string;
                    email: string;
                    imageUrl?: string;
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
