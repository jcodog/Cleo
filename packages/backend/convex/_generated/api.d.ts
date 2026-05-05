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
          any
        >;
      };
    };
    users: {
      auth: {
        upsertFromAuth: FunctionReference<
          "mutation",
          "public",
          { displayName?: string; email?: string; imageUrl?: string },
          any
        >;
      };
    };
  };
  queries: {
    accounts: {
      linked: {
        listForCurrentUser: FunctionReference<"query", "public", {}, any>;
      };
    };
    discord: {
      guildConfigs: {
        byGuildId: {
          get: FunctionReference<
            "query",
            "public",
            { guildId: Id<"guilds"> },
            any
          >;
        };
      };
      guilds: {
        byDiscordId: {
          get: FunctionReference<
            "query",
            "public",
            { discordGuildId: string },
            any
          >;
        };
      };
    };
    users: {
      current: {
        get: FunctionReference<"query", "public", {}, any>;
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
            any
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
            any
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
            level: "debug" | "info" | "warn" | "error" | "fatal";
            message: string;
            metadata?: any;
            source: "web" | "discord-bot" | "kick-bot" | "ws-relay" | "backend";
            stack?: string;
          },
          any
        >;
      };
    };
  };
};

export declare const components: {};
