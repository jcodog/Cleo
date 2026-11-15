# Issue #288 / JCN-261 implementation evidence

Initial checkpoint: 15 November 2026, commit `4e6039c`. This is a **NO-GO release receipt**. It is not permission
to merge, enable checkout/catalogue writes, change live webhooks or deploy
production.

## Source and scope

- Existing branch: `perf/convex-community-role-io`, PR #285 targeting PR #284's
  `feat/cleo-dashboard-account-billing` branch.
- Starting combined HEAD: `f21400520d23342e2c4fb08b47e9943799f871c6`.
- Stacked base: `6034a41e2842cacd845c1a2627d77d2124f4dac4`.
- Validated implementation tree, before adding this evidence document:
  `7bee5583621e3aaa23e0eeaefa57e6cb4dd8f379`.
- Validation used a detached checkout containing only the staged revision.
  Unrelated working-tree navigation, profile, shell, screenshots and other edits
  were excluded. Relevant existing SetupIntent/reconnection fixes were retained
  as minimal hunks rather than committing the surrounding UI rewrite.
- No branch creation, force-push, history rewrite, merge, production deployment,
  production configuration or financial feature enablement was performed.

The signed revision, GitHub verification result and exact-SHA hosted CI receipts
belong in PR #285's conversation. This document cannot contain its own commit
hash. A later evidence-only revision does not change the validated implementation.

## Review findings

| Finding                                   | Implementation and evidence                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #284 older paid invoice association, P1   | Fetch the event invoice independently of `latest_invoice`; verify its subscription and successful payment/charge chain. Record associations after cancellation/reversal as well as while active. Regression covers newer invoice, older paid event, cancellation, replay and subsequent refund without restoring obsolete coverage.            |
| #284 catalogue retry-key loss, P1         | Persist the recorded key/request before remote submission, scoped to Convex URL and Clerk user. Dismissal, changed forms and reload retain it. Storage failure prevents submission. Server history allows retry only by the original operator. Chromium regression verifies the same submitted key and request after reload.                   |
| #284 terminal SetupIntent recovery        | `requires_payment_method` and `canceled` return `failed` after ownership verification; both status-check paths and the form clear failed recovery state. Backend and browser regressions pass.                                                                                                                                                 |
| #284 hosted SetupIntent secret exposure   | New intents prohibit redirect methods with `automatic_payment_methods[allow_redirects]=never`; confirmation supplies no return URL. This prevents the new flow from putting a SetupIntent client secret in hosted request URLs. Next's development logging filter is not treated as hosted protection.                                         |
| #284 Discord token recovery wording       | Typed missing-token failure tells the user to reconnect Discord; temporary failures retain generic wording. Regression checks safe reasons and no credential leakage.                                                                                                                                                                          |
| #284 legacy hosted checkout compatibility | Inspection/status/cancellation accept hosted sessions. Creation still requires Elements. A verified open hosted session can return only an HTTPS `checkout.stripe.com` resume URL. Customer, reservation, expiry, Price and authority checks remain. Both hosted and Elements status/cancellation regressions pass with new checkout disabled. |
| #285 active guild N+1 read                | Incoming reconciliation verifies cached guild IDs once through the index, including missing/bot-left guild revocation and local guild-ID replacement. Legacy rows retain the fallback lookup. Missing-guild, revoked-manager, relinking and re-created-guild regressions pass.                                                                 |

At the initial `4e6039c` checkpoint, these fixes existed only in combined #285
and #284's threads were correctly left open. The follow-up carries the billing
fixes, preview setup stage and mobile compatibility update onto #284 itself,
then merges that signed base update forward into #285 without rewriting history.
The base receipt validates billing tables; #285 additionally validates its new
membership index. Each PR's exact signed SHA, CI results and thread resolution
are recorded in its conversation. Neither PR may merge until its own gates pass.

## Local checks on isolated staged source

