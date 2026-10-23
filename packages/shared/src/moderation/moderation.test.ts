import assert from "node:assert/strict"
import { test } from "node:test"
import {
  compileModerationPolicy,
  evaluateModeration,
  normalizeModerationMessage,
  moderationMessageSchema,
  moderationPolicySchema,
  moderationActionSchema,
  moderationExemptionsSchema,
  blockedWordSchema,
  MODERATION_LIMITS,
  MODERATION_RULE_ORDER,
  type ModerationHistoryEntry,
  type ModerationMessage,
  type ModerationRuleId,
} from "@workspace/shared/moderation"
import * as shared from "@workspace/shared"
import {
  detectUrls,
  isAllowedHostname,
  isDiscordInvite,
  normalizeAllowedDomain,
} from "./urls"

const NOW = 100000
const message = (
  content: string,
  extra: Partial<ModerationMessage> = {}
): ModerationMessage => ({
  id: "current",
  scopeId: "community:channel",
  authorId: "viewer",
  content,
  ...extra,
})
const historyEntry = (
  id: string,
  timestamp = NOW,
  content = "hello",
  extra: Partial<ModerationHistoryEntry> = {}
): ModerationHistoryEntry => ({
  id,
  timestamp,
  content,
  scopeId: "community:channel",
  authorId: "viewer",
  ...extra,
})
function run(
  content: string,
  rules: Record<string, unknown> = {},
  extra: {
    message?: Partial<ModerationMessage>
    history?: readonly ModerationHistoryEntry[]
    now?: number
    exemptions?: unknown
  } = {}
) {
  return evaluateModeration({
    message: message(content, extra.message),
    policy: compileModerationPolicy({
      rules,
      ...(extra.exemptions === undefined
        ? {}
        : { exemptions: extra.exemptions }),
    }),
    history: extra.history,
    now: extra.now ?? NOW,
  })
}
const enabled = (
  id: ModerationRuleId,
  settings: Record<string, unknown> = {}
) => ({ [id]: { enabled: true, ...settings } })

test("public exports are usable from the shared entry point with safe defaults", () => {
  assert.equal(shared.evaluateModeration, evaluateModeration)
  assert.equal(shared.compileModerationPolicy, compileModerationPolicy)
  const compiled = compileModerationPolicy()
  assert.equal(compiled.policy.revision, 0)
  for (const rule of Object.values(compiled.policy.rules)) {
    assert.equal(rule.enabled, false)
    assert.deepEqual(rule.action, { kind: "log" })
  }
  assert.deepEqual(
    evaluateModeration({
      message: message("BAD BAD BAD https://evil.example 😀😀😀😀😀😀"),
      policy: compiled,
      now: NOW,
    }),
    {
      matched: false,
      ruleIds: [],
      matches: [],
      severity: "none",
      proposedAction: { kind: "none" },
      exemptRuleIds: [],
      policyRevision: 0,
    }
  )
  assert.equal(moderationPolicySchema.parse({}).rules.uppercase.percentage, 75)
  assert.deepEqual(moderationActionSchema.parse({ kind: "warn" }), {
    kind: "warn",
  })
  assert.equal(moderationExemptionsSchema.parse({}).moderators, false)
  assert.equal(blockedWordSchema.parse({ term: "word" }).wholeWord, true)
  assert.equal(MODERATION_LIMITS.blockedEntries, 50)
})

test("empty and short messages do not trigger ordinary thresholds", () => {
  const rules = Object.fromEntries(
    MODERATION_RULE_ORDER.map((id) => [id, { enabled: true }])
  )
  for (const content of ["", " ", "\n\t", "hi", "HI", "\u200b\u200c\u200d"]) {
    assert.deepEqual(run(content, rules).ruleIds, [], JSON.stringify(content))
  }
  assert.deepEqual(run("😀", enabled("emojiSpam", { maximum: 0 })).ruleIds, [
    "emojiSpam",
  ])
})

