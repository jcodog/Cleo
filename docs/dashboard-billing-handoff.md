# Dashboard and billing checkpoint, 29 October 2026

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