| Command                                                                                                                             | Result                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `bun ci`                                                                                                                            | Frozen lockfile installed successfully in the detached checkout                                                 |
| `bun run typecheck:production`                                                                                                      | Passed, 9 tasks                                                                                                 |
| `bun run lint:production`                                                                                                           | Passed, 9 tasks plus tracked JavaScript checks                                                                  |
| Installed Oxlint on both new Preview scripts                                                                                        | Passed                                                                                                          |
| `bun run test:coverage:production`                                                                                                  | Passed, all 9 configured coverage tasks and thresholds                                                          |
| `bun run test:ci:production`                                                                                                        | Passed release-policy, credential-isolation, rollback, exact-SHA, CI topology, PWA recovery and asset contracts |
| `bun run --filter @workspace/dashboard build`                                                                                       | Passed using public compile-only fixture identities, no hosted backend acceptance                               |
| `bun run --filter @workspace/dashboard test:pwa:build`                                                                              | Passed, 2 production-output checks                                                                              |
| `bun run --filter @workspace/dashboard test:twitch:browser review-billing.spec.ts billing-portal.spec.ts account-catalogue.spec.ts` | Passed, 18 Chromium fixture tests                                                                               |
| `bun run --filter @workspace/mobile check:expo`                                                                                     | Failed on existing dependency compatibility drift; remains blocking                                             |

Coverage ran backend **435**, dashboard **108**, Discord bot **317**, Twitch bot
**124**, shared **88**, env **23**, logger **7**, landing **4** and UI **2** tests.
The configured coverage targets passed; this is not a claim that every source
file has 100% coverage. The dashboard script guard tests additionally passed in
the targeted dashboard run. No mock is presented as a real provider payment.

The first detached browser launch exited without a useful diagnostic and left
its fixture server orphaned. The task-owned process was identified by command
and creation time, stopped, and the normal-shell rerun passed all 18 tests.

## Measured reconciliation calls

The unchanged helper from `f214005` and the revised helper were run against the
same warm cached-membership fixtures. Each row totals all transactions in one
refresh. These are local Convex-test database entry counts, not hosted read/write
bytes or a production performance receipt.

| Memberships | Transactions | Prior guild `get` calls | Revised guild `get` calls | Indexed guild queries, both | Membership patches, both | Guild patches, both |
| ----------- | ------------ | ----------------------- | ------------------------- | --------------------------- | ------------------------ | ------------------- |
| 0           | 1            | 0                       | 0                         | 0                           | 0                        | 0                   |
| 1           | 1            | 1                       | 0                         | 1                           | 1                        | 0                   |
| 50          | 1            | 50                      | 0                         | 50                          | 50                       | 0                   |
| 101         | 4            | 101                     | 0                         | 101                         | 101                      | 0                   |
| 205         | 7            | 205                     | 0                         | 205                         | 205                      | 0                   |
| 1000        | 29           | 1000                    | 0                         | 1000                        | 1000                     | 0                   |

No-op guild owner writes stay at zero; membership timestamps still refresh once
per observation. The revised tests also cover deletion and identity relinking
at each nonzero size. Re-created local guild identity has a separate regression.
Hosted `database_io_read_bytes`, `database_io_write_bytes`, calls and failure
rates still need an approved before/after rollout comparison.

## Expo gate triage

The following table records the initial failure. The follow-up revision aligns
all twelve packages with Expo's recommendations, including Expo 58.0.25.
Compatibility, mobile typecheck/lint, 10 mobile coverage tests, and both iOS and
Android JavaScript bundle exports then pass locally. Exact-SHA hosted checks
are recorded in the PR conversation; the initial failure is not waived.

At the initial checkpoint no mobile manifest or lockfile had changed. The SDK check reported:

