import { v, type Infer } from "convex/values"

const nullableString = v.union(v.string(), v.null())
const stringScopes = v.union(v.string(), v.array(v.string()), v.null())

const clerkEmailAddress = v.object({
  id: v.optional(v.string()),
  email_address: v.optional(v.string()),
  emailAddress: v.optional(v.string()),
})

const clerkExternalAccount = v.object({
  id: v.optional(nullableString),
  provider: v.optional(nullableString),
  provider_user_id: v.optional(nullableString),
  providerUserId: v.optional(nullableString),
  external_account_id: v.optional(nullableString),
  externalAccountId: v.optional(nullableString),
  username: v.optional(nullableString),
  email_address: v.optional(nullableString),
  emailAddress: v.optional(nullableString),
  first_name: v.optional(nullableString),
  firstName: v.optional(nullableString),
  last_name: v.optional(nullableString),
  lastName: v.optional(nullableString),
  image_url: v.optional(nullableString),
  imageUrl: v.optional(nullableString),
  avatar_url: v.optional(nullableString),
  avatarUrl: v.optional(nullableString),
  approved_scopes: v.optional(stringScopes),
  approvedScopes: v.optional(stringScopes),
})

export const clerkUserData = v.object({
  id: v.string(),
  primary_email_address_id: v.optional(nullableString),
  primaryEmailAddressId: v.optional(nullableString),
  email_addresses: v.optional(v.array(clerkEmailAddress)),
  emailAddresses: v.optional(v.array(clerkEmailAddress)),
  external_accounts: v.optional(v.array(clerkExternalAccount)),
  externalAccounts: v.optional(v.array(clerkExternalAccount)),
  first_name: v.optional(nullableString),
  firstName: v.optional(nullableString),
  last_name: v.optional(nullableString),
  lastName: v.optional(nullableString),
  username: v.optional(nullableString),
  image_url: v.optional(nullableString),
  imageUrl: v.optional(nullableString),
})

export type ClerkEmailAddress = Infer<typeof clerkEmailAddress>
export type ClerkExternalAccount = Infer<typeof clerkExternalAccount>
export type ClerkUserData = Infer<typeof clerkUserData>

export function normalizeClerkUserData(value: unknown): ClerkUserData | null {
  if (!isObjectRecord(value) || typeof value.id !== "string") {
    return null
  }

  const emailAddresses = readOptionalArray(
    value,
    "email_addresses",
    normalizeClerkEmailAddress
  )
  const camelEmailAddresses = readOptionalArray(
    value,
    "emailAddresses",
    normalizeClerkEmailAddress
  )
  const externalAccounts = readOptionalArray(
    value,
    "external_accounts",
    normalizeClerkExternalAccount
  )
  const camelExternalAccounts = readOptionalArray(
    value,
    "externalAccounts",
    normalizeClerkExternalAccount
  )

  if (
    emailAddresses === null ||
    camelEmailAddresses === null ||
    externalAccounts === null ||
    camelExternalAccounts === null
  ) {
    return null
  }

  const result = {
    id: value.id,
    ...optionalNullableStringField(value, "primary_email_address_id"),
    ...optionalNullableStringField(value, "primaryEmailAddressId"),
    ...(emailAddresses !== undefined
      ? { email_addresses: emailAddresses }
      : {}),
    ...(camelEmailAddresses !== undefined
      ? { emailAddresses: camelEmailAddresses }
      : {}),
    ...(externalAccounts !== undefined
      ? { external_accounts: externalAccounts }
      : {}),
    ...(camelExternalAccounts !== undefined
      ? { externalAccounts: camelExternalAccounts }
      : {}),
    ...optionalNullableStringField(value, "first_name"),
    ...optionalNullableStringField(value, "firstName"),
    ...optionalNullableStringField(value, "last_name"),
    ...optionalNullableStringField(value, "lastName"),
    ...optionalNullableStringField(value, "username"),
    ...optionalNullableStringField(value, "image_url"),
    ...optionalNullableStringField(value, "imageUrl"),
  }

  return result
}

function normalizeClerkEmailAddress(
  value: unknown
): ClerkEmailAddress | null {
  if (!isObjectRecord(value)) {
    return null
  }

  return {
    ...optionalStringField(value, "id"),
    ...optionalStringField(value, "email_address"),
    ...optionalStringField(value, "emailAddress"),
  }
}

function normalizeClerkExternalAccount(
  value: unknown
): ClerkExternalAccount | null {
  if (!isObjectRecord(value)) {
    return null
  }

  const approvedScopes = readOptionalScopes(value, "approved_scopes")
  const camelApprovedScopes = readOptionalScopes(value, "approvedScopes")

  if (approvedScopes === null || camelApprovedScopes === null) {
    return null
  }

  return {
    ...optionalNullableStringField(value, "id"),
    ...optionalNullableStringField(value, "provider"),
    ...optionalNullableStringField(value, "provider_user_id"),
    ...optionalNullableStringField(value, "providerUserId"),
    ...optionalNullableStringField(value, "external_account_id"),
    ...optionalNullableStringField(value, "externalAccountId"),
    ...optionalNullableStringField(value, "username"),
    ...optionalNullableStringField(value, "email_address"),
    ...optionalNullableStringField(value, "emailAddress"),
    ...optionalNullableStringField(value, "first_name"),
    ...optionalNullableStringField(value, "firstName"),
    ...optionalNullableStringField(value, "last_name"),
    ...optionalNullableStringField(value, "lastName"),
    ...optionalNullableStringField(value, "image_url"),
    ...optionalNullableStringField(value, "imageUrl"),
    ...optionalNullableStringField(value, "avatar_url"),
    ...optionalNullableStringField(value, "avatarUrl"),
    ...(approvedScopes !== undefined
      ? { approved_scopes: approvedScopes }
      : {}),
    ...(camelApprovedScopes !== undefined
      ? { approvedScopes: camelApprovedScopes }
      : {}),
  }
}

function optionalStringField(
  record: Record<string, unknown>,
  key: string
): Record<string, string> {
  const value = record[key]

  return typeof value === "string" ? { [key]: value } : {}
}

function optionalNullableStringField(
  record: Record<string, unknown>,
  key: string
): Record<string, string | null> {
  const value = record[key]

  return typeof value === "string" || value === null ? { [key]: value } : {}
}

function readOptionalArray<T>(
  record: Record<string, unknown>,
  key: string,
  normalize: (value: unknown) => T | null
): T[] | undefined | null {
  const value = record[key]

  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    return null
  }

  const normalized = value.map(normalize)

  return normalized.every(isNotNull) ? normalized : null
}

function readOptionalScopes(
  record: Record<string, unknown>,
  key: string
): string | string[] | null | undefined {
  const value = record[key]

  if (
    value === undefined ||
    value === null ||
    typeof value === "string"
  ) {
    return value
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value
  }

  return null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null
}
