import { STAFF_ROLES, type UserRole } from "./constants"
import { isCleoPublicProfilePayloadSafe } from "./cleoEntitlements"

export const CLEO_PET_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const

export const CLEO_PET_ELEMENTS = [
  "neutral",
  "ember",
  "tide",
  "bloom",
  "spark",
  "frost",
  "shadow",
] as const

export const CLEO_PET_EVOLUTION_STAGES = [
  "base",
  "evolved",
  "ascended",
] as const

export const CLEO_PET_BATTLE_MODES = ["unranked", "ranked", "event"] as const
export const CLEO_PET_BATTLE_OUTCOMES = ["win", "loss", "draw"] as const

export const CLEO_PET_RANKS = [
  "unranked",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
] as const

export const CLEO_PROFILE_CARD_MODES = [
  "pet",
  "battle",
  "trainer",
  "season",
  "collection",
] as const

export const CLEO_PUBLIC_PROFILE_FIELDS = [
  "display-name",
  "active-title",
  "pet-name",
  "species",
  "rarity",
  "element",
  "level",
  "mood",
  "bond",
  "evolution-stage",
  "rank",
  "wins",
  "losses",
  "streak",
  "season-tier",
  "season-points",
  "collection-progress",
  "developer-badge",
  "developer-active-release",
  "developer-progress",
  "developer-current-focus",
  "developer-shipped-count",
  "developer-blocker-count",
] as const

export const CLEO_PROFILE_FEATURE_FLAGS = {
  discordWidgetPublishing: "cleoDiscordProfileWidgetPublishing",
} as const

export const CLEO_PET_LIMITS = {
  maxLevel: 100,
  maxStat: 999,
  maxBaseStat: 250,
  maxGrowthPerLevel: 10,
  maxMood: 100,
  maxBond: 1_000,
  maxRating: 10_000,
  maxBattleCount: 1_000_000,
  maxRewardXp: 10_000,
  maxRewardBond: 100,
} as const

export type CleoPetRarity = (typeof CLEO_PET_RARITIES)[number]
export type CleoPetElement = (typeof CLEO_PET_ELEMENTS)[number]
export type CleoPetEvolutionStage =
  (typeof CLEO_PET_EVOLUTION_STAGES)[number]
export type CleoPetBattleMode = (typeof CLEO_PET_BATTLE_MODES)[number]
export type CleoPetBattleOutcome = (typeof CLEO_PET_BATTLE_OUTCOMES)[number]
export type CleoPetRank = (typeof CLEO_PET_RANKS)[number]
export type CleoProfileCardMode = (typeof CLEO_PROFILE_CARD_MODES)[number]
export type CleoPublicProfileField =
  (typeof CLEO_PUBLIC_PROFILE_FIELDS)[number]

export type CleoPetStats = {
  vitality: number
  power: number
  guard: number
  speed: number
  focus: number
}

export type CleoPetBattleSummary = {
  wins: number
  losses: number
  draws: number
  currentStreak: number
  bestStreak: number
  rating: number
  rank: CleoPetRank
  seasonTier: CleoPetRank
  seasonPoints: number
}

export type CleoPetCollectionSummary = {
  discoveredSpecies: number
  totalSpecies: number
  unlockedCosmetics: number
  totalCosmetics: number
  completionPercent: number
}

export type CleoDeveloperForgeSnapshot = {
  activeRelease?: string
  progressPercent?: number
  currentFocus?: string
  shippedCount?: number
  blockerCount?: number
  cachedAt: number
}

export type CleoProfileCardSource = {
  role: UserRole
  mode: CleoProfileCardMode
  visibleFields: CleoPublicProfileField[]
  showDeveloperBadge: boolean
  displayName?: string
  activeTitle?: string
  activePet?: {
    name?: string
    species: string
    rarity: CleoPetRarity
    element: CleoPetElement
    level: number
    mood: number
    bond: number
    evolutionStage: CleoPetEvolutionStage
    battle: CleoPetBattleSummary
  }
  collection?: CleoPetCollectionSummary
  developerForge?: CleoDeveloperForgeSnapshot
}