test("message validation rejects oversized text, identity lists and invalid emote offsets", () => {
  assert.equal(
    normalizeModerationMessage(message("x".repeat(8192))).text.length,
    8192
  )
  assert.throws(() => run("x".repeat(8193)), /8192/)
  for (const invalid of [
    { ...message(""), extra: true },
    { ...message(""), id: "" },
    { ...message(""), scopeId: "" },
    { ...message(""), authorId: "" },
    { ...message(""), content: null },
    { ...message(""), roleIds: Array(101).fill("role") },
    { ...message(""), emotes: Array(257).fill({ start: 0, end: 1 }) },
    { ...message(""), emotes: [{ start: -1, end: 1 }] },
    { ...message(""), isModerator: "yes" },
  ])
    assert.equal(moderationMessageSchema.safeParse(invalid).success, false)
  assert.throws(
    () => run("x", {}, { message: { emotes: [{ start: 0, end: 2 }] } }),
    /graphemes/
  )
  assert.throws(
    () => run("x", {}, { message: { emotes: [{ start: 1, end: 1 }] } }),
    /graphemes/
  )
  assert.throws(
    () => run("😀", {}, { message: { emotes: [{ start: 0, end: 1 }] } }),
    /graphemes/
  )
  assert.throws(
    () => run("e\u0301", {}, { message: { emotes: [{ start: 0, end: 1 }] } }),
    /graphemes/
  )
  assert.throws(
    () =>
      run(
        "Kappa!",
        {},
        {
          message: {
            emotes: [
              { start: 0, end: 4 },
              { start: 2, end: 5 },
            ],
          },
        }
      ),
    /overlap/
  )
})

test("normalisation preserves original content and invisible separators", () => {
  const original = message("  CAFÉ\tCafe\u0301\n\u200bword\u200d ")
  const normalized = normalizeModerationMessage(original)
  assert.equal(normalized.original.content, original.content)
  assert.equal(normalized.text, "  CAFÉ\tCafé\n\u200bword\u200d ")
  assert.equal(normalized.comparisonText, "café café \u200bword\u200d")
  assert.equal(Object.isFrozen(normalized), true)
  assert.equal(Object.isFrozen(normalized.graphemes), true)
})

test("uppercase uses an inclusive percentage and minimum letter count", () => {
  const rules = enabled("uppercase")
  assert.equal(run("ABCDEFgh", rules).matched, true)
  assert.equal(run("ABCDEfgh", rules).matched, false)
  assert.equal(run("ABCDEFG", rules).matched, false)
  assert.equal(run("ABCDEFG!", rules).matched, false)
  assert.deepEqual(run("ABCDEFgh", rules).matches[0]?.diagnostics, {
    letters: 8,
    uppercase: 6,
    percentage: 75,
  })
  assert.equal(
    run("A", enabled("uppercase", { minimumLetters: 1, percentage: 100 }))
      .matched,
    true
  )
  assert.equal(
    run("abcdefgh", enabled("uppercase", { percentage: 0 })).matched,
    true
  )
  assert.equal(run("éÉÅÄÖÜaB", rules).matched, true)
  assert.equal(run("中文日本語漢字文", rules).matched, false)
  assert.equal(
    run("", enabled("uppercase", { minimumLetters: 1, percentage: 0 })).matched,
    false
  )
})

test("emoji counts graphemes, flags, modifiers, keycaps and presentation selectors", () => {
  const rules = enabled("emojiSpam")
  const emoji = ["👨‍👩‍👧‍👦", "👍🏽", "🇬🇧", "1️⃣", "🏳️‍🌈", "❤️"]
  assert.equal(run(emoji.slice(0, 5).join(""), rules).matched, false)
  const result = run(emoji.join(""), rules)
  assert.deepEqual(result.matches[0]?.diagnostics, {
    emoji: 6,
    emotes: 0,
    total: 6,
    maximum: 5,
  })
  assert.equal(
    run("12345 # * ©\ufe0e", enabled("emojiSpam", { maximum: 0 })).matched,
    false
  )
  assert.equal(run("x", enabled("emojiSpam", { maximum: 0 })).matched, false)
})

