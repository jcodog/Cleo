# Saved-work audit, 30 October 2026

Compared against canonical `00e43565257d29915090177edf8d376594434794`.
Inspected each stash's worktree, index and untracked trees separately. No stash
was applied, popped or deleted. All four remain available.

| Stash | Original base | Accounting |
| --- | --- | --- |
| `stash@{0}`, `5b2c99f216a4` | `88928208de69`, shared moderation merge | 19 tracked files and two untracked files. Almost entirely already incorporated by `c247434` and subsequent security fixes. Recovered only the missing account-link timestamp guard, with regression coverage. |
| `stash@{1}`, `1b06471369df` | `7525b3322851`, hosted account checkpoint | Worktree and index match their base. Untracked tree is empty. Account source and declarations are already merged through `00e4356`. No recovery needed. |
| `stash@{2}`, `0e2a9ac2f6f9` | `b020b256918d`, dashboard fixes | Nine tracked and five untracked files. Thirteen are byte-identical to current source. The community fixture contains the same recovery additions plus newer Stripe checkout scenarios in current source. Nothing missing. |
| `stash@{3}`, `f559dd7c61e0` | `34529a56b0b8`, Stripe PR merge | Only removes `NODE_USE_SYSTEM_CA=1` from the root dev script. Unrelated local preference, deliberately not recovered because it would undo the maintained HTTPS certificate fix. |

## Stash 0 file accounting

- `communityRecognition.ts`: identical, bounded suppression and delivery fencing
  already present.
- `communityRecovery.test.ts`: all six added billing/outbox regressions present.
  Current tests additionally account for transaction timestamps and fenced role
  verification. Preserve current assertions.
- `communityRoles.ts`: batched refresh exists; current source adds observed-time,
  generation, publication and worker authorization fences. Preserve current code.
- `dbTables/discordGuildMemberships.ts`: identical refresh table and index.
- `guildBilling.test.ts`, `guildConfiguration.test.ts`, `lib/auth.test.ts`:
  required linked-account and fresh timestamp fixtures already present, with
  formatting changes. Added a separate regression for the recovered guard.
- `lib/auth.ts`: same current-identity authorization, newer actionable message.
- `lib/cleoRoleEligibility.ts`: same membership checks, plus current scoped test
  qualifications. Do not replace with the older snapshot.
- `lib/communityDiscord.ts`: pagination validation already present; current
  source also accepts a separately verified OAuth token.
- `lib/discordGuildMemberships.ts`: recovered
  `managementVerifiedAt >= linkedAccount.createdAt`. Prevents pre-link evidence
  authorizing a newly linked identity before fresh Discord verification.
- `lib/stripeCommunity.ts`: nullable unpaid payment amounts already accepted;
  preserve current Stripe API version.
- `premiumActions.ts`: complete successful invoice/payment/customer/charge
  evidence checks already present. Current code additionally has Elements,
  purchaser-scoped cancellation/status and latest-invoice reconciliation.
- `queries/dashboard/discord/guilds/manageable.test.ts`: fixture changes present,
  with newer directory assertions.
- `queries/dashboard/discord/guilds/manageable.ts` and
  `queries/dashboard/discord/install/context.ts`: identical.
- `schema.ts`: refresh table present, plus newer role test-grant table.
- Untracked `communityMembershipRefresh.test.ts`: all six original cases present,
  plus newer delayed snapshot and normal dashboard verification regressions.
- Untracked `lib/discordGuildRefresh.ts`: bounded reconciliation present, plus
  newer account-creation and publication fencing. Preserve retained snapshot data
  used by current idempotency checks.
- `_generated/api.d.ts`, `_generated/dataModel.d.ts`: older declarations for the
  above functions/table, already represented by current declarations. Not copied.
  The recovered guard changes no schema or API contract, so no codegen required.

Stash 0's independent community reconciliation work was already in history. No
new moderation or other unrelated backend implementation was imported.

## Obsolete branch accounting

- `feat/jcn-255-hosted-account`: `7525b33` is an ancestor of canonical HEAD;
  no unique commits remain.
- `feat/dashboard-integration-preview`: unique commits `19ff027`, `ae09ed4` and
  `6995ef7` contain environment examples, the cherry-picked Stripe implementation,
  a generated Next instruction heading change and the handoff document. Examples
  and application code are already preserved. The heading change is generator
  noise. Recovered `docs/dashboard-billing-handoff.md` with a current status note.
- The preview's older generated API lacks the newer account declarations. It
  must not replace current generated output.

Original implementation commit history remains reachable through canonical
merges. Preview-only commit hashes are recorded here for traceability.

## Recovery validation

The new relinking regression failed before the guard and passed afterward.
All 44 focused authorization, linked-identity, membership-refresh, billing
recovery and guild-recency tests passed. Backend lint and typecheck passed.
The existing identity-sync integration test now proves old evidence is denied
and a fresh verified bot observation restores access.