| Package                        | Pinned/installed | Expected by Expo check |
| ------------------------------ | ---------------- | ---------------------- |
| expo                           | 58.0.21          | ~58.0.25               |
| expo-auth-session              | 58.0.16          | ~58.0.18               |
| expo-constants                 | 58.0.14          | ~58.0.16               |
| expo-crypto                    | 58.0.7           | ~58.0.8                |
| expo-dev-client                | 58.0.17          | ~58.0.20               |
| expo-linking                   | 58.0.15          | ~58.0.17               |
| expo-router                    | 58.0.28          | ~58.0.31               |
| expo-secure-store              | 58.0.2           | ~58.0.3                |
| expo-status-bar                | 58.0.4           | ~58.0.5                |
| expo-symbols                   | 58.0.4           | ~58.0.5                |
| expo-web-browser               | 58.0.7           | ~58.0.8                |
| react-native-safe-area-context | 5.10.1           | ~5.11.1                |

The follow-up uses a focused Bun dependency revision and reruns
`bun run --filter @workspace/mobile check:expo`, mobile types/lint/coverage and
native bundle export. Do not bypass the native gate or claim it passed because
production checks exclude mobile.

## Preview rollout correction

The first signed revision passed all five jobs in
[regression run 43721986842](https://github.com/jcodog/Cleo/actions/runs/43721986842).
[Native run 43721990029](https://github.com/jcodog/Cleo/actions/runs/43721990029)
failed on the drift above. Its Vercel deployment reached the new build command
but failed before deployment prerequisites existed. Activating that command
without a setup stage was a rollout defect.

The follow-up adds Vercel's Ignored Build Step before installation. Missing
Preview credentials or an unapproved source skips deployment explicitly. A
configured approved branch still has to pass all strict source, identity,
origin and backend-parity checks; forcing the build without a key still fails.
No dummy or shared backend is substituted, and a skipped deployment is not
counted as hosted acceptance. Regression tests exercise the hook's actual exit
codes and the forced-build rejection. Safe configuration diagnostics identify
the missing variable without printing its value.

An additional local HTTPS production-server PWA smoke passed all 3 tests.
Windows curl readiness did not succeed, so the same server and `test:pwa`
command were exercised with a certificate-verifying Python readiness probe.
The task-owned server and temporary TLS captures were cleaned up.

## Hosted, financial and signature gates

- **Convex Preview not provisioned.** The maintainer explicitly deferred creating
  the Preview key until implementation and instructions were available.
- **No isolated backend URL or parity receipt exists yet.** The deployed schema,
  exact source stamp, four auth guards and `billingCatalogue` availability must
  pass on the branch Preview before hosted acceptance is claimed.
- **No new Vercel acceptance URL exists yet.** The inspected dashboard deployment
  `dpl_4dhioLHc2XckwRVzFwV2bSYWRqKY` was `BLOCKED`. The shared development URL
  is not an acceptable fallback.
- **No real sandbox payment, no-charge subscription, refund/dispute, bank setup,
  actual webhook delivery, authenticated account-switch or native role grant was
  performed by this revision.** Browser evidence uses provider fixtures.
- Both `STRIPE_TEST_CHECKOUT_ENABLED` and `STRIPE_CATALOGUE_WRITES_ENABLED` remain
  disabled. No live credentials, Stripe webhook destination or outbound role
  configuration was changed. Initial stamped previews disable crons and HTTP
  webhook consumers.
- GitHub's active `Protect main` ruleset requires signatures, resolved review
  threads and `Tests, lint, typecheck, and coverage`. Previous combined HEAD
  `f214005` is GitHub `unsigned`; a new signed HEAD does not repair its ancestry.
  No shared history was rewritten. Vercel Verified Commits stays enabled.
- No manual Cubic or other external review was invoked. Ready for optional
  maintainer-initiated Cubic review.

Code merge, test-checkout enablement and live financial launch are all **NO-GO**.
Next, follow [Preview setup](isolated-review-preview.md#maintainer-setup-after-implementation),
then verify the exact signed combined SHA in hosted CI and complete the separate
acceptance lanes. JCN-242 and explicit Jason approval remain release gates.
