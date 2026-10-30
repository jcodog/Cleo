# Dashboard and billing checkpoint, 29 October 2026

## PR #284 account and integration repair, 30 October 2026

The account now uses one native Clerk UserProfile with Account, Security and
custom Connections/Billing pages. Optional catch-all routing owns all four URLs;
the separate Cleo account sidebar and standalone page implementations are removed.
Connection consent and purchaser access remain independent of guild navigation.

The real failure is an outdated development Convex deployment: both
`accountBilling:overview` and `billingCatalogue:access` are missing. Clerk API
connectivity, matching sandbox Stripe account, approved recurring Price, enabled
Convex Price mapping and default Customer Portal configuration were verified by
read-only calls. New test checkout remains disabled; the return origin is local
while Vercel Preview uses dev-app. See
[environment setup and runtime evidence](account-billing-environments.md).

The maintainer approved the development sync and completed signing. The signed
repair is `b18abe0d243a74118210db345616fbfa1b43eb7c`. Matching functions/schema are
now published to `compassionate-goose-199`; the backend preflight passes. Actual
authenticated Profile, Security, Connections, Billing, staff catalogue and Price
detail were tested. Billing correctly shows the maintainer's empty ledger;
products show the real approved GBP 499/month Price and disabled writes.

Real desktop/mobile screenshots are in
[signed-in runtime evidence](screenshots/account-repair-2026-10-30/README.md).
The older screenshots below remain provider-fixture evidence. Actual Elements
payment, populated purchaser Portal and second-account switching acceptance are
still separate checks. No checkout flag or Stripe settings were changed.

Live testing also found and fixed a Base UI link/button semantics warning. Its
focused browser regression, fresh dashboard typecheck/lint/build and eight
membership refresh regressions pass. Production graph checks from the repair
still apply. The release-contract suite passed its single retry after Windows
`EBUSY` cleanup. No test assertions were weakened.

Discord verification was temporarily unavailable on dashboard return. A normal
retry restored fresh verified guild access and opened the saved test server;
its Premium page reads the actual GBP 4.99/month offer. The initial transient
cause was not determined. Safe reason/status logging now preserves evidence for
future provider failures without logging OAuth credentials or relaxing authority.

The four stashes have been re-audited, with the obsolete unique dev-script patch
archived. Drop their references only after the repair is signed, pushed and
verified. No new branches, worktrees or PRs are needed. PR #284 remains draft.

## Consolidated development status, 30 October 2026

Development resumed on `feat/cleo-dashboard-account-billing` at `00e43565257d`.
The original dashboard, recovery and Stripe commits, plus hosted account commit
`7525b3322851521a837245a4b5ae5ebf8368812f`, are in its ancestry. Do not repeat
those merges. `main` remains protected production and has not been changed.

The historical checkpoint below records what was verified at that time. Its
separate branch/worktree instructions and stop request are superseded by the
maintainer's consolidated implementation request. The only active development
branch is now `feat/cleo-dashboard-account-billing`; future work uses one draft
PR against `main`. See [stash audit](stash-audit.md) for saved-work accounting.

Implemented since consolidation:

- Recovered the account-link membership timestamp guard and regression coverage.
- Added account-unavailable handling and current-Clerk-identity isolation for
  connection details. Purchaser billing and hosted profile/security remain in
  their independent account navigation.
- Premium overview reads the approved Stripe offer, identifies the guild,
  separates coverage, purchaser management and consent, and prevents duplicate
  purchases while covered. The existing workspace supplies the guild header/icon.
- Fixed embedded Checkout return state and preserved standalone redirect links.
- Removed official-server purchase exclusion without changing Discord authority
  or independent-community role qualification. Existing complimentary grants and
  verified zero-cost subscriptions do not create paid Supporter evidence.
- Added sandbox staff Products/Prices UI, server financial permissions, signed
  session freshness, audit/idempotency records and historical mapping protection.

Current acceptance limits:

- The intended free offer awaits maintainer confirmation. It may be an internal
  grant. No new offer or redemption mechanism was invented.
