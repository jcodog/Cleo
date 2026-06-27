import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isCleoPublicProfilePayloadSafe } from "./cleoEntitlements"
import {
  CLEO_PET_LIMITS,
  CLEO_PUBLIC_PROFILE_FIELDS,
  buildCleoPetCollectionSummary,
  buildCleoPublicProfileCard,
  canSelectCleoPetAsActive,
  deriveCleoPetProgression,
  deriveCleoPetStats,
  isCleoCosmeticKey,
  isCleoPetSpeciesKey,
  isCleoPetStatsWithinBounds,
  normalizeCleoPetBattleSummary,
  normalizeCleoPetMeters,
  sanitizeCleoDeveloperForgeSnapshot,
  totalXpRequiredForCleoPetLevel,
  xpRequiredForNextCleoPetLevel,
  type CleoPetBattleSummary,
  type CleoPetStats,
} from "./cleoPets"

const baseStats: CleoPetStats = {
  vitality: 100,
  power: 80,
  guard: 70,
  speed: 60,
  focus: 50,
}

const growthStats: CleoPetStats = {
  vitality: 5,
  power: 4,
  guard: 3,
  speed: 2,
  focus: 1,
}

const battle: CleoPetBattleSummary = {
  wins: 12,
  losses: 3,
  draws: 1,
  currentStreak: 4,
  bestStreak: 8,
  rating: 1_500,
  rank: "gold",
  seasonTier: "gold",
  seasonPoints: 640,
}

