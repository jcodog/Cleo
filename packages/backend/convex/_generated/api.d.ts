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
};

export declare const components: {};