test("Discord markup and platform emote ranges count once without distorting text detectors", () => {
  const custom = "<:LOUDNAME:12345678901234567>"
  const animated = "<a:dance:12345678901234568>"
  assert.equal(
    normalizeModerationMessage(message(custom.repeat(6))).emoteCount,
    6
  )
  assert.equal(run(custom.repeat(6), enabled("emojiSpam")).matched, true)
  const result = run(
    `${custom}${animated}😀`,
    enabled("emojiSpam", { maximum: 2 }),
    {
      message: { emotes: [{ start: 0, end: custom.length }] },
    }
  )
  assert.deepEqual(result.matches[0]?.diagnostics, {
    emoji: 1,
    emotes: 2,
    total: 3,
    maximum: 2,
  })
  assert.equal(run(custom.repeat(6), enabled("uppercase")).matched, false)
  const content = "Kappa 😀 Keepo!"
  const normalized = normalizeModerationMessage(
    message(content, {
      emotes: [
        { start: 9, end: 14 },
        { start: 0, end: 5 },
        { start: 0, end: 5 },
      ],
    })
  )
  assert.equal(normalized.emoteCount, 2)
  assert.equal(normalized.emojiCount, 1)
  assert.equal(normalized.analysisText, "  😀  !")
  assert.equal(
    run(content, enabled("emojiSpam", { maximum: 2 }), {
      message: {
        emotes: [
          { start: 0, end: 5 },
          { start: 9, end: 14 },
        ],
      },
    }).matched,
    true
  )
  assert.equal(
    normalizeModerationMessage(
      message("😀 end", { emotes: [{ start: 0, end: 2 }] })
    ).emojiCount,
    0
  )
})

test("symbol spam excludes whitespace and uses a strict greater-than threshold", () => {
  const rules = enabled("symbolSpam")
  assert.equal(run("!!!ab", rules).matched, false)
  assert.equal(run("!!!!ab", rules).matched, true)
  assert.equal(run("!!!!ab       ", rules).matched, true)
  assert.equal(run("éø中123", rules).matched, false)
  assert.equal(
    run(" \u200b ", enabled("symbolSpam", { percentage: 0 })).matched,
    false
  )
  assert.equal(run("😀!", rules).matched, true)
  assert.equal(
    run("a!", enabled("symbolSpam", { percentage: 50 })).matched,
    false
  )
  assert.equal(
    run("a!", enabled("symbolSpam", { percentage: 49.99 })).matched,
    true
  )
})

test("repeated characters use graphemes and canonical visual forms", () => {
  const rules = enabled("repeatedCharacters")
  assert.equal(run("aaaaa", rules).matched, false)
  assert.equal(run("aaaaaa", rules).matched, true)
  assert.equal(run("xxaaaaaa!", rules).matched, true)
  assert.equal(run("a a a a a a", rules).matched, false)
  assert.equal(run("a\na\ta\na a a", rules).matched, false)
  assert.equal(run("a\u200ba\u200ba\u200ba\u200ba\u200ba", rules).matched, true)
  assert.equal(run("e\u0301ééééé", rules).matched, true)
  assert.equal(run("ééééée", rules).matched, false)
  assert.equal(run("aａaａaａ", rules).matched, true)
  for (const separator of ["\u200b", "\u200c", "\u200d", "\ufe0f"]) {
    assert.equal(run(("a" + separator).repeat(5) + "a", rules).matched, true)
  }
  assert.equal(run("👨‍👩‍👧‍👦".repeat(6), rules).matched, true)
  assert.equal(run("AaAaAa", rules).matched, false)
  assert.equal(
    run("xx", enabled("repeatedCharacters", { minimum: 2 })).matched,
    true
  )
})

test("repeated phrases require consecutive word sequences with bounded configurable widths", () => {
  const rules = enabled("repeatedPhrases")
  assert.equal(run("buy now buy now", rules).matched, false)
  assert.equal(run("buy now buy now buy now", rules).matched, true)
  assert.equal(run("Buy now! BUY NOW, buy now.", rules).matched, true)
  assert.equal(
    run("buy now then buy now then something else", rules).matched,
    false
  )
  assert.equal(run("a a a", rules).matched, false)
  assert.equal(
    run("a a a", enabled("repeatedPhrases", { minimumWords: 1 })).matched,
    true
  )
  assert.equal(
    run(
      "one two one two one two",
      enabled("repeatedPhrases", { minimumWords: 3, maximumWords: 3 })
    ).matched,
    false
  )
  assert.equal(
    run(
      "one two three one two three one two three",
      enabled("repeatedPhrases", { minimumWords: 3, maximumWords: 3 })
    ).matched,
    true
  )
  assert.equal(run("hello", rules).matched, false)
  assert.equal(run("", rules).matched, false)
  assert.equal(
    run(
      "hello hello there hello",
      enabled("repeatedPhrases", { minimumWords: 1, minimumRepetitions: 2 })
    ).matched,
    true
  )
  assert.equal(run("café bon cafe\u0301 bon café bon", rules).matched, true)
})

