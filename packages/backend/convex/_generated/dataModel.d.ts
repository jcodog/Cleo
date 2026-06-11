/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  discordGuildInstallSessions: {
    document: {
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
      _id: Id<"discordGuildInstallSessions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "createdAt"
      | "discordGuildId"
      | "discordUserId"
      | "expiresAt"
      | "oauthState"
      | "selectedUpdatesChannelId"
      | "status"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_discord_guild_id: ["discordGuildId", "_creationTime"];
      by_discord_user_id_and_status: [
        "discordUserId",
        "status",
        "_creationTime",
      ];
      by_guild_user_discord_user_status_expires_at: [
        "discordGuildId",
        "userId",
        "discordUserId",
        "status",
        "expiresAt",
        "_creationTime",
      ];
      by_user_id_and_status: ["userId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  discordGuildMemberships: {
    document: {
      canManage: boolean;
      createdAt: number;
      discordUserId: string;
      guildId: Id<"guilds">;
      isOwner?: boolean;
      lastSyncedAt?: number;
      managementVerificationSource?: "discord-bot" | "discord-oauth" | "manual";
      managementVerifiedAt?: number;
      permissions?: string;
      revokedAt?: number;
      updatedAt: number;
      userId?: Id<"users">;
      _id: Id<"discordGuildMemberships">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "canManage"
      | "createdAt"
      | "discordUserId"
      | "guildId"
      | "isOwner"
      | "lastSyncedAt"
      | "managementVerificationSource"
      | "managementVerifiedAt"
      | "permissions"
      | "revokedAt"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_discord_user_id: ["discordUserId", "_creationTime"];
      by_guild_id: ["guildId", "_creationTime"];
      by_guild_id_and_discord_user_id: [
        "guildId",
        "discordUserId",
        "_creationTime",
      ];
      by_user_id: ["userId", "_creationTime"];
      by_user_id_and_guild_id: ["userId", "guildId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  errorLogs: {
    document: {
      createdAt: number;
      discordGuildId?: string;
      guildId?: string;
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
                      >
                  >
              >
          >;
      source: "dashboard" | "discord-bot" | "kick-bot" | "ws-relay" | "backend";
      stack?: string;
      _id: Id<"errorLogs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "discordGuildId"
      | "guildId"
      | "level"
      | "message"
      | "metadata"
      | `metadata.${string}`
      | "source"
      | "stack";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_level_and_created_at: ["level", "createdAt", "_creationTime"];
      by_source_and_created_at: ["source", "createdAt", "_creationTime"];
      by_source_and_discord_guild_id_and_created_at: [
        "source",
        "discordGuildId",
        "createdAt",
        "_creationTime",
      ];
      by_source_and_guild_id_and_created_at: [
        "source",
        "guildId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  guildAuditEvents: {
    document: {
      actorDiscordUserId?: string;
      actorDisplayName?: string;
      actorUserId?: Id<"users">;
      createdAt: number;
      discordGuildId: string;
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
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
                        | Record<string, null | boolean | number | string>
                      >
                    | Record<
                        string,
                        | null
                        | boolean
                        | number
                        | string
                        | Array<null | boolean | number | string>
                        | Record<string, null | boolean | number | string>
                      >
                  >
              >
          >;
      occurredAt: number;
      source: "dashboard" | "discord-audit-log" | "bot-action";
      summary: string;
      targetDiscordId?: string;
      targetType?: string;
      _id: Id<"guildAuditEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actorDiscordUserId"
      | "actorDisplayName"
      | "actorUserId"
      | "createdAt"
      | "discordGuildId"
      | "eventType"
      | "externalId"
      | "guildId"
      | "metadata"
      | `metadata.${string}`
      | "occurredAt"
      | "source"
      | "summary"
      | "targetDiscordId"
      | "targetType";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_guild_id_and_external_id: ["guildId", "externalId", "_creationTime"];
      by_guild_id_and_occurred_at: ["guildId", "occurredAt", "_creationTime"];
      by_guild_id_and_source_and_occurred_at: [
        "guildId",
        "source",
        "occurredAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  guildAuditLogSyncStates: {
    document: {
      createdAt: number;
      discordGuildId: string;
      guildId: Id<"guilds">;
      lastSyncError?: string;
      lastSyncStatus:
        | "ready"
        | "pendingBotSync"
        | "discordBotTokenUnavailable"
        | "discordApiUnavailable";
      lastSyncedAt?: number;
      newestDiscordAuditLogId?: string;
      newestOccurredAt?: number;
      updatedAt: number;
      _id: Id<"guildAuditLogSyncStates">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "discordGuildId"
      | "guildId"
      | "lastSyncedAt"
      | "lastSyncError"
      | "lastSyncStatus"
      | "newestDiscordAuditLogId"
      | "newestOccurredAt"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_discord_guild_id: ["discordGuildId", "_creationTime"];
      by_guild_id: ["guildId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  guildConfigs: {
    document: {
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
      _id: Id<"guildConfigs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aiEnabled"
      | "announcementChannelId"
      | "commandPrefix"
      | "createdAt"
      | "guildId"
      | "logChannelId"
      | "loggingEnabled"
      | "logLevel"
      | "moderationEnabled"
      | "modLogChannelId"
      | "updatedAt"
      | "updatesChannelId"
      | "welcomeChannelId"
      | "welcomeEnabled";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_guild_id: ["guildId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  guilds: {
    document: {
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
      _id: Id<"guilds">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "botInstallationVerifiedAt"
      | "botJoinedAt"
      | "botLeftAt"
      | "createdAt"
      | "description"
      | "discordGuildId"
      | "iconHash"
      | "iconUrl"
      | "lastOpenedAt"
      | "lastSyncedAt"
      | "memberCount"
      | "name"
      | "ownerDiscordId"
      | "presenceCount"
      | "readyShardCount"
      | "readyShardId"
      | "readyShardKey"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_discord_guild_id: ["discordGuildId", "_creationTime"];
      by_ready_shard_key: ["readyShardKey", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  linkedAccounts: {
    document: {
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
      _id: Id<"linkedAccounts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accessTokenSecretId"
      | "avatarUrl"
      | "createdAt"
      | "displayName"
      | "expiresAt"
      | "externalProvider"
      | "provider"
      | "providerAccountId"
      | "refreshTokenSecretId"
      | "scopes"
      | "updatedAt"
      | "userId"
      | "username";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_provider_and_provider_account_id: [
        "provider",
        "providerAccountId",
        "_creationTime",
      ];
      by_user_id: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      clerkUserId: string;
      createdAt: number;
      displayName?: string | null;
      email: string;
      imageUrl?: string | null;
      role: "user" | "staff" | "admin" | "superadmin";
      status?: "active" | "disabled";
      updatedAt: number;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "clerkUserId"
      | "createdAt"
      | "displayName"
      | "email"
      | "imageUrl"
      | "role"
      | "status"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_clerk_user_id: ["clerkUserId", "_creationTime"];
      by_email: ["email", "_creationTime"];
      by_role: ["role", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
