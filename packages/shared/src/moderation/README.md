# Shared moderation

This package detects messages and proposes actions. It performs no enforcement,
network requests, database reads or logging. Every rule defaults to disabled.
Enabling a rule defaults its proposed action to `log`.

```ts
import {
  compileModerationPolicy,
  evaluateModeration,
} from "@workspace/shared/moderation"

// Store this immutable value in the adapter's configuration cache.
const policy = compileModerationPolicy({
  revision: 1,
  rules: {
    links: { enabled: true, allowedDomains: ["example.com"] },
    blockedWords: { enabled: true, entries: [{ term: "example phrase" }] },
  },
})

const decision = evaluateModeration({
  message: {
    id: "platform-message-id",
    scopeId: "platform:community:channel",
    authorId: "platform-user-id",
    content: "A message to preview",
  },
  policy,
  history: [],
  now: 100000,
})
```

## Ownership and validation

`compileModerationPolicy` accepts unknown input. It validates the policy shape,
thresholds, domain entries, phrase widths and literal blocked terms, then prepares
immutable matching data. Compile once per configuration update, even when a caller
reuses the same revision number. There is no global policy cache. The exported
Zod schemas describe configuration shapes; compilation also validates cross-field
constraints and normalised terms and domains.

Evaluation validates message and history inputs and throws for malformed or
oversized input. Never enforce on a silently truncated message. Adapters should
report invalid input as unavailable for evaluation. Original content remains
separate from NFC-normalised analysis text and comparison text.

The compile-once API was chosen over accepting raw configuration on each call so
validation and blocked-term preparation cannot accidentally enter the hot path.
Explicit history was chosen over an internal stateful engine so callers control
expiry, delivery deduplication and channel routing across runtime instances.

## Detection semantics

- Rule order is `MODERATION_RULE_ORDER`, independent of policy property order.
  All matches are returned. Severity and action take their respective strongest
  values; timeout ties select the longest duration.
- Caps match at or above the configured percentage, with the minimum number of
  Unicode letters. Uncased letters contribute to the denominator.
- Emoji and symbol limits match strictly above their thresholds. Symbol percentage
  uses visible graphemes excluding whitespace and format-only graphemes. Emoji
  also contribute to symbols. Emote markup is excluded from text statistics.
- Repeated characters use canonical graphemes and NFKC comparison. Whitespace
  breaks a run; invisible format characters and non-emoji variation selectors do
  not. Emoji joiners and selectors remain significant. This comparison does not
  equate arbitrary visual homoglyphs.
- Phrases are consecutive repeated word-token sequences. Punctuation separates
  words. Phrase widths are bounded at 16 words, with linear work per width.
- Duplicate comparison uses NFC, Unicode lowercase and collapsed whitespace.
  Blocked terms use the same comparison. Zero-width characters are preserved,
  so unrelated words are never joined. This is not an obfuscation or transliteration
  engine, locale-specific case folding, or a full Unicode confusable detector.
- Whole-word matching checks Unicode letters, numbers, combining marks and
  connector punctuation on either side of a literal term. It does not treat
  a Latin word embedded in a different script's word as a separate word.
- Recent history is scoped to the same author and channel. Windows include the
  exact lower time boundary and exclude future entries. The current message
  counts once. Repeated history IDs and the current ID are ignored after their
  first eligible occurrence. Supply consistent content/timestamps for each ID.
- Administrators and moderators are exempt by default. Global and rule exemptions
  are additive. Identity flags and role IDs must come from trusted adapters, never
  from user-authored message content.

## URLs and emotes

URL detection extracts bounded tokens, then uses WHATWG URL parsing and hostname
validation. HTTP, HTTPS, FTP and common bare domains are recognised. Explicit
IPv4/IPv6 links are detected; allowlist entries are domains. Allowlisting supports
exact hostnames and optional proper subdomains, with IDNA canonicalisation.
Malformed URL candidates are blocked by an enabled link rule. Invite protection
is independent of domain allowlisting.

There are no DNS, redirect or reputation checks. A dotted filename can be
syntactically indistinguishable from a domain. Deliberately obfuscated links and
non-web URI schemes are outside this detector's contract.

Unicode emoji are counted as graphemes, including ZWJ sequences, flags and keycaps.
Explicit text presentation selectors are respected. Discord custom markup is
recognised syntactically without fetching emoji. Twitch fragments or other emote
metadata can be adapted into `emotes: [{ start, end }]`, with exclusive UTF-16
offsets into the original content. Ranges must align with grapheme boundaries and
must not overlap. Identical ranges, including duplicates of Discord markup, count
once. Emote text is replaced with separators for text statistics, retaining the
original content for URL and blocked-term analysis.

## Resource limits and adapter requirements

Messages are limited to 8192 UTF-16 units, history to 256 entries and 65536 total
UTF-16 units, platform emotes to 256, allowed domains to 100 and blocked terms to
50 entries of at most 128 UTF-16 units. Rules cannot contain executable regexes.
The fixed regexes have bounded or linear scans over bounded input.

The module requires WHATWG `URL`, Unicode property escapes and `Intl.Segmenter`.
These APIs already underpin the shared package's supported runtimes. Segmentation
follows the host's ICU Unicode version; deploy compatible runtimes for equivalent
Unicode behavior across bots and dashboard previews.

Phase 2 must provide revisioned configuration caching and invalidation. Bot adapters
must bound state storage, deduplicate deliveries, supply trusted identity and time,
and establish one consistent channel owner before cross-message enforcement.
The engine does not resolve stale policy authority or cross-instance history.
Diagnostics are intended for previews; they are not a safe general-purpose logging
payload and can include hostnames. Avoid logging raw chat content or private URLs.