describe("Cleo Pet progression", () => {
  it("uses a deterministic bounded XP curve", () => {
    assert.equal(xpRequiredForNextCleoPetLevel(1), 100)
    assert.equal(xpRequiredForNextCleoPetLevel(2), 130)
    assert.equal(xpRequiredForNextCleoPetLevel(0), 0)
    assert.equal(xpRequiredForNextCleoPetLevel(100), 0)
    assert.equal(xpRequiredForNextCleoPetLevel(1.5), 0)
    assert.equal(totalXpRequiredForCleoPetLevel(1), 0)
    assert.equal(totalXpRequiredForCleoPetLevel(3), 230)
    assert.equal(
      totalXpRequiredForCleoPetLevel(Number.POSITIVE_INFINITY),
      0
    )

    assert.deepEqual(deriveCleoPetProgression(-10), {
      level: 1,
      currentLevelXp: 0,
      nextLevelXp: 100,
    })
    assert.deepEqual(deriveCleoPetProgression(Number.NaN), {
      level: 1,
      currentLevelXp: 0,
      nextLevelXp: 100,
    })
    assert.deepEqual(deriveCleoPetProgression(100), {
      level: 2,
      currentLevelXp: 0,
      nextLevelXp: 130,
    })

    const maximumXp = totalXpRequiredForCleoPetLevel(100)
    assert.deepEqual(deriveCleoPetProgression(maximumXp + 500), {
      level: 100,
      currentLevelXp: 500,
      nextLevelXp: 0,
    })
  })

  it("derives bounded stats and rejects invalid inputs", () => {
    assert.deepEqual(
      deriveCleoPetStats({
        base: baseStats,
        growth: growthStats,
        level: 3,
        evolutionStage: "base",
      }),
      { vitality: 110, power: 88, guard: 76, speed: 64, focus: 52 }
    )
    assert.equal(
      deriveCleoPetStats({
        base: baseStats,
        growth: growthStats,
        level: 3,
        evolutionStage: "evolved",
      }).vitality,
      120
    )
    assert.equal(
      deriveCleoPetStats({
        base: {
          vitality: 250,
          power: 250,
          guard: 250,
          speed: 250,
          focus: 250,
        },
        growth: {
          vitality: 10,
          power: 10,
          guard: 10,
          speed: 10,
          focus: 10,
        },
        level: 100,
        evolutionStage: "ascended",
      }).vitality,
      CLEO_PET_LIMITS.maxStat
    )
    assert.equal(isCleoPetStatsWithinBounds(baseStats), true)
    assert.equal(
      isCleoPetStatsWithinBounds({ ...baseStats, power: -1 }),
      false
    )
    assert.equal(
      isCleoPetStatsWithinBounds({ ...baseStats, power: 1.5 }),
      false
    )
    assert.throws(
      () =>
        deriveCleoPetStats({
          base: { ...baseStats, vitality: 251 },
          growth: growthStats,
          level: 1,
          evolutionStage: "base",
        }),
      RangeError
    )
    assert.throws(
      () =>
        deriveCleoPetStats({
          base: baseStats,
          growth: { ...growthStats, vitality: 11 },
          level: 1,
          evolutionStage: "base",
        }),
      RangeError
    )
    assert.throws(
      () =>
        deriveCleoPetStats({
          base: baseStats,
          growth: growthStats,
          level: 101,
          evolutionStage: "base",
        }),
      RangeError
    )
  })

  it("normalizes meters, summaries, identifiers, and collection progress", () => {
    assert.deepEqual(normalizeCleoPetMeters({ mood: -3, bond: 1_200.4 }), {
      mood: 0,
      bond: 1_000,
    })
    assert.deepEqual(
      normalizeCleoPetMeters({
        mood: Number.NaN,
        bond: 400.6,
      }),
      { mood: 0, bond: 401 }
    )

    const normalizedBattle = normalizeCleoPetBattleSummary({
      ...battle,
      wins: -2,
      losses: 2_000_000,
      rating: 20_000,
      seasonPoints: -4,
    })
    assert.deepEqual(normalizedBattle, {
      ...battle,
      wins: 0,
      losses: CLEO_PET_LIMITS.maxBattleCount,
      rating: CLEO_PET_LIMITS.maxRating,
      seasonPoints: 0,
    })

    assert.deepEqual(
      buildCleoPetCollectionSummary({
        discoveredSpecies: 3,
        totalSpecies: 4,
        unlockedCosmetics: 1,
        totalCosmetics: 4,
      }),
      {
        discoveredSpecies: 3,
        totalSpecies: 4,
        unlockedCosmetics: 1,
        totalCosmetics: 4,
        completionPercent: 50,
      }
    )
    assert.equal(
      buildCleoPetCollectionSummary({
        discoveredSpecies: 2,
        totalSpecies: 0,
        unlockedCosmetics: 3,
        totalCosmetics: 0,
      }).completionPercent,
      0
    )
    assert.equal(isCleoPetSpeciesKey("byte-fox"), true)
    assert.equal(isCleoPetSpeciesKey("Byte Fox"), false)
    assert.equal(isCleoPetSpeciesKey("a".repeat(49)), false)
    assert.equal(isCleoCosmeticKey("card-frame:launch/01"), true)
    assert.equal(isCleoCosmeticKey("bad key"), false)
    assert.equal(isCleoCosmeticKey("a".repeat(97)), false)
    assert.equal(canSelectCleoPetAsActive("user-1", "user-1"), true)
    assert.equal(canSelectCleoPetAsActive("user-1", "user-2"), false)
  })
})

