import { compileBlockedWords, type CompiledBlockedWord } from "./blockedWords"
import { moderationPolicySchema, type ModerationPolicy } from "./types"
import { normalizeAllowedDomain } from "./urls"

const compiled = Symbol("compiled moderation policy")

export type CompiledModerationPolicy = Readonly<{
  [compiled]: true
  policy: ModerationPolicy
  blockedWords: readonly CompiledBlockedWord[]
  allowedDomains: readonly string[]
}>

/** Compile once per configuration revision; keep the returned immutable value in the adapter cache. */
export function compileModerationPolicy(
  input: unknown = {}
): CompiledModerationPolicy {
  const policy = moderationPolicySchema.parse(input)
  if (
    policy.rules.repeatedPhrases.minimumWords >
    policy.rules.repeatedPhrases.maximumWords
  ) {
    throw new RangeError(
      "Minimum phrase words must not exceed maximum phrase words."
    )
  }
  const allowedDomains = policy.rules.links.allowedDomains.map((domain) => {
    const normalized = normalizeAllowedDomain(domain)
    if (normalized === null)
      throw new RangeError(
        "Allowed domains must be valid hostnames without URLs or wildcards."
      )
    return normalized
  })
  return Object.freeze({
    [compiled]: true,
    policy,
    blockedWords: compileBlockedWords(policy.rules.blockedWords.entries),
    allowedDomains: Object.freeze([...new Set(allowedDomains)]),
  })
}