- Browser screenshots/tests exercise real UI components with isolated provider
  fixtures. They do not prove a real Stripe payment or Clerk credential change.
- The real local app reaches Clerk sign-in with only the expected development-key
  warning. Authenticated profile/security and the original Zen-specific warning
  still need the maintainer's authenticated session.
- Actual Stripe lifecycle acceptance remains JCN-241. Live remains JCN-242.
  No live writes, charging, production deployments or merges were performed.

The historical remaining-work list below is retained for provenance. The current
implementation and launch requirements are in
[Stripe checkout rollout](stripe-checkout-rollout.md).

Current local validation passed:

- Production lint and typecheck graphs, nine tasks each, mobile excluded.
- Production coverage graph, nine tasks, including 403 backend and 106 dashboard
  tests. Existing configured coverage gates remain at 100%. A subsequent focused
  32-test community run also validates the final offer authorization regression.
- Production builds, four tasks, and two generated-PWA checks.
- Production CI/release-contract and asset regressions, using installed Git Bash
  on Windows. No production action was performed by these fixtures.
- Full Playwright suite, 68 cases, followed by refreshed desktop/mobile visual
  evidence. See [screenshots](screenshots/dashboard-billing-2026-10-30/README.md).

The new Convex declarations were generated from current source and reviewed.
Temporary validation logs are ignored and must not be committed. The local
dashboard dev server is running; no bot or backend deployment was launched.

## Historical checkpoint

The maintainer requested that further testing stop and current work be committed
and pushed. Do not treat this checkpoint as approval to merge or launch billing.
No local Cubic review was started. Mobile remains outside this task.

## PRs and branches