describe("Cleo public profile cards", () => {
  it("emits only explicitly visible allowlisted fields", () => {
    const card = buildCleoPublicProfileCard({
      role: "user",
      mode: "pet",
      visibleFields: ["display-name", "pet-name", "level", "wins"],
      showDeveloperBadge: false,
      displayName: "  Cleo Trainer  ",
      activeTitle: "Hidden title",
      activePet: {
        name: "Pixel",
        species: "byte-fox",
        rarity: "rare",
        element: "spark",
        level: 12,
        mood: 90,
        bond: 700,
        evolutionStage: "evolved",
        battle,
      },
      collection: {
        discoveredSpecies: 2,
        totalSpecies: 4,
        unlockedCosmetics: 1,
        totalCosmetics: 6,
        completionPercent: 30,
      },
    })

    assert.deepEqual(card, {
      version: 1,
      mode: "pet",
      fields: {
        "display-name": "Cleo Trainer",
        "pet-name": "Pixel",
        level: 12,
        wins: 12,
      },
      developer: undefined,
    })
    assert.equal(isCleoPublicProfilePayloadSafe(card), true)
    assert.equal(JSON.stringify(card).includes("Hidden title"), false)
  })

  it("supports every public field and role-gates developer data", () => {
    const card = buildCleoPublicProfileCard({
      role: "staff",
      mode: "trainer",
      visibleFields: [...CLEO_PUBLIC_PROFILE_FIELDS],
      showDeveloperBadge: true,
      displayName: "Jason",
      activeTitle: "Launch Engineer",
      activePet: {
        name: "Pixel",
        species: "byte-fox",
        rarity: "rare",
        element: "spark",
        level: 12,
        mood: 90,
        bond: 700,
        evolutionStage: "evolved",
        battle,
      },
      collection: {
        discoveredSpecies: 2,
        totalSpecies: 4,
        unlockedCosmetics: 1,
        totalCosmetics: 6,
        completionPercent: 30,
      },
      developerForge: {
        activeRelease: "V3 Launch",
        progressPercent: 82.4,
        currentFocus: "Cleo Profiles",
        shippedCount: 18,
        blockerCount: 2,
        cachedAt: 100,
      },
    })

    assert.deepEqual(card.fields, {
      "display-name": "Jason",
      "active-title": "Launch Engineer",
      "pet-name": "Pixel",
      species: "byte-fox",
      rarity: "rare",
      element: "spark",
      level: 12,
      mood: 90,
      bond: 700,
      "evolution-stage": "evolved",
      rank: "gold",
      wins: 12,
      losses: 3,
      streak: 4,
      "season-tier": "gold",
      "season-points": 640,
      "collection-progress": 30,
    })
    assert.deepEqual(card.developer, {
      badge: "Cleo Developer",
      forge: {
        activeRelease: "V3 Launch",
        progressPercent: 82,
        currentFocus: "Cleo Profiles",
        shippedCount: 18,
        blockerCount: 2,
      },
    })

    const forgedUserCard = buildCleoPublicProfileCard({
      role: "user",
      mode: "trainer",
      visibleFields: [
        "developer-badge",
        "developer-active-release",
        "developer-progress",
      ],
      showDeveloperBadge: true,
      developerForge: {
        activeRelease: "Private",
        progressPercent: 100,
        cachedAt: 1,
      },
    })
    assert.equal(forgedUserCard.developer, undefined)
  })

  it("drops unavailable and private-looking text from public payloads", () => {
    const privateForge = sanitizeCleoDeveloperForgeSnapshot({
      activeRelease: "https://linear.app/private",
      progressPercent: 150,
      currentFocus: "Private issue JCN-108",
      shippedCount: -5,
      blockerCount: Number.POSITIVE_INFINITY,
      cachedAt: Number.NaN,
    })
    assert.deepEqual(privateForge, {
      activeRelease: undefined,
      progressPercent: 100,
      currentFocus: undefined,
      shippedCount: 0,
      blockerCount: 0,
      cachedAt: 0,
    })

    const card = buildCleoPublicProfileCard({
      role: "admin",
      mode: "season",
      visibleFields: [
        "display-name",
        "active-title",
        "pet-name",
        "species",
        "developer-badge",
      ],
      showDeveloperBadge: true,
      displayName: "person@example.com",
      activeTitle: "a".repeat(70),
      activePet: undefined,
    })
    assert.deepEqual(card, {
      version: 1,
      mode: "season",
      fields: {},
      developer: {
        badge: "Cleo Developer",
        forge: undefined,
      },
    })
  })

  it("omits unselected and unavailable Forge fields", () => {
    const card = buildCleoPublicProfileCard({
      role: "superadmin",
      mode: "trainer",
      visibleFields: ["developer-badge", "developer-progress"],
      showDeveloperBadge: true,
      developerForge: {
        cachedAt: 1,
      },
    })
    assert.deepEqual(card.developer, {
      badge: "Cleo Developer",
      forge: undefined,
    })
  })

  it("fails closed if a future change creates an unsafe payload", () => {
    assert.throws(
      () =>
        buildCleoPublicProfileCard({
          role: "user",
          mode: "pet",
          visibleFields: ["species"],
          showDeveloperBadge: false,
          activePet: {
            species: "private@example.com",
            rarity: "common",
            element: "neutral",
            level: 1,
            mood: 50,
            bond: 0,
            evolutionStage: "base",
            battle,
          },
        }),
      /Unsafe Cleo public profile payload/
    )
  })
})