test("blocked terms are literal, canonical, case-insensitive and whole-word by default", () => {
  const rules = enabled("blockedWords", {
    entries: [
      { term: "BAD" },
      { term: "buy now" },
      { term: "café" },
      { term: "a+b.*" },
      { term: "猫" },
    ],
  })
  for (const content of [
    "bad",
    "a BAD!",
    "buy\tNOW",
    "cafe\u0301",
    "a+b.*",
    "猫",
  ])
    assert.equal(run(content, rules).matched, true, content)
  for (const content of [
    "badger",
    "notbad",
    "bad_word",
    "bad2",
    "2bad",
    "bäd",
    "b\u200bad",
    "abZZ",
    "猫咪",
    "犬猫",
    "𐐀bad",
    "bad𐐀",
    "bad\u0301",
  ])
    assert.equal(run(content, rules).matched, false, content)
  assert.equal(
    run(
      "badger",
      enabled("blockedWords", { entries: [{ term: "bad", wholeWord: false }] })
    ).matched,
    true
  )
  assert.equal(run("badger BAD", rules).matched, true)
  assert.deepEqual(run("bad buy now café", rules).matches[0]?.diagnostics, {
    entryIndexes: [0, 1, 2],
  })
  assert.equal(run("good", enabled("blockedWords")).matched, false)
  assert.equal(
    run("bad bad bad", enabled("blockedWords", { entries: [{ term: "bad" }] }))
      .matches.length,
    1
  )
  assert.equal(
    run("foo bar", enabled("blockedWords", { entries: [{ term: "foobar" }] }))
      .matched,
    false
  )
})

test("blocked word compilation rejects duplicates, invisible terms, regex objects and excess entries", () => {
  for (const entries of [
    [{ term: "bad" }, { term: " BAD " }],
    [{ term: "café" }, { term: "cafe\u0301" }],
    [{ term: "buy  now" }, { term: "BUY\tNOW" }],
    [{ term: " " }],
    [{ term: "\u200b\u200d" }],
    [{ term: "" }],
    [{ term: "x".repeat(129) }],
    Array(51).fill({ term: "x" }),
    [{ term: /bad/ }],
    [{ term: "bad", regex: true }],
  ])
    assert.throws(() =>
      compileModerationPolicy({ rules: { blockedWords: { entries } } })
    )
  assert.equal(
    compileModerationPolicy({
      rules: { blockedWords: { entries: [{ term: "x".repeat(128) }] } },
    }).blockedWords[0]?.term.length,
    128
  )
  assert.equal(
    compileModerationPolicy({
      rules: {
        blockedWords: {
          entries: Array.from({ length: 50 }, (_, i) => ({
            term: `entry${i}`,
          })),
        },
      },
    }).blockedWords.length,
    50
  )
})

test("URL candidates include common bare domains, punctuation, IDNs and explicit network addresses", () => {
  const rules = enabled("links")
  for (const content of [
    "https://example.com/path",
    "http://example.com",
    "ftp://example.com/file",
    "example.com",
    "www.example.com/path?q=yes",
    "(example.com).",
    "[https://example.com/test]",
    "see:https://example.com",
    "example.com:8080/path",
    "https://example.com./",
    "例え.テスト",
    "bücher.example",
    "example。com",
    "https://127.0.0.1/x",
    "http://[::1]/",
    "https://user:pass@example.com",
  ])
    assert.equal(run(content, rules).matched, true, content)
  for (const content of [
    "ordinary text",
    "person@example.com",
    "version 1.2.3",
    "docs/example.com",
    "localhost",
    "123.456",
  ])
    assert.equal(run(content, rules).matched, false, content)
  assert.deepEqual(
    run("example.com example.com", rules).matches[0]?.diagnostics,
    { blocked: 2, invalid: 0, hosts: ["example.com"] }
  )
})