| PR | Branch | Purpose | State |
| --- | --- | --- | --- |
| [#277](https://github.com/jcodog/Cleo/pull/277) | `feat/jcn-252-dashboard-navigation` | Guild resume/directory/navigation, Linked Roles FAQ dialog, requested local dev script changes and manual-only Cubic policy | Signed `b020b256918dd0e4dc1cfa5c363feb8517beab50`; required checks passed; earlier actionable review findings fixed |
| [#282](https://github.com/jcodog/Cleo/pull/282) | `feat/dashboard-theme-loading` | Rejected-session recovery and compact dashboard entry loading | Signed `7b060f21d7ebe773c51b163684588ff008efc15a`; stacked on #277; local checks and Vercel preview passed |
| [#283](https://github.com/jcodog/Cleo/pull/283) | `feat/jcn-253-stripe-elements` | Custom Elements subscription checkout and billing reconciliation changes | Draft; implementation `0851069bb4079d7bac7e9c146981d7af7866190e`, followed by handoff documentation; required checks passed for implementation |

The original scope explicitly requested separate dashboard and Stripe PRs. The
runtime follow-up became the third PR. It can be consolidated with #277 during
maintainer-directed review if preferred; nothing has been merged.

`feat/dashboard-integration-preview` combines the navigation, runtime and Stripe
commits for local testing. It is a preview branch, not another PR. It is the
primary checkout at `E:\projects\cleo\Cleo`.

`feat/jcn-255-hosted-account` saves unfinished account work in
`.coverage-tmp/jcn-255-hosted-account`. No extra account PR was opened at this
checkpoint. Its code is **not included in the combined local preview**.

## Implemented and verified before testing stopped

- JCN-252: per-Clerk guild selection with trusted recent-guild fallback, explicit
  deep-link preservation, server directory, search, switcher and breadcrumbs,
  verification/account-switch handling, accessible global Linked Roles FAQ.
- JCN-254: structured Convex OIDC rejection recovery with a fresh Clerk token
  retry and safe sign-in return; short-lived account-bound entry snapshot. The
  original Zen script warning was not reproduced on a fresh Chromium sign-in or
  HMR load. Authenticated Zen confirmation remains outstanding.
- JCN-253: test-only Checkout Sessions `ui_mode=elements`, Payment and Express
  Checkout Elements, Appearance styling, dynamic payment methods, account/Price
  binding, fresh Discord purchase authority, reservation/idempotency protection,
  purchaser-owned receipt/cancel actions and webhook-only entitlement authority.
- Stripe implementation checks: production workspace lint, typecheck, coverage
  and build graphs passed with mobile excluded. Backend 392 tests and dashboard
  102 tests passed. A full browser run passed 51 cases, then 13 focused cases
  passed after reload-safe consent/reservation support. These mock Stripe's SDK
  boundary and do not prove a real payment.

## Sandbox state

- Account: Cleo Dev Sandbox `acct_1RGgwvE1e1YdqDQQ`, verified using the configured
  test secret key. Matching publishable test key is present in the dashboard.
- Active Product `prod_VX3KxV0lTiLijQ`, approved Price
  `price_1UVzEKE1e1YdqDQQ2ET4LiZ4`, GBP 499/month.
- Dedicated endpoint `we_1UVzFRE1e1YdqDQQiKOxjur2` points to
  `https://compassionate-goose-199.convex.site/stripe-community-webhook`, using
  `2026-09-30.endive` and 15 billing event types. Signing secret stored securely.
- A signed no-op request returned HTTP **204** after the preview source reached
  the existing development watcher. Earlier deployed code had rejected it.
  Signature verification was not weakened. Actual Stripe-originated lifecycle
  delivery is not yet proven.
- Default sandbox Portal `bpc_1UVzOcE1e1YdqDQQVzDremJy` supports invoice history,
  payment-method updates and end-of-period cancellation.
- `STRIPE_TEST_CHECKOUT_ENABLED=false`. No live objects or production
  configuration were changed. Existing live and Svix webhook destinations remain.
- Environment examples are in `apps/dashboard/.env.example` and
  `packages/backend/.env.example`. Convex secrets belong in its deployment
  environment, not the browser app or committed files.

## Remaining work

1. **Official server and free code:** the maintainer clarified that the official
   server can receive Premium, can also receive notifications, and should use an
   existing free code. Current purchase guards still exclude it. Implement this
   new requirement while preserving independent-community qualification rules.
   Locate the intended free offer; current connector lookups found no active
   live promotion codes or coupons. Verify approved zero-cost subscription
   evidence without granting paid-supporter recognition from a free invoice.
2. **JCN-241/JCN-253 acceptance:** complete a real sandbox checkout for approved
   guild `529224807502446595`, authentication challenges, eligible wallets and
   redirects, asynchronous outcomes, renewal, failed collection, cancellation,
   refunds/disputes/fraud warnings, replay/reordering and entitlement expiry.
   Verify purchaser Portal access after guild permission loss. Keep live disabled.
3. **JCN-255 account work:** finish review and browser/account-switch coverage for
   the dedicated profile/security shell, explicit Discord/Twitch connection
   controls and purchaser billing read model. Lint/typecheck and three backend
   billing tests passed before the checkpoint. The last full dashboard unit run
   had one outdated footer expectation; it was updated with additional account
   shell assertions, but was not rerun after the stop request. No account browser
   validation or production build is claimed.
4. **JCN-256 Premium UX:** finish real guild icon/name and trusted catalogue
   pricing, status hierarchy, ownership-aware controls and responsive polish.
   The complete requested redesign is not implemented.
5. **JCN-257 staff catalogue:** not implemented. Still needs real Products/Prices
   UI, narrowly scoped billing capability, fresh authentication, sandbox-only
   audited/idempotent mutations, immutable-Price handling and historical mapping
   preservation. Live writes must remain disabled.
6. **Review and launch:** inspect subsequent automatic PR findings, resolve
   actionable issues, and complete the evidence checklist in
   [Stripe checkout rollout](stripe-checkout-rollout.md). Business verification,
   tax decisions/registrations, customer terms, supported currencies and payment
   methods, refund/dispute operations and end-to-end subscription evidence remain
   first-customer gates. JCN-242 is the separate live authorisation gate.

The maintainer requested continuation on 30 October 2026. Remaining acceptance
items above still require current validation; historical results are not a new
acceptance claim.
