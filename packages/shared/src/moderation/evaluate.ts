import { matchBlockedWords } from "./blockedWords"
import { z } from "zod"
import {
  characterStatistics,
  phraseRepetition,
  recentMessageCounts,
} from "./detectors"
import { normalizeModerationMessage } from "./normalize"
import type { CompiledModerationPolicy } from "./policy"
import {
  MODERATION_RULE_ORDER,
  type ModerationAction,
  type ModerationDecision,
  type ModerationDetection,
  type ModerationExemptions,
  type ModerationHistoryEntry,
  type ModerationMatch,
  type ModerationMessage,
  type ModerationSeverity,
} from "./types"
import { detectUrls, isAllowedHostname, isDiscordInvite } from "./urls"

const severityRank = { none: 0, low: 1, medium: 2, high: 3 }
const recentCountsSchema = z.strictObject({
  duplicateCount: z.number().int().min(1).max(257),
  floodCount: z.number().int().min(1).max(257),
})
const actionRank = { none: 0, log: 1, warn: 2, delete: 3, timeout: 4 }

function isExempt(
  message: ModerationMessage,
  exemptions: ModerationExemptions
): boolean {
  return (
    exemptions.userIds.includes(message.authorId) ||
    (message.roleIds ?? []).some((role) => exemptions.roleIds.includes(role)) ||
    Boolean(exemptions.moderators && message.isModerator) ||
    Boolean(exemptions.administrators && message.isAdministrator)
  )
}

export function evaluateModeration({
  message,
  policy: compiled,
  history = [],
  now,
  recentCounts,
}: {
  message: ModerationMessage
  policy: CompiledModerationPolicy
  history?: readonly ModerationHistoryEntry[]
  now: number
  recentCounts?: { duplicateCount: number; floodCount: number }
}): ModerationDecision {
  if (!Number.isSafeInteger(now) || now < 0)
    throw new RangeError("Moderation time must be a nonnegative safe integer.")
  const normalized = normalizeModerationMessage(message)
  const { policy } = compiled
  const rules = policy.rules
  const statistics = characterStatistics(normalized.graphemes)
  // Validate history even with disabled rules so invalid input never silently passes.
  const historyCounts = recentMessageCounts(
    normalized,
    history,
    now,
    rules.duplicateMessages.windowMs,
    rules.flooding.windowMs
  )
  const counts =
    recentCounts === undefined
      ? historyCounts
      : recentCountsSchema.parse(recentCounts)
  const detections: ModerationDetection[] = []
  if (rules.links.enabled || rules.discordInvites.enabled) {
    const urls = detectUrls(normalized.text)
    const blocked = urls.filter(
      (url) =>
        url.hostname === null ||
        !isAllowedHostname(
          url.hostname,
          compiled.allowedDomains,
          rules.links.allowSubdomains
        )
    )
    if (blocked.length)
      detections.push({
        rule: "links",
        diagnostics: {
          blocked: blocked.length,
          invalid: blocked.filter((url) => !url.valid).length,
          hosts: [
            ...new Set(
              blocked.flatMap((url) =>
                url.hostname === null ? [] : [url.hostname]
              )
            ),
          ],
        },
      })
    const invites = urls.filter(isDiscordInvite).length
    if (invites)
      detections.push({
        rule: "discordInvites",
        diagnostics: { count: invites },
      })
  }
  if (
    statistics.letters >= rules.uppercase.minimumLetters &&
    statistics.uppercase * 100 >=
      rules.uppercase.percentage * statistics.letters
  ) {
    detections.push({
      rule: "uppercase",
      diagnostics: {
        letters: statistics.letters,
        uppercase: statistics.uppercase,
        percentage: (statistics.uppercase * 100) / statistics.letters,
      },
    })
  }
  const totalEmoji = normalized.emojiCount + normalized.emoteCount
  if (totalEmoji > rules.emojiSpam.maximum)
    detections.push({
      rule: "emojiSpam",
      diagnostics: {
        emoji: normalized.emojiCount,
        emotes: normalized.emoteCount,
        total: totalEmoji,
        maximum: rules.emojiSpam.maximum,
      },
    })
  if (
    statistics.symbols * 100 >
    rules.symbolSpam.percentage * statistics.visible
  )
    detections.push({
      rule: "symbolSpam",
      diagnostics: {
        symbols: statistics.symbols,
        visible: statistics.visible,
        percentage: (statistics.symbols * 100) / statistics.visible,
      },
    })
  if (statistics.longestRun >= rules.repeatedCharacters.minimum)
    detections.push({
      rule: "repeatedCharacters",
      diagnostics: {
        longestRun: statistics.longestRun,
        minimum: rules.repeatedCharacters.minimum,
      },
    })
  if (counts.duplicateCount >= rules.duplicateMessages.minimum)
    detections.push({
      rule: "duplicateMessages",
      diagnostics: {
        count: counts.duplicateCount,
        minimum: rules.duplicateMessages.minimum,
        windowMs: rules.duplicateMessages.windowMs,
      },
    })
  if (counts.floodCount >= rules.flooding.minimum)
    detections.push({
      rule: "flooding",
      diagnostics: {
        count: counts.floodCount,
        minimum: rules.flooding.minimum,
        windowMs: rules.flooding.windowMs,
      },
    })
  if (rules.repeatedPhrases.enabled) {
    const repeated = phraseRepetition(
      normalized.analysisText,
      rules.repeatedPhrases.minimumWords,
      rules.repeatedPhrases.maximumWords
    )
    if (repeated.repetitions >= rules.repeatedPhrases.minimumRepetitions)
      detections.push({
        rule: "repeatedPhrases",
        diagnostics: {
          ...repeated,
          minimum: rules.repeatedPhrases.minimumRepetitions,
        },
      })
  }
  if (rules.blockedWords.enabled) {
    const entryIndexes = matchBlockedWords(
      normalized.comparisonText,
      compiled.blockedWords
    )
    if (entryIndexes.length)
      detections.push({ rule: "blockedWords", diagnostics: { entryIndexes } })
  }
  const globalExemption = isExempt(normalized.original, policy.exemptions)
  const exemptRuleIds = MODERATION_RULE_ORDER.filter(
    (id) =>
      rules[id].enabled &&
      (globalExemption || isExempt(normalized.original, rules[id].exemptions))
  )
  const matches: ModerationMatch[] = []
  let severity: "none" | ModerationSeverity = "none"
  let proposedAction: ModerationAction | Readonly<{ kind: "none" }> = {
    kind: "none",
  }
  for (const detection of detections) {
    const config = rules[detection.rule]
    if (!config.enabled || exemptRuleIds.includes(detection.rule)) continue
    matches.push({
      ...detection,
      severity: config.severity,
      action: config.action,
    })
    if (severityRank[config.severity] > severityRank[severity])
      severity = config.severity
    if (
      actionRank[config.action.kind] > actionRank[proposedAction.kind] ||
      (config.action.kind === "timeout" &&
        proposedAction.kind === "timeout" &&
        config.action.durationSeconds > proposedAction.durationSeconds)
    )
      proposedAction = config.action
  }
  return {
    matched: matches.length > 0,
    ruleIds: matches.map((match) => match.rule),
    matches,
    severity,
    proposedAction,
    exemptRuleIds,
    policyRevision: policy.revision,
  }
}