test("domain allowlists use canonical hostnames and exact subdomain boundaries", () => {
  const rules = enabled("links", {
    allowedDomains: ["Example.COM", "bücher.example"],
  })
  for (const content of [
    "https://example.com/path",
    "sub.example.com",
    "https://example.com./",
    "https://xn--bcher-kva.example",
    "https://example.com\\@evil.com",
  ])
    assert.equal(run(content, rules).matched, false, content)
  for (const content of [
    "example.com.evil.com",
    "evil-example.com",
    "https://example.com@evil.com",
    "https://example.com!@evil.com",
    "https://example.com;@evil.com",
    "https://example.com,@evil.com",
    "https://example.com)@evil.com",
    "https://example.com'@evil.com",
    "https://example.com*~@evil.com",
    "https://example.com.evil.com/path",
    "https://ｅxample.com.evil.com",
    "https://еxample.com",
  ])
    assert.equal(run(content, rules).matched, true, content)
  const exact = enabled("links", {
    allowedDomains: ["example.com"],
    allowSubdomains: false,
  })
  assert.equal(run("example.com", exact).matched, false)
  assert.equal(run("sub.example.com", exact).matched, true)
  assert.equal(isAllowedHostname("sub.example.com", ["other.com"], true), false)
  for (const content of [
    "(example.com).",
    "[https://example.com]",
    "**example.com**",
    "“example.com”",
    "'example.com'",
  ]) {
    assert.equal(run(content, rules).matched, false, content)
  }
  assert.deepEqual(
    compileModerationPolicy({
      rules: { links: { allowedDomains: ["EXAMPLE.COM", "example.com."] } },
    }).allowedDomains,
    ["example.com"]
  )
})

test("malformed URLs are conservatively blocked and never gain an allowlist match", () => {
  const rules = enabled("links", { allowedDomains: ["example.com"] })
  for (const content of [
    "https://",
    "https://%",
    "https://example.com:bad",
    "example..com",
    "-example.com",
    "example-.com",
    "https://bad_host.example",
    "https://localhost",
    "https://a.c",
    "https://[bad]",
  ]) {
    const result = run(content, rules)
    assert.equal(result.matched, true, content)
    const detection = result.matches[0]
    assert.equal(detection?.rule, "links")
    if (detection?.rule === "links")
      assert.equal(detection.diagnostics.invalid, 1)
  }
  assert.equal(detectUrls("https://")[0]?.valid, false)
})

test("domain configuration rejects URL-shaped, malformed and excessive entries", () => {
  for (const domain of [
    "",
    "localhost",
    "*.example.com",
    "https://example.com",
    "example.com/path",
    "example.com:443",
    "person@example.com",
    "example.com?x",
    "example.com#x",
    "example%2ecom",
    "example.com\\evil",
    "example..com",
    "-example.com",
    "bad_host.com",
    "example.c",
    "127.0.0.1",
    "[::1]",
    " example.com",
    "x".repeat(64) + ".com",
    "\ud800.com",
    "xn--.com",
  ]) {
    assert.equal(normalizeAllowedDomain(domain), null, domain)
    assert.throws(
      () =>
        compileModerationPolicy({
          rules: { links: { allowedDomains: [domain] } },
        }),
      domain
    )
  }
  assert.equal(
    normalizeAllowedDomain("BÜCHER.example."),
    "xn--bcher-kva.example"
  )
  assert.throws(() =>
    compileModerationPolicy({
      rules: { links: { allowedDomains: Array(101).fill("example.com") } },
    })
  )
})

test("Discord invites are detected independently of link allowlists", () => {
  const rules = {
    ...enabled("discordInvites"),
    links: {
      enabled: true,
      allowedDomains: ["discord.gg", "discord.com", "discordapp.com"],
    },
  }
  for (const content of [
    "discord.gg/code",
    "https://discord.gg/code",
    "discord.com/invite/code",
    "https://canary.discord.com/invite/code",
    "discordapp.com/invite/code",
  ])
    assert.deepEqual(run(content, rules).ruleIds, ["discordInvites"], content)
  for (const content of [
    "discord.gg",
    "discord.com/invite/",
    "discord.com/channels/123",
    "notdiscord.gg/code",
    "discord.gg.evil.com/code",
    "example.com/invite/code",
    "https://[bad]",
  ])
    assert.equal(
      run(content, enabled("discordInvites")).matched,
      false,
      content
    )
  assert.equal(
    isDiscordInvite({ valid: false, hostname: null, pathname: "/code" }),
    false
  )
  assert.equal(run("discord.gg/code", enabled("links")).matched, true)
  assert.deepEqual(
    run("discord.gg/code", {
      ...enabled("links"),
      ...enabled("discordInvites"),
    }).ruleIds,
    ["links", "discordInvites"]
  )
})

