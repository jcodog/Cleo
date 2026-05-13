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
    accounts: {
      linked: {
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
  queries: {
    accounts: {
      linked: {
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
              commandPrefix?: string;
              createdAt: number;
              guildId: Id<"guilds">;
              logChannelId?: string;
              loggingEnabled: boolean;
              modLogChannelId?: string;
              moderationEnabled: boolean;
              updatedAt: number;
              welcomeChannelId?: string;
              welcomeEnabled: boolean;
            } | null
          >;
        };
      };
      guildMemberships: {
        manageableForCurrentUser: {
          list: FunctionReference<
            "query",
            "public",
            {},
            Array<{
              _creationTime: number;
              _id: Id<"discordGuildMemberships">;
              canManage: boolean;
              createdAt: number;
              discordUserId: string;
              guildId: Id<"guilds">;
              isOwner?: boolean;
              managementVerificationSource?:
                | "discord-bot"
                | "discord-oauth"
                | "manual";
              managementVerifiedAt?: number;
              updatedAt: number;
              userId?: Id<"users">;
            }>
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
              createdAt: number;
              discordGuildId: string;
              iconUrl?: string;
              name: string;
              ownerDiscordId?: string;
              updatedAt: number;
            } | null
          >;
        };
      };
    };
    users: {
      current: {
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
              managementVerificationSource:
                | "discord-bot"
                | "discord-oauth"
                | "manual";
              managementVerifiedAt: number;
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
              discordGuildId: string;
              iconUrl?: string;
              name: string;
              ownerDiscordId?: string;
            },
            Id<"guilds">
          >;
        };
      };
    };
    logs: {
      errors: {
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
    users: {
      clerk: {
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
};

export declare const components: {};
