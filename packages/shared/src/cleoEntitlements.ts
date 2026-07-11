export const CLEO_ENTITLEMENT_CATEGORIES = [
  "free",
  "user-subscription",
  "guild-subscription",
  "durable-one-time-purchase",
  "consumable-one-time-purchase",
  "staff-grant",
  "creator-grant",
  "test-grant",
] as const

export const CLEO_ENTITLEMENT_SOURCES = [
  "stripe",
  "discord",
  "staff",
  "creator-program",
  "test-fixture",
] as const

export const CLEO_ENTITLEMENT_STATUSES = [
  "active",
  "trialing",
  "grace",
  "expired",
  "revoked",
] as const

export const CLEO_ACCESS_BUNDLES = [
  "user-subscription",
  "guild-subscription",
] as const

export const CLEO_DURABLE_COSMETIC_TYPES = [
  "pet-skin",
  "card-frame",
  "profile-theme",
  "profile-title",
] as const

export const CLEO_CONSUMABLE_TYPES = ["unranked-energy", "event-entry"] as const

export const CLEO_PET_CAPABILITIES = [
  "pets.adopt-starter",
  "pets.basic-progression",
  "battles.unranked",
  "battles.ranked-access",
  "profiles.basic-card",
  "pets.extra-slots",
  "profiles.premium-themes",
  "cards.premium-frames",
  "profiles.titles",
  "battles.bonus-unranked-energy",
  "cards.extra-layouts",
  "widgets.rich-layouts",
  "guilds.tournaments",
  "guilds.events",
  "guilds.cosmetic-pool",
  "guilds.unranked-event-rewards",
] as const

export type CleoEntitlementCategory =
  (typeof CLEO_ENTITLEMENT_CATEGORIES)[number]
export type CleoEntitlementSource = (typeof CLEO_ENTITLEMENT_SOURCES)[number]
export type CleoEntitlementStatus = (typeof CLEO_ENTITLEMENT_STATUSES)[number]
export type CleoAccessBundle = (typeof CLEO_ACCESS_BUNDLES)[number]
export type CleoDurableCosmeticType =
  (typeof CLEO_DURABLE_COSMETIC_TYPES)[number]
export type CleoConsumableType = (typeof CLEO_CONSUMABLE_TYPES)[number]
export type CleoPetCapability = (typeof CLEO_PET_CAPABILITIES)[number]

export type CleoEntitlementBenefit =
  | {
      kind: "bundle"
      bundle: CleoAccessBundle
    }
  | {
      kind: "durable-cosmetic"
      cosmeticType: CleoDurableCosmeticType
      assetKey: string
    }
  | {
      kind: "consumable"
      consumableType: CleoConsumableType
      quantity: number
    }

export type CleoEntitlementRecord = {
  entitlementId: string
  category: Exclude<CleoEntitlementCategory, "free">
  source: CleoEntitlementSource
  subjectType: "user" | "guild"
  subjectId: string
  status: CleoEntitlementStatus
  benefit: CleoEntitlementBenefit
  startsAt?: number
  endsAt?: number
  graceEndsAt?: number
}

export type ResolvedCleoPetAccess = {
  capabilities: CleoPetCapability[]
  limits: {
    petSlots: number
    cardLayouts: number
    dailyUnrankedEnergy: number
    maxBankedUnrankedEnergy: number
    maxBankedEventEntries: number
  }
  durableCosmeticKeys: string[]
  consumables: {
    unrankedEnergy: number
    eventEntries: number
  }
  appliedEntitlementIds: string[]
  rejectedEntitlementIds: string[]
}

export type ResolveCleoPetAccessInput = {
  userId: string
  guildId?: string
  now: number
  environment: "development" | "test" | "production"
  entitlements: CleoEntitlementRecord[]
}

const freeCapabilities: CleoPetCapability[] = [
  "pets.adopt-starter",
  "pets.basic-progression",
  "battles.unranked",
  "battles.ranked-access",
  "profiles.basic-card",
]

const userSubscriptionCapabilities: CleoPetCapability[] = [
  "pets.extra-slots",
  "profiles.premium-themes",
  "cards.premium-frames",
  "profiles.titles",
  "battles.bonus-unranked-energy",
  "cards.extra-layouts",
  "widgets.rich-layouts",
]

const guildSubscriptionCapabilities: CleoPetCapability[] = [
  "guilds.tournaments",
  "guilds.events",
  "guilds.cosmetic-pool",
  "guilds.unranked-event-rewards",
]

const PUBLIC_PAYLOAD_FORBIDDEN_KEY =
  /(?:billing|stripe|subscription|entitlement|purchase|grant|customer|invoice|payment|checkout|price|sku|plan|email|token|secret|private[_-]?guild|guild[_-]?id|support[_-]?ticket|moderation|internal[_-]?log|linear)/i
const EMAIL_VALUE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/