test("duplicates count the current message once, fold canonical text and expire at the boundary", () => {
  const rules = enabled("duplicateMessages")
  const recent = [
    historyEntry("one", NOW - 30000),
    historyEntry("two", NOW - 1),
  ]
  assert.equal(run("HELLO", rules, { history: recent }).matched, true)
  assert.equal(run("hello", rules, { history: recent.slice(1) }).matched, false)
  assert.equal(
    run("hello", rules, {
      history: [historyEntry("one", NOW - 30001), recent[1]!],
    }).matched,
    false
  )
  assert.equal(
    run("hello", rules, { history: [historyEntry("one"), historyEntry("one")] })
      .matched,
    false
  )
  assert.equal(
    run("hello", rules, {
      history: [historyEntry("current"), historyEntry("one")],
    }).matched,
    false
  )
  assert.equal(
    run("café now", rules, {
      history: [
        historyEntry("one", NOW, "CAFE\u0301\tNOW"),
        historyEntry("two", NOW, "café now"),
      ],
    }).matched,
    true
  )
  assert.equal(
    run("hello", rules, {
      history: [historyEntry("one"), historyEntry("two", NOW, "different")],
    }).matched,
    false
  )
  assert.equal(
    run("hello", enabled("duplicateMessages", { minimum: 2, windowMs: 1 }), {
      history: [historyEntry("one", NOW - 1)],
    }).matched,
    true
  )
})

test("history cannot cross users, channels, future timestamps or the flood window", () => {
  const rules = enabled("flooding")
  const recent = Array.from({ length: 4 }, (_, i) =>
    historyEntry(String(i), NOW - 10000, `different ${i}`)
  )
  assert.equal(run("current text", rules, { history: recent }).matched, true)
  assert.equal(
    run("current text", rules, { history: recent.slice(1) }).matched,
    false
  )
  for (const extra of [
    { scopeId: "other:channel" },
    { authorId: "another" },
    { timestamp: NOW + 1 },
    { timestamp: NOW - 10001 },
  ])
    assert.equal(
      run("hello", rules, {
        history: recent.map((entry) => ({ ...entry, ...extra })),
      }).matched,
      false
    )
  assert.equal(
    run("hello", enabled("flooding", { minimum: 2 }), {
      history: [historyEntry("one", NOW - 1)],
    }).matched,
    true
  )
})

test("history and explicit clocks are bounded and validated even with disabled rules", () => {
  assert.throws(() =>
    run(
      "x",
      {},
      {
        history: Array.from({ length: 257 }, (_, i) => historyEntry(String(i))),
      }
    )
  )
  assert.throws(
    () =>
      run(
        "x",
        {},
        {
          history: Array.from({ length: 9 }, (_, i) =>
            historyEntry(String(i), NOW, "x".repeat(8192))
          ),
        }
      ),
    /budget/
  )
  assert.equal(
    run(
      "x",
      {},
      {
        history: Array.from({ length: 8 }, (_, i) =>
          historyEntry(String(i), NOW, "x".repeat(8192))
        ),
      }
    ).matched,
    false
  )
  assert.equal(
    run(
      "x",
      {},
      {
        history: Array.from({ length: 256 }, (_, i) =>
          historyEntry(String(i), NOW, "")
        ),
      }
    ).matched,
    false
  )
  assert.throws(() => run("x", {}, { history: [historyEntry("one", -1)] }))
  assert.throws(() =>
    run("x", {}, { history: [historyEntry("one", NOW, "x".repeat(8193))] })
  )
  for (const now of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => run("x", {}, { now }), /safe integer/)
  assert.equal(run("x", {}, { now: 0 }).matched, false)
})

