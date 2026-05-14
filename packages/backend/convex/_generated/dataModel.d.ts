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
      level: "debug" | "info" | "warn" | "error";
      message: string;
      metadata?: any;
      source: "dashboard" | "discord-bot" | "kick-bot" | "ws-relay" | "backend";
      stack?: string;
      _id: Id<"errorLogs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "level"
      | "message"
      | "metadata"
      | "source"
      | "stack";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_level_and_created_at: ["level", "createdAt", "_creationTime"];
      by_source_and_created_at: ["source", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  guildConfigs: {
    document: {
      aiEnabled: boolean;
      announcementsChannelId?: string;
      commandPrefix?: string;
      createdAt: number;
      guildId: Id<"guilds">;
      logChannelId?: string;
      logLevel?: "none" | "minimal" | "medium" | "maximum";
      loggingEnabled: boolean;
      modLogChannelId?: string;
      moderationEnabled: boolean;
      updateChannelId?: string;
      updatedAt: number;
      welcomeChannelId?: string;
      welcomeEnabled: boolean;
      _id: Id<"guildConfigs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aiEnabled"
      | "announcementsChannelId"
      | "commandPrefix"
      | "createdAt"
      | "guildId"
      | "logChannelId"
      | "loggingEnabled"
      | "logLevel"
      | "moderationEnabled"
      | "modLogChannelId"
      | "updateChannelId"
      | "updatedAt"
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
      _id: Id<"guilds">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
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
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_discord_guild_id: ["discordGuildId", "_creationTime"];
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
      displayName?: string;
      email: string;
      imageUrl?: string;
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
