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
  appFeatureGates: {
    document: {
      createdAt: number;
      enabled: boolean;
      enabledForClerkUserIds?: Array<string>;
      key: "discordRuntimeIncidents" | "cleoDiscordProfileWidgetPublishing";
      updatedAt: number;
      _id: Id<"appFeatureGates">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "enabled"
      | "enabledForClerkUserIds"
      | "key"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_key: ["key", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  cleoPetBattleRecords: {
    document: {
      createdAt: number;
      mode: "unranked" | "ranked" | "event";
      occurredAt: number;
      opponentSnapshot: { level: number; speciesKey: string };
      outcome: "win" | "loss" | "draw";
      petId: Id<"cleoPets">;
      ratingAfter: number;
      ratingBefore: number;
      rewardSnapshot: {
        bondAwarded: number;
        cosmeticKey?: string;
        xpAwarded: number;
      };
      seasonKey: string;
      streakAfter: number;
      userId: Id<"users">;
      _id: Id<"cleoPetBattleRecords">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "mode"
      | "occurredAt"
      | "opponentSnapshot"
      | "opponentSnapshot.level"
      | "opponentSnapshot.speciesKey"
      | "outcome"
      | "petId"
      | "ratingAfter"
      | "ratingBefore"
      | "rewardSnapshot"
      | "rewardSnapshot.bondAwarded"
      | "rewardSnapshot.cosmeticKey"
      | "rewardSnapshot.xpAwarded"
      | "seasonKey"
      | "streakAfter"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_pet_id_and_occurred_at: ["petId", "occurredAt", "_creationTime"];
      by_season_key_and_rating_after: [
        "seasonKey",
        "ratingAfter",
        "_creationTime",
      ];
      by_user_id_and_occurred_at: ["userId", "occurredAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  cleoPetInventories: {
    document: {
      consumableEventEntries: number;
      consumableUnrankedEnergy: number;
      createdAt: number;
      discoveredSpeciesKeys: Array<string>;
      unlockedCosmeticKeys: Array<string>;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"cleoPetInventories">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "consumableEventEntries"
      | "consumableUnrankedEnergy"
      | "createdAt"
      | "discoveredSpeciesKeys"
      | "unlockedCosmeticKeys"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_id: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  cleoPets: {
    document: {
      baseStats: {
        focus: number;
        guard: number;
        power: number;
        speed: number;
        vitality: number;
      };
      battleSummary: {
        bestStreak: number;
        currentStreak: number;
        draws: number;
        losses: number;
        rank:
          | "unranked"
          | "bronze"
          | "silver"
          | "gold"
          | "platinum"
          | "diamond"
          | "master";
        rating: number;
        seasonPoints: number;
        seasonTier:
          | "unranked"
          | "bronze"
          | "silver"
          | "gold"
          | "platinum"
          | "diamond"
          | "master";
        wins: number;
      };
      bond: number;
      derivedStats: {
        focus: number;
        guard: number;
        power: number;
        speed: number;
        vitality: number;
      };
      element:
        "neutral" | "ember" | "tide" | "bloom" | "spark" | "frost" | "shadow";
      equippedCosmeticKeys: Array<string>;
      evolutionStage: "base" | "evolved" | "ascended";
      growthStats: {
        focus: number;
        guard: number;
        power: number;
        speed: number;
        vitality: number;
      };
      level: number;
      mood: number;
      name?: string;
      obtainedAt: number;
      ownerUserId: Id<"users">;
      rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
      speciesKey: string;
      updatedAt: number;
      xp: number;
      _id: Id<"cleoPets">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "baseStats"
      | "baseStats.focus"
      | "baseStats.guard"
      | "baseStats.power"
      | "baseStats.speed"
      | "baseStats.vitality"
      | "battleSummary"
      | "battleSummary.bestStreak"
      | "battleSummary.currentStreak"
      | "battleSummary.draws"
      | "battleSummary.losses"
      | "battleSummary.rank"
      | "battleSummary.rating"
      | "battleSummary.seasonPoints"
      | "battleSummary.seasonTier"
      | "battleSummary.wins"
      | "bond"
      | "derivedStats"
      | "derivedStats.focus"
      | "derivedStats.guard"
      | "derivedStats.power"
      | "derivedStats.speed"
      | "derivedStats.vitality"
      | "element"
      | "equippedCosmeticKeys"
      | "evolutionStage"
      | "growthStats"
      | "growthStats.focus"
      | "growthStats.guard"
      | "growthStats.power"
      | "growthStats.speed"
      | "growthStats.vitality"
      | "level"
      | "mood"
      | "name"
      | "obtainedAt"
      | "ownerUserId"
      | "rarity"
      | "speciesKey"
      | "updatedAt"
      | "xp";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_owner_user_id: ["ownerUserId", "_creationTime"];
      by_owner_user_id_and_obtained_at: [
        "ownerUserId",
        "obtainedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  cleoProfiles: {
    document: {
      activePetId?: Id<"cleoPets">;
      activeTitleKey?: string;
      cardFrameKey?: string;
      cardLayoutKey?: string;
      cardMode: "pet" | "battle" | "trainer" | "season" | "collection";
      cardThemeKey?: string;
      createdAt: number;
      developerForgeSnapshot?: {
        activeRelease?: string;
        blockerCount?: number;
        cachedAt: number;
        currentFocus?: string;
        progressPercent?: number;
        shippedCount?: number;
      };
      publicEnabled: boolean;
      publicSlug?: string;
      showDeveloperBadge: boolean;
      updatedAt: number;
      userId: Id<"users">;
      visibleFields: Array<
        | "display-name"
        | "active-title"
        | "pet-name"
        | "species"
        | "rarity"
        | "element"
        | "level"
        | "mood"
        | "bond"
        | "evolution-stage"
        | "rank"
        | "wins"
        | "losses"
        | "streak"
        | "season-tier"
        | "season-points"
        | "collection-progress"
        | "developer-badge"
        | "developer-active-release"
        | "developer-progress"
        | "developer-current-focus"
        | "developer-shipped-count"
        | "developer-blocker-count"
      >;
      _id: Id<"cleoProfiles">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activePetId"
      | "activeTitleKey"
      | "cardFrameKey"
      | "cardLayoutKey"
      | "cardMode"
      | "cardThemeKey"
      | "createdAt"
      | "developerForgeSnapshot"
      | "developerForgeSnapshot.activeRelease"
      | "developerForgeSnapshot.blockerCount"
      | "developerForgeSnapshot.cachedAt"
      | "developerForgeSnapshot.currentFocus"
      | "developerForgeSnapshot.progressPercent"
      | "developerForgeSnapshot.shippedCount"
      | "publicEnabled"
      | "publicSlug"
      | "showDeveloperBadge"
      | "updatedAt"
      | "userId"
      | "visibleFields";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_public_slug: ["publicSlug", "_creationTime"];
      by_user_id: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  discordBotRuntimeErrors: {
    document: {
      commandName?: string;
      createdAt: number;
      discordGuildId?: string;
      eventName?: string;
      fingerprint: string;
      firstSeenAt: number;
      guildId?: Id<"guilds">;
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
      stack?: string;
      updatedAt: number;
      _id: Id<"discordBotRuntimeErrors">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "commandName"
      | "createdAt"
      | "discordGuildId"
      | "eventName"
      | "fingerprint"
      | "firstSeenAt"
      | "guildId"
      | "lastSeenAt"
      | "message"
      | "metadata"
      | `metadata.${string}`
      | "occurrenceCount"
      | "operation"
      | "serviceArea"
      | "severity"
      | "stack"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_discord_guild_id_and_last_seen_at: [
        "discordGuildId",
        "lastSeenAt",
        "_creationTime",
      ];
      by_fingerprint: ["fingerprint", "_creationTime"];
      by_guild_id_and_last_seen_at: ["guildId", "lastSeenAt", "_creationTime"];
      by_last_seen_at: ["lastSeenAt", "_creationTime"];
      by_service_area_and_last_seen_at: [
        "serviceArea",
        "lastSeenAt",
        "_creationTime",
      ];
      by_severity_and_last_seen_at: ["severity", "lastSeenAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  discordGuildEvents: {
    document: {
      actorDiscordUserId?: string;
      channelId?: string;
      createdAt: number;
      dedupeKey: string;
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
      guildId?: Id<"guilds">;
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
      reason?: string;
      roleId?: string;
      targetDiscordId?: string;
      targetDisplayName?: string;
      targetType: "member" | "user" | "channel" | "role" | "message";
      _id: Id<"discordGuildEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actorDiscordUserId"
      | "channelId"
      | "createdAt"
      | "dedupeKey"
      | "discordGuildId"
      | "eventType"
      | "guildId"
      | "metadata"
      | `metadata.${string}`
      | "occurredAt"
      | "reason"
      | "roleId"
      | "targetDiscordId"
      | "targetDisplayName"
      | "targetType";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_dedupe_key: ["dedupeKey", "_creationTime"];
      by_discord_guild_id_and_occurred_at: [
        "discordGuildId",
        "occurredAt",
        "_creationTime",
      ];
      by_event_type_and_occurred_at: [
        "eventType",
        "occurredAt",
        "_creationTime",
      ];
      by_guild_id_and_occurred_at: ["guildId", "occurredAt", "_creationTime"];
      by_occurred_at: ["occurredAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
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
  discordModerationActions: {
    document: {
      actionType: "ban" | "kick";
      actorDiscordUserId: string;
      createdAt: number;
      discordGuildId: string;
      failureCode?: string;
      guildId?: Id<"guilds">;
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
      operationId: string;
      reason?: string;
      result: "success" | "failed" | "denied";
      targetDiscordUserId: string;
      _id: Id<"discordModerationActions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actionType"
      | "actorDiscordUserId"
      | "createdAt"
      | "discordGuildId"
      | "failureCode"
      | "guildId"
      | "metadata"
      | `metadata.${string}`
      | "occurredAt"
      | "operationId"
      | "reason"
      | "result"
      | "targetDiscordUserId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_action_type_and_occurred_at: [
        "actionType",
        "occurredAt",
        "_creationTime",
      ];
      by_actor_discord_user_id_and_occurred_at: [
        "actorDiscordUserId",
        "occurredAt",
        "_creationTime",
      ];
      by_discord_guild_id_and_occurred_at: [
        "discordGuildId",
        "occurredAt",
        "_creationTime",
      ];
      by_guild_id_and_occurred_at: ["guildId", "occurredAt", "_creationTime"];
      by_occurred_at: ["occurredAt", "_creationTime"];
      by_operation_id: ["operationId", "_creationTime"];
      by_target_discord_user_id_and_occurred_at: [
        "targetDiscordUserId",
        "occurredAt",
        "_creationTime",
      ];
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
      welcomeSubtext?: string;
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
      | "welcomeEnabled"
      | "welcomeSubtext";
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
  guildSupportConfigs: {
    document: {
      createdAt: number;
      enabled: boolean;
      escalationPolicy: "none" | "jcn-product-only";
      guildId: Id<"guilds">;
      staffRoleIds: Array<string>;
      targetId?: string;
      targetType: "channel" | "thread" | "forum";
      transcriptPolicy: "metadata-only" | "explicit-messages";
      updatedAt: number;
      _id: Id<"guildSupportConfigs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "enabled"
      | "escalationPolicy"
      | "guildId"
      | "staffRoleIds"
      | "targetId"
      | "targetType"
      | "transcriptPolicy"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_guild_id: ["guildId", "_creationTime"];
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
  supportTicketMessages: {
    document: {
      authorDiscordUserId: string;
      authorType: "requester";
      body: string;
      createdAt: number;
      ticketId: Id<"supportTickets">;
      _id: Id<"supportTicketMessages">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authorDiscordUserId"
      | "authorType"
      | "body"
      | "createdAt"
      | "ticketId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_ticket_id_and_created_at: ["ticketId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  supportTickets: {
    document: {
      activeKey?: string;
      closedAt?: number;
      createdAt: number;
      discordGuildId?: string;
      escalationPolicy: "none" | "jcn-product-only";
      guildId?: Id<"guilds">;
      lastActivityAt: number;
      lastOpenedAt: number;
      openCount: number;
      requesterDiscordUserId: string;
      requesterUserId?: Id<"users">;
      resolvedAt?: number;
      routingTargetId?: string;
      routingTargetType?: "channel" | "thread" | "forum";
      routingThreadId?: string;
      scope: "jcn" | "guild";
      source: "discord-help";
      status:
        | "open"
        | "waiting-on-requester"
        | "waiting-on-staff"
        | "resolved"
        | "closed";
      transcriptPolicy: "metadata-only" | "explicit-messages";
      updatedAt: number;
      _id: Id<"supportTickets">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activeKey"
      | "closedAt"
      | "createdAt"
      | "discordGuildId"
      | "escalationPolicy"
      | "guildId"
      | "lastActivityAt"
      | "lastOpenedAt"
      | "openCount"
      | "requesterDiscordUserId"
      | "requesterUserId"
      | "resolvedAt"
      | "routingTargetId"
      | "routingTargetType"
      | "routingThreadId"
      | "scope"
      | "source"
      | "status"
      | "transcriptPolicy"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_active_key: ["activeKey", "_creationTime"];
      by_guild_id_and_updated_at: ["guildId", "updatedAt", "_creationTime"];
      by_requester_discord_user_id_and_updated_at: [
        "requesterDiscordUserId",
        "updatedAt",
        "_creationTime",
      ];
      by_scope_and_updated_at: ["scope", "updatedAt", "_creationTime"];
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
      onboardingCompletedAt?: number;
      onboardingProvenance?: "pre-rollout" | "post-rollout";
      onboardingVersion?: number;
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
      | "onboardingCompletedAt"
      | "onboardingProvenance"
      | "onboardingVersion"
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