test("global and rule exemptions use trusted adapter identity evidence", () => {
  const rules = {
    ...enabled("repeatedCharacters"),
    ...enabled("blockedWords", { entries: [{ term: "aaaaaa" }] }),
  }
  for (const extra of [
    { message: { isModerator: true } },
    { message: { isAdministrator: true } },
    { exemptions: { userIds: ["viewer"] } },
    { exemptions: { roleIds: ["trusted"] }, message: { roleIds: ["trusted"] } },
  ]) {
    const result = run("aaaaaa", rules, extra)
    assert.equal(result.matched, false)
    assert.deepEqual(result.exemptRuleIds, [
      "repeatedCharacters",
      "blockedWords",
    ])
  }
  assert.equal(
    run("aaaaaa", rules, {
      exemptions: { moderators: false, administrators: false },
      message: {
        isModerator: true,
        isAdministrator: true,
        roleIds: ["unrelated"],
      },
    }).matches.length,
    2
  )
  const perRule = {
    ...rules,
    repeatedCharacters: { enabled: true, exemptions: { userIds: ["viewer"] } },
  }
  assert.deepEqual(run("aaaaaa", perRule).ruleIds, ["blockedWords"])
  assert.equal(
    run(
      "aaaaaa",
      enabled("repeatedCharacters", { exemptions: { moderators: true } }),
      { exemptions: { moderators: false }, message: { isModerator: true } }
    ).matched,
    false
  )
  assert.equal(
    run(
      "aaaaaa",
      enabled("repeatedCharacters", { exemptions: { administrators: true } }),
      {
        exemptions: { administrators: false },
        message: { isAdministrator: true },
      }
    ).matched,
    false
  )
  assert.equal(
    run(
      "aaaaaa",
      enabled("repeatedCharacters", { exemptions: { roleIds: ["trusted"] } }),
      { message: { roleIds: ["trusted"] } }
    ).matched,
    false
  )
})

test("all matches have stable ordering and strongest action and severity selection", () => {
  const content =
    "AAAAAA AA AAAAAA AA AAAAAA AA AAAAAAAAAAAAAAAAAAAAAAAA discord.gg/code 😀😀😀😀😀😀 !!!!!!"
  const rules: Record<string, unknown> = Object.fromEntries(
    [...MODERATION_RULE_ORDER].reverse().map((id) => [id, { enabled: true }])
  )
  rules.blockedWords = { enabled: true, entries: [{ term: "AAAAAA" }] }
  rules.symbolSpam = { enabled: true, percentage: 0 }
  const history = Array.from({ length: 4 }, (_, i) =>
    historyEntry(String(i), NOW, content)
  )
  const first = run(content, rules, { history })
  assert.deepEqual(first.ruleIds, MODERATION_RULE_ORDER)
  assert.deepEqual(first, run(content, rules, { history }))
  assert.deepEqual(first.proposedAction, { kind: "log" })
  assert.equal(first.severity, "medium")
  const competing = {
    links: { enabled: true, severity: "high", action: { kind: "warn" } },
    repeatedCharacters: {
      enabled: true,
      severity: "low",
      action: { kind: "delete" },
    },
    blockedWords: {
      enabled: true,
      entries: [{ term: "aaaaaa" }],
      action: { kind: "timeout", durationSeconds: 10 },
    },
  }
  const result = run("aaaaaa example.com", competing)
  assert.equal(result.severity, "high")
  assert.deepEqual(result.proposedAction, {
    kind: "timeout",
    durationSeconds: 10,
  })
  for (const durationSeconds of [5, 10, 20]) {
    const tie = run("aaaaaa example.com", {
      ...competing,
      links: {
        enabled: true,
        action: { kind: "timeout", durationSeconds: 10 },
      },
      blockedWords: {
        ...competing.blockedWords,
        action: { kind: "timeout", durationSeconds },
      },
    })
    assert.deepEqual(tie.proposedAction, {
      kind: "timeout",
      durationSeconds: Math.max(10, durationSeconds),
    })
  }
  const compiled = compileModerationPolicy({
    revision: 42,
    rules: enabled("links"),
  })
  assert.equal(
    evaluateModeration({
      message: message("example.com"),
      policy: compiled,
      now: NOW,
    }).policyRevision,
    42
  )
})

test("policy parsing rejects malformed values without coercion or executable expressions", () => {
  for (const input of [
    null,
    [],
    false,
    "policy",
    { unknown: true },
    { revision: -1 },
    { revision: 1.5 },
    { revision: Infinity },
    { rules: { unknown: {} } },
    { exemptions: { userIds: Array(101).fill("x") } },
  ])
    assert.throws(() => compileModerationPolicy(input))
  for (const [id, setting] of [
    ["uppercase", { percentage: 101 }],
    ["uppercase", { percentage: -1 }],
    ["uppercase", { minimumLetters: 0 }],
    ["uppercase", { percentage: NaN }],
    ["links", { enabled: "true" }],
    ["links", { severity: "critical" }],
    ["links", { action: { kind: "ban" } }],
    ["links", { action: { kind: "timeout", durationSeconds: 0 } }],
    ["links", { action: { kind: "timeout", durationSeconds: 2419201 } }],
    ["links", { action: { kind: "delete", durationSeconds: 1 } }],
    ["repeatedCharacters", { minimum: 1 }],
    ["duplicateMessages", { windowMs: 0 }],
    ["flooding", { windowMs: 300001 }],
    ["flooding", { minimum: 257 }],
    ["flooding", { minimum: 1 }],
    ["emojiSpam", { maximum: -1 }],
    ["repeatedPhrases", { minimumWords: 0 }],
    ["repeatedPhrases", { maximumWords: 17 }],
    ["repeatedPhrases", { minimumWords: 3, maximumWords: 2 }],
    ["blockedWords", { entries: null }],
  ])
    assert.throws(() =>
      compileModerationPolicy({ rules: { [String(id)]: setting } })
    )
})