export type CleoPublicProfileCard = {
  version: 1
  mode: CleoProfileCardMode
  fields: Partial<
    Record<
      Exclude<
        CleoPublicProfileField,
        | "developer-badge"
        | "developer-active-release"
        | "developer-progress"
        | "developer-current-focus"
        | "developer-shipped-count"
        | "developer-blocker-count"
      >,
      string | number
    >
  >
  developer?: {
    badge: "Cleo Developer"
    forge?: Omit<CleoDeveloperForgeSnapshot, "cachedAt">
  }
}

const SPECIES_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COSMETIC_KEY_PATTERN = /^[a-z0-9]+(?:[.:/-][a-z0-9]+)*$/
const PRIVATE_TEXT_PATTERN =
  /(?:\b[^\s@]+@[^\s@]+\.[^\s@]+\b|https?:\/\/|\b[A-Z]{2,10}-\d+\b)/i

export function isCleoPetSpeciesKey(value: string): boolean {
  return value.length <= 48 && SPECIES_KEY_PATTERN.test(value)
}

export function isCleoCosmeticKey(value: string): boolean {
  return value.length <= 96 && COSMETIC_KEY_PATTERN.test(value)
}

export function isCleoPetStatsWithinBounds(
  stats: CleoPetStats,
  maximum: number = CLEO_PET_LIMITS.maxStat
): boolean {
  return Object.values(stats).every(
    (value) =>
      Number.isSafeInteger(value) && value >= 0 && value <= maximum
  )
}

export function xpRequiredForNextCleoPetLevel(level: number): number {
  if (
    !Number.isSafeInteger(level) ||
    level < 1 ||
    level >= CLEO_PET_LIMITS.maxLevel
  ) {
    return 0
  }

  const offset = level - 1
  return 100 + 25 * offset + 5 * offset * offset
}

export function totalXpRequiredForCleoPetLevel(level: number): number {
  const boundedLevel = normalizeBoundedInteger(
    level,
    1,
    CLEO_PET_LIMITS.maxLevel
  )
  let total = 0

  for (let currentLevel = 1; currentLevel < boundedLevel; currentLevel += 1) {
    total += xpRequiredForNextCleoPetLevel(currentLevel)
  }

  return total
}

export function deriveCleoPetProgression(totalXp: number): {
  level: number
  currentLevelXp: number
  nextLevelXp: number
} {
  const normalizedXp = Math.max(
    0,
    Number.isSafeInteger(totalXp) ? totalXp : 0
  )
  let level = 1
  let levelStartXp = 0

  while (level < CLEO_PET_LIMITS.maxLevel) {
    const required = xpRequiredForNextCleoPetLevel(level)
    if (normalizedXp < levelStartXp + required) {
      break
    }
    levelStartXp += required
    level += 1
  }

  return {
    level,
    currentLevelXp: normalizedXp - levelStartXp,
    nextLevelXp: xpRequiredForNextCleoPetLevel(level),
  }
}

export function deriveCleoPetStats(input: {
  base: CleoPetStats
  growth: CleoPetStats
  level: number
  evolutionStage: CleoPetEvolutionStage
}): CleoPetStats {
  if (
    !isCleoPetStatsWithinBounds(input.base, CLEO_PET_LIMITS.maxBaseStat) ||
    !isCleoPetStatsWithinBounds(
      input.growth,
      CLEO_PET_LIMITS.maxGrowthPerLevel
    ) ||
    !Number.isSafeInteger(input.level) ||
    input.level < 1 ||
    input.level > CLEO_PET_LIMITS.maxLevel
  ) {
    throw new RangeError("Invalid Cleo Pet stat inputs")
  }

  const evolutionBonus =
    input.evolutionStage === "base"
      ? 0
      : input.evolutionStage === "evolved"
        ? 10
        : 25

  return mapCleoPetStats(input.base, (key, baseValue) =>
    Math.min(
      CLEO_PET_LIMITS.maxStat,
      baseValue + input.growth[key] * (input.level - 1) + evolutionBonus
    )
  )
}

export function normalizeCleoPetMeters(input: {
  mood: number
  bond: number
}): { mood: number; bond: number } {
  return {
    mood: normalizeBoundedInteger(input.mood, 0, CLEO_PET_LIMITS.maxMood),
    bond: normalizeBoundedInteger(input.bond, 0, CLEO_PET_LIMITS.maxBond),
  }
}

