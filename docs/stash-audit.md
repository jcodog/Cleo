# Saved-work audit, 30 October 2026

Initially compared against canonical `00e43565257d29915090177edf8d376594434794`,
then rechecked against `e14b6d8063447e7526d7c4a6f7252dcfcc00b2aa` and the PR #284
repair. Worktree, index, untracked trees and original bases were inspected
individually. No stash was applied or popped. The maintainer now authorises
removal once this accounting and the necessary recovery are committed, validated
and pushed. The original stash hashes below identify the audited snapshots even
after their stash references are removed.

| Stash | Original base | Accounting |
| --- | --- | --- |
| `stash@{0}`, `5b2c99f216a4` | `88928208de69`, shared moderation merge | 19 tracked files and two untracked files. Almost entirely already incorporated by `c247434` and subsequent security fixes. Recovered only the missing account-link timestamp guard, with regression coverage. |
| `stash@{1}`, `1b06471369df` | `7525b3322851`, hosted account checkpoint | Worktree and index match their base. Untracked tree is empty. Account source and declarations are already merged through `00e4356`. No recovery needed. |
| `stash@{2}`, `0e2a9ac2f6f9` | `b020b256918d`, dashboard fixes | Nine tracked and five untracked files. Recovery implementation and tests are already incorporated. Current Clerk, navigation and community fixtures include newer account/checkout changes. Nothing missing. |
| `stash@{3}`, `f559dd7c61e0` | `34529a56b0b8`, Stripe PR merge | Only removes `NODE_USE_SYSTEM_CA=1` from the root dev script. Obsolete local preference that would undo the maintained HTTPS certificate fix. Its exact unique patch is preserved in `docs/archive/stash-pre-consolidation-dev.patch`, rather than applied to the dev script. |

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

## PR #284 recheck and cleanup evidence

- Stash 0: all 21 files accounted for above. The previously recovered timestamp
  guard is now byte-identical to the stash's membership helper. Newer generation,
  identity, publication and billing security fences remain in place. No unrelated
  backend work was introduced during this repair.
- Stash 1: original base is the preserved account commit `7525b3322851`; index,
  tracked and untracked deltas are all empty. Its ancestry was verified again.
- Stash 2: all nine tracked and five untracked paths exist. Eleven are byte-identical
  after normalising line endings; three fixture/test files retain later additions.
  The session-recovery source remains unchanged by this repair.
- Stash 3 has no untracked parent and an empty index delta. The archive contains
  the complete original `git diff stash^1 stash -- package.json` output.
- Generated declarations were regenerated from the current Convex source; only
  the new safe billing configuration result contract changes the API declaration.
- The earlier recovered authorization guard and its tests were already signed
  and pushed in `837c7c2`. This repair adds no additional missing stash code.
- Only `main` and `feat/cleo-dashboard-account-billing` remain locally and on
  origin. The canonical branch tracks its namesake remote. No extra worktree was
  created, and original implementation commits remain reachable.

After the repair's signed commit is pushed and verified, all four stash references
can be safely dropped. The final PR checkpoint records the observed empty stash
list. No unique source or documentation depends on those references.