test("evaluation and policy compilation do not mutate caller inputs or reuse mutable result state", () => {
  const input = {
    revision: 7,
    rules: {
      links: { enabled: true, allowedDomains: ["EXAMPLE.COM"] },
      blockedWords: { enabled: true, entries: [{ term: "BAD" }] },
    },
  }
  const before = structuredClone(input)
  const compiled = compileModerationPolicy(input)
  assert.deepEqual(input, before)
  input.rules.links.allowedDomains[0] = "evil.com"
  input.rules.blockedWords.entries[0]!.term = "GOOD"
  assert.deepEqual(compiled.allowedDomains, ["example.com"])
  assert.equal(compiled.blockedWords[0]?.term, "bad")
  for (const object of [
    compiled,
    compiled.policy,
    compiled.policy.rules,
    compiled.policy.rules.links,
    compiled.policy.rules.links.allowedDomains,
    compiled.policy.rules.links.exemptions,
    compiled.policy.rules.links.exemptions.userIds,
    compiled.blockedWords,
    compiled.blockedWords[0],
  ])
    assert.equal(Object.isFrozen(object), true)
  const msg = message("BAD example.com", { emotes: [], roleIds: ["ordinary"] })
  const history = [historyEntry("one")]
  const snapshot = structuredClone({ msg, history })
  const result = evaluateModeration({
    message: msg,
    policy: compiled,
    history,
    now: NOW,
  })
  assert.deepEqual({ msg, history }, snapshot)
  assert.deepEqual(result.ruleIds, ["blockedWords"])
  assert.deepEqual(
    evaluateModeration({
      message: message("GOOD"),
      policy: compiled,
      history: [],
      now: NOW,
    }).ruleIds,
    []
  )
})

test(
  "bounded adversarial evaluation with fifty compiled literal terms stays local",
  { timeout: 10000 },
  (context) => {
    const terms = Array.from({ length: 50 }, (_, i) => ({
      term: `literal${i}+(a+)+$`,
    }))
    const compiled = compileModerationPolicy({
      rules: {
        links: { enabled: true },
        repeatedPhrases: { enabled: true, minimumWords: 1, maximumWords: 16 },
        blockedWords: { enabled: true, entries: terms },
      },
    })
    const reference = compiled.blockedWords
    const started = performance.now()
    const cases = [
      "a".repeat(8192),
      "a ".repeat(4096),
      ".".repeat(8192),
      "https://" + "a".repeat(8184),
      "<a:" + "x".repeat(8189),
      "\u0301".repeat(8192),
    ]
    for (let iteration = 0; iteration < 3; iteration++) {
      for (const content of cases)
        evaluateModeration({
          message: message(content),
          policy: compiled,
          now: NOW,
        })
    }
    assert.equal(compiled.blockedWords, reference)
    assert.equal(
      run("literal49+(a+)+$", enabled("blockedWords", { entries: terms }))
        .matched,
      true
    )
    context.diagnostic(
      `18 maximum-length evaluations with 50 compiled terms: ${(performance.now() - started).toFixed(1)}ms`
    )
    const overlapping = compileModerationPolicy({
      rules: enabled("blockedWords", {
        entries: Array.from({ length: 50 }, (_, index) => ({
          term: "a".repeat(index + 1),
        })),
      }),
    })
    const overlapStarted = performance.now()
    assert.equal(
      evaluateModeration({
        message: message("a".repeat(8192)),
        policy: overlapping,
        now: NOW,
      }).matched,
      false
    )
    context.diagnostic(
      `50 overlapping whole-word terms against 8192 letters: ${(performance.now() - overlapStarted).toFixed(1)}ms`
    )
  }
)
