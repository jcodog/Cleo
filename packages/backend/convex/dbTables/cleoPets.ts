import { defineTable } from "convex/server"
import { v } from "convex/values"

const cleoPetRarity = v.union(
  v.literal("common"),
  v.literal("uncommon"),
  v.literal("rare"),
  v.literal("epic"),
  v.literal("legendary")
)

const cleoPetElement = v.union(
  v.literal("neutral"),
  v.literal("ember"),
  v.literal("tide"),
  v.literal("bloom"),
  v.literal("spark"),
  v.literal("frost"),
  v.literal("shadow")
)

const cleoPetEvolutionStage = v.union(
  v.literal("base"),
  v.literal("evolved"),
  v.literal("ascended")
)

const cleoPetRank = v.union(
  v.literal("unranked"),
  v.literal("bronze"),
  v.literal("silver"),
  v.literal("gold"),
  v.literal("platinum"),
  v.literal("diamond"),
  v.literal("master")
)

const cleoPetStats = v.object({
  vitality: v.number(),
  power: v.number(),
  guard: v.number(),
  speed: v.number(),
  focus: v.number(),
})

const cleoPetBattleSummary = v.object({
  wins: v.number(),
  losses: v.number(),
  draws: v.number(),
  currentStreak: v.number(),
  bestStreak: v.number(),
  rating: v.number(),
  rank: cleoPetRank,
  seasonTier: cleoPetRank,
  seasonPoints: v.number(),
})

export const cleoProfileCardMode = v.union(
  v.literal("pet"),
  v.literal("battle"),
  v.literal("trainer"),
  v.literal("season"),
  v.literal("collection")
)

export const cleoPublicProfileField = v.union(
  v.literal("display-name"),
  v.literal("active-title"),
  v.literal("pet-name"),
  v.literal("species"),
  v.literal("rarity"),
  v.literal("element"),
  v.literal("level"),
  v.literal("mood"),
  v.literal("bond"),
  v.literal("evolution-stage"),
  v.literal("rank"),
  v.literal("wins"),
  v.literal("losses"),
  v.literal("streak"),
  v.literal("season-tier"),
  v.literal("season-points"),
  v.literal("collection-progress"),
  v.literal("developer-badge"),
  v.literal("developer-active-release"),
  v.literal("developer-progress"),
  v.literal("developer-current-focus"),
  v.literal("developer-shipped-count"),
  v.literal("developer-blocker-count")
)

export const cleoProfiles = defineTable({
  userId: v.id("users"),
  publicSlug: v.optional(v.string()),
  publicEnabled: v.boolean(),
  activePetId: v.optional(v.id("cleoPets")),
  activeTitleKey: v.optional(v.string()),
  cardMode: cleoProfileCardMode,
  visibleFields: v.array(cleoPublicProfileField),
  showDeveloperBadge: v.boolean(),
  cardThemeKey: v.optional(v.string()),
  cardFrameKey: v.optional(v.string()),
  cardLayoutKey: v.optional(v.string()),
  developerForgeSnapshot: v.optional(
    v.object({
      activeRelease: v.optional(v.string()),
      progressPercent: v.optional(v.number()),
      currentFocus: v.optional(v.string()),
      shippedCount: v.optional(v.number()),
      blockerCount: v.optional(v.number()),
      cachedAt: v.number(),
    })
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_id", ["userId"])
  .index("by_public_slug", ["publicSlug"])

export const cleoPets = defineTable({
  ownerUserId: v.id("users"),
  speciesKey: v.string(),
  rarity: cleoPetRarity,
  element: cleoPetElement,
  name: v.optional(v.string()),
  level: v.number(),
  xp: v.number(),
  mood: v.number(),
  bond: v.number(),
  baseStats: cleoPetStats,
  growthStats: cleoPetStats,
  derivedStats: cleoPetStats,
  evolutionStage: cleoPetEvolutionStage,
  battleSummary: cleoPetBattleSummary,
  equippedCosmeticKeys: v.array(v.string()),
  obtainedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_owner_user_id", ["ownerUserId"])
  .index("by_owner_user_id_and_obtained_at", ["ownerUserId", "obtainedAt"])

export const cleoPetInventories = defineTable({
  userId: v.id("users"),
  discoveredSpeciesKeys: v.array(v.string()),
  unlockedCosmeticKeys: v.array(v.string()),
  consumableUnrankedEnergy: v.number(),
  consumableEventEntries: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_user_id", ["userId"])

export const cleoPetBattleRecords = defineTable({
  userId: v.id("users"),
  petId: v.id("cleoPets"),
  mode: v.union(
    v.literal("unranked"),
    v.literal("ranked"),
    v.literal("event")
  ),
  outcome: v.union(v.literal("win"), v.literal("loss"), v.literal("draw")),
  seasonKey: v.string(),
  opponentSnapshot: v.object({
    speciesKey: v.string(),
    level: v.number(),
  }),
  ratingBefore: v.number(),
  ratingAfter: v.number(),
  streakAfter: v.number(),
  rewardSnapshot: v.object({
    xpAwarded: v.number(),
    bondAwarded: v.number(),
    cosmeticKey: v.optional(v.string()),
  }),
  occurredAt: v.number(),
  createdAt: v.number(),
})
  .index("by_pet_id_and_occurred_at", ["petId", "occurredAt"])
  .index("by_user_id_and_occurred_at", ["userId", "occurredAt"])
  .index("by_season_key_and_rating_after", ["seasonKey", "ratingAfter"])