export function normalizeCleoPetBattleSummary(
  summary: CleoPetBattleSummary
): CleoPetBattleSummary {
  return {
    ...summary,
    wins: normalizeBoundedInteger(
      summary.wins,
      0,
      CLEO_PET_LIMITS.maxBattleCount
    ),
    losses: normalizeBoundedInteger(
      summary.losses,
      0,
      CLEO_PET_LIMITS.maxBattleCount
    ),
    draws: normalizeBoundedInteger(
      summary.draws,
      0,
      CLEO_PET_LIMITS.maxBattleCount
    ),
    currentStreak: normalizeBoundedInteger(
      summary.currentStreak,
      0,
      CLEO_PET_LIMITS.maxBattleCount
    ),
    bestStreak: normalizeBoundedInteger(
      summary.bestStreak,
      0,
      CLEO_PET_LIMITS.maxBattleCount
    ),
    rating: normalizeBoundedInteger(
      summary.rating,
      0,
      CLEO_PET_LIMITS.maxRating
    ),
    seasonPoints: normalizeBoundedInteger(
      summary.seasonPoints,
      0,
      CLEO_PET_LIMITS.maxRating
    ),
  }
}

export function buildCleoPetCollectionSummary(input: {
  discoveredSpecies: number
  totalSpecies: number
  unlockedCosmetics: number
  totalCosmetics: number
}): CleoPetCollectionSummary {
  const totalSpecies = normalizeBoundedInteger(input.totalSpecies, 0, 100_000)
  const totalCosmetics = normalizeBoundedInteger(
    input.totalCosmetics,
    0,
    100_000
  )
  const discoveredSpecies = normalizeBoundedInteger(
    input.discoveredSpecies,
    0,
    totalSpecies
  )
  const unlockedCosmetics = normalizeBoundedInteger(
    input.unlockedCosmetics,
    0,
    totalCosmetics
  )
  const totalAvailable = totalSpecies + totalCosmetics

  return {
    discoveredSpecies,
    totalSpecies,
    unlockedCosmetics,
    totalCosmetics,
    completionPercent:
      totalAvailable === 0
        ? 0
        : Math.round(
            ((discoveredSpecies + unlockedCosmetics) / totalAvailable) * 100
          ),
  }
}

export function canSelectCleoPetAsActive(
  profileUserId: string,
  petOwnerUserId: string
): boolean {
  return profileUserId === petOwnerUserId
}

export function sanitizeCleoDeveloperForgeSnapshot(
  snapshot: CleoDeveloperForgeSnapshot
): CleoDeveloperForgeSnapshot {
  return {
    activeRelease: sanitizePublicText(snapshot.activeRelease, 60),
    progressPercent:
      snapshot.progressPercent === undefined
        ? undefined
        : normalizeBoundedInteger(snapshot.progressPercent, 0, 100),
    currentFocus: sanitizePublicText(snapshot.currentFocus, 120),
    shippedCount:
      snapshot.shippedCount === undefined
        ? undefined
        : normalizeBoundedInteger(snapshot.shippedCount, 0, 9_999),
    blockerCount:
      snapshot.blockerCount === undefined
        ? undefined
        : normalizeBoundedInteger(snapshot.blockerCount, 0, 9_999),
    cachedAt: normalizeBoundedInteger(
      snapshot.cachedAt,
      0,
      Number.MAX_SAFE_INTEGER
    ),
  }
}