export function resolveCleoPetAccess(
  input: ResolveCleoPetAccessInput
): ResolvedCleoPetAccess {
  let userSubscription = false
  let guildSubscription = false
  let unrankedEnergy = 0
  let eventEntries = 0
  const durableCosmeticKeys = new Set<string>()
  const appliedEntitlementIds: string[] = []
  const rejectedEntitlementIds: string[] = []

  for (const entitlement of input.entitlements) {
    if (!isApplicableEntitlement(entitlement, input)) {
      rejectedEntitlementIds.push(entitlement.entitlementId)
      continue
    }

    appliedEntitlementIds.push(entitlement.entitlementId)

    if (entitlement.benefit.kind === "bundle") {
      if (entitlement.benefit.bundle === "user-subscription") {
        userSubscription = true
      } else {
        guildSubscription = true
      }
      continue
    }

    if (entitlement.benefit.kind === "durable-cosmetic") {
      durableCosmeticKeys.add(
        `${entitlement.benefit.cosmeticType}:${entitlement.benefit.assetKey}`
      )
      continue
    }

    if (entitlement.benefit.consumableType === "unranked-energy") {
      unrankedEnergy += entitlement.benefit.quantity
    } else {
      eventEntries += entitlement.benefit.quantity
    }
  }

  return {
    capabilities: [
      ...freeCapabilities,
      ...(userSubscription ? userSubscriptionCapabilities : []),
      ...(guildSubscription ? guildSubscriptionCapabilities : []),
    ],
    limits: {
      petSlots: userSubscription ? 3 : 1,
      cardLayouts: userSubscription ? 3 : 1,
      dailyUnrankedEnergy: userSubscription ? 10 : 5,
      maxBankedUnrankedEnergy: 25,
      maxBankedEventEntries: 10,
    },
    durableCosmeticKeys: [...durableCosmeticKeys].sort(),
    consumables: {
      unrankedEnergy: Math.min(25, unrankedEnergy),
      eventEntries: Math.min(10, eventEntries),
    },
    appliedEntitlementIds,
    rejectedEntitlementIds,
  }
}

export function hasCleoPetCapability(
  access: Pick<ResolvedCleoPetAccess, "capabilities">,
  capability: CleoPetCapability
): boolean {
  return access.capabilities.includes(capability)
}

export function isCleoPublicProfilePayloadSafe(value: unknown): boolean {
  if (typeof value === "string") {
    return !EMAIL_VALUE.test(value)
  }

  if (Array.isArray(value)) {
    return value.every(isCleoPublicProfilePayloadSafe)
  }

  if (!value || typeof value !== "object") {
    return true
  }

  return Object.entries(value).every(
    ([key, nestedValue]) =>
      !PUBLIC_PAYLOAD_FORBIDDEN_KEY.test(key) &&
      isCleoPublicProfilePayloadSafe(nestedValue)
  )
}

function isApplicableEntitlement(
  entitlement: CleoEntitlementRecord,
  input: ResolveCleoPetAccessInput
): boolean {
  return (
    isSubjectMatch(entitlement, input) &&
    isEntitlementActive(entitlement, input.now) &&
    isLifecycleCompatible(entitlement) &&
    isSourceCompatible(entitlement) &&
    isBenefitCompatible(entitlement) &&
    !(
      entitlement.category === "test-grant" &&
      input.environment === "production"
    )
  )
}

function isLifecycleCompatible(entitlement: CleoEntitlementRecord): boolean {
  if (
    entitlement.category === "user-subscription" ||
    entitlement.category === "guild-subscription"
  ) {
    return (
      entitlement.status === "active" ||
      entitlement.status === "trialing" ||
      entitlement.status === "grace"
    )
  }

  return entitlement.status === "active"
}

function isSubjectMatch(
  entitlement: CleoEntitlementRecord,
  input: ResolveCleoPetAccessInput
): boolean {
  return entitlement.subjectType === "user"
    ? entitlement.subjectId === input.userId
    : entitlement.subjectId === input.guildId
}

function isEntitlementActive(
  entitlement: CleoEntitlementRecord,
  now: number
): boolean {
  if (entitlement.startsAt !== undefined && entitlement.startsAt > now) {
    return false
  }

  if (entitlement.endsAt !== undefined && entitlement.endsAt <= now) {
    return false
  }

  if (entitlement.status === "active" || entitlement.status === "trialing") {
    return true
  }

  return (
    entitlement.status === "grace" &&
    entitlement.graceEndsAt !== undefined &&
    entitlement.graceEndsAt > now
  )
}

function isSourceCompatible(entitlement: CleoEntitlementRecord): boolean {
  switch (entitlement.category) {
    case "user-subscription":
    case "guild-subscription":
    case "durable-one-time-purchase":
    case "consumable-one-time-purchase":
      return entitlement.source === "stripe" || entitlement.source === "discord"
    case "staff-grant":
      return entitlement.source === "staff"
    case "creator-grant":
      return entitlement.source === "creator-program"
    case "test-grant":
      return entitlement.source === "test-fixture"
  }
}

function isBenefitCompatible(entitlement: CleoEntitlementRecord): boolean {
  if (
    entitlement.benefit.kind === "consumable" &&
    (!Number.isSafeInteger(entitlement.benefit.quantity) ||
      entitlement.benefit.quantity <= 0)
  ) {
    return false
  }

  switch (entitlement.category) {
    case "user-subscription":
      return (
        entitlement.subjectType === "user" &&
        entitlement.benefit.kind === "bundle" &&
        entitlement.benefit.bundle === "user-subscription"
      )
    case "guild-subscription":
      return (
        entitlement.subjectType === "guild" &&
        entitlement.benefit.kind === "bundle" &&
        entitlement.benefit.bundle === "guild-subscription"
      )
    case "durable-one-time-purchase":
      return (
        entitlement.subjectType === "user" &&
        entitlement.benefit.kind === "durable-cosmetic" &&
        entitlement.benefit.assetKey.trim().length > 0
      )
    case "consumable-one-time-purchase":
      return (
        entitlement.subjectType === "user" &&
        entitlement.benefit.kind === "consumable"
      )
    case "staff-grant":
    case "creator-grant":
    case "test-grant":
      return (
        entitlement.benefit.kind !== "consumable" &&
        (entitlement.benefit.kind !== "bundle" ||
          (entitlement.benefit.bundle === "user-subscription"
            ? entitlement.subjectType === "user"
            : entitlement.subjectType === "guild"))
      )
  }
}