export function buildCleoPublicProfileCard(
  source: CleoProfileCardSource
): CleoPublicProfileCard {
  const visibleFields = new Set(source.visibleFields)
  const fields: CleoPublicProfileCard["fields"] = {}

  for (const field of visibleFields) {
    if (field.startsWith("developer-")) {
      continue
    }

    const value = readPublicProfileField(
      source,
      field as Exclude<
        CleoPublicProfileField,
        | "developer-badge"
        | "developer-active-release"
        | "developer-progress"
        | "developer-current-focus"
        | "developer-shipped-count"
        | "developer-blocker-count"
      >
    )
    if (value !== undefined) {
      fields[field as keyof CleoPublicProfileCard["fields"]] = value
    }
  }

  const canShowDeveloper =
    source.showDeveloperBadge &&
    STAFF_ROLES.includes(source.role as (typeof STAFF_ROLES)[number]) &&
    visibleFields.has("developer-badge")

  const developer = canShowDeveloper
    ? {
        badge: "Cleo Developer" as const,
        forge: buildPublicDeveloperForge(source, visibleFields),
      }
    : undefined

  const card: CleoPublicProfileCard = {
    version: 1,
    mode: source.mode,
    fields,
    developer,
  }

  if (!isCleoPublicProfilePayloadSafe(card)) {
    throw new Error("Unsafe Cleo public profile payload")
  }

  return card
}

function readPublicProfileField(
  source: CleoProfileCardSource,
  field: Exclude<
    CleoPublicProfileField,
    | "developer-badge"
    | "developer-active-release"
    | "developer-progress"
    | "developer-current-focus"
    | "developer-shipped-count"
    | "developer-blocker-count"
  >
): string | number | undefined {
  switch (field) {
    case "display-name":
      return sanitizePublicText(source.displayName, 80)
    case "active-title":
      return sanitizePublicText(source.activeTitle, 60)
    case "pet-name":
      return sanitizePublicText(source.activePet?.name, 32)
    case "species":
      return source.activePet?.species
    case "rarity":
      return source.activePet?.rarity
    case "element":
      return source.activePet?.element
    case "level":
      return source.activePet?.level
    case "mood":
      return source.activePet?.mood
    case "bond":
      return source.activePet?.bond
    case "evolution-stage":
      return source.activePet?.evolutionStage
    case "rank":
      return source.activePet?.battle.rank
    case "wins":
      return source.activePet?.battle.wins
    case "losses":
      return source.activePet?.battle.losses
    case "streak":
      return source.activePet?.battle.currentStreak
    case "season-tier":
      return source.activePet?.battle.seasonTier
    case "season-points":
      return source.activePet?.battle.seasonPoints
    case "collection-progress":
      return source.collection?.completionPercent
  }
}

function buildPublicDeveloperForge(
  source: CleoProfileCardSource,
  visibleFields: Set<CleoPublicProfileField>
): Omit<CleoDeveloperForgeSnapshot, "cachedAt"> | undefined {
  if (!source.developerForge) {
    return undefined
  }

  const sanitized = sanitizeCleoDeveloperForgeSnapshot(source.developerForge)
  const forge: Omit<CleoDeveloperForgeSnapshot, "cachedAt"> = {}

  if (visibleFields.has("developer-active-release")) {
    forge.activeRelease = sanitized.activeRelease
  }
  if (visibleFields.has("developer-progress")) {
    forge.progressPercent = sanitized.progressPercent
  }
  if (visibleFields.has("developer-current-focus")) {
    forge.currentFocus = sanitized.currentFocus
  }
  if (visibleFields.has("developer-shipped-count")) {
    forge.shippedCount = sanitized.shippedCount
  }
  if (visibleFields.has("developer-blocker-count")) {
    forge.blockerCount = sanitized.blockerCount
  }

  return Object.values(forge).some((value) => value !== undefined)
    ? forge
    : undefined
}

function sanitizePublicText(
  value: string | undefined,
  maximumLength: number
): string | undefined {
  const normalized = value?.trim()
  if (
    !normalized ||
    normalized.length > maximumLength ||
    PRIVATE_TEXT_PATTERN.test(normalized)
  ) {
    return undefined
  }
  return normalized
}

function normalizeBoundedInteger(
  value: number,
  minimum: number,
  maximum: number
): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : minimum
  return Math.min(maximum, Math.max(minimum, normalized))
}

function mapCleoPetStats(
  stats: CleoPetStats,
  mapper: (key: keyof CleoPetStats, value: number) => number
): CleoPetStats {
  return {
    vitality: mapper("vitality", stats.vitality),
    power: mapper("power", stats.power),
    guard: mapper("guard", stats.guard),
    speed: mapper("speed", stats.speed),
    focus: mapper("focus", stats.focus),
  }
}
