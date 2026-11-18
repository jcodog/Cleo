# Isolated dashboard Preview for PR #284

This runbook applies to the consolidated PR #284 on
`feat/cleo-dashboard-account-billing`.

## Build contract

`apps/dashboard/vercel.json` first runs Vercel's Ignored Build Step using
`scripts/ignore-dashboard-preview.mjs`. Unconfigured previews and branches other
than the approved combined review branch are explicitly skipped before install
or build. A skipped deployment is not a working preview or passing acceptance.
No shared backend is used as a fallback. Once the restricted Preview key is
present, the approved branch enters `bun scripts/build-dashboard-preview.mjs`
from the repository root. Production keeps the existing frontend build and
`git.deploymentEnabled.main=false`. Configured Preview builds fail closed without the
trusted repository, exact branch, full source SHA, clean checkout, development
Clerk identity, controlled origin and project Preview Deploy Key.

Maintainers run the wrapper from the repository root, with the protected Vercel
Preview environment configured:

```sh
bun scripts/build-dashboard-preview.mjs
```

The wrapper runs the installed Convex CLI from `packages/backend`. A private
temporary env file contains only the validated project Preview key. Deploy,
inventory, and provider checks explicitly select the same named Preview. Do not invoke its internal `--capture` callback
by hand. The deploy name remains the stable approved branch name. A final receipt check
fails a build if an overlapping revision replaced its backend during the frontend
build. This detects overlap; it does not claim to serialize provider deployments.
Only the newest matching frontend/backend receipt is eligible for acceptance.

The callback captures the CLI-selected canonical URL and stamps backend source
evidence. It does not build the frontend. Convex 1.48 runs `--cmd` **before** its
push. Only after the command exits successfully does the wrapper check the
deployed `previewHealth:read` receipt and read-only `previewHealth:verifyProviders`
proof using the branch-scoped Preview credential. The wrapper compares the
CLI's names-only deployment environment inventory with an allowlist before the
Convex push and at both receipt checks. It then runs
`bun run --filter @workspace/dashboard build` with that exact URL. The package
build performs the four unauthenticated auth probes once. The wrapper rechecks
parity and provider ownership after the frontend build. It removes
`CONVEX_DEPLOY_KEY` from the frontend build environment and restores the local
stamp in `finally`. No `--preview-create`, data import, data reset, `--prod`,
shared development deploy or production credentials are used.

The receipt checks source SHA, branch, canonical URL, billing tables and
isolation configuration. It also checks the Discord membership index. Clerk
secret ownership is checked against the instance domain, and any configured Stripe
secret is checked against the actual approved sandbox account. The successful Convex push
validates the complete source schema. The four probes reach auth guards for
`accountBilling:overview`, `billingCatalogue:access`,
`billingPortalActions:profile`, and `premiumActions:offer`. These checks do not
prove authenticated behavior or financial acceptance. A URL alone does not
prove deployment type: the project Preview key and official CLI claim provide
that guarantee. A normal deployment key, including a concrete Preview
deployment's key, is rejected before invoking the CLI.

## Maintainer setup after implementation

1. Open the intended **Cleo** project in the Convex dashboard. Go to **Project
   Settings → Preview Deploy Keys** and generate a **Preview Deploy Key**. Do
   not use a development or production deploy key. Do not paste it in chat,
   issues, commits or command output.
2. Review the code and commit signature before releasing any credential.
   In Vercel team **jconet-ltd**, project **cleo**, open **Settings → Environment
   Variables**. Add `CONVEX_DEPLOY_KEY` as sensitive, target **Preview only**,
   restricted to Git branch `feat/cleo-dashboard-account-billing`. Do not select all
   Preview branches. If the plan cannot enforce that scope, use a protected
   review environment with maintainer approval instead. Never put this key in
   an unrestricted PR workflow, `pull_request_target` checkout of PR code, or
   an environment accessible to forks. Build-script guards supplement these
   platform controls; they cannot protect a key already given to hostile code.
3. Choose one exact, Cleo-controlled HTTPS review origin. Configure the alias
   and Clerk development instance to permit it. No wildcard Vercel domain.
   Set the following **on the same restricted Vercel Preview branch**:

   | Variable                             | Required setting                                                         |
   | ------------------------------------ | ------------------------------------------------------------------------ |
   | `CONVEX_DEPLOY_KEY`                  | Sensitive project Preview key                                            |
   | `CLEO_PREVIEW_ORIGIN`                | The one approved HTTPS origin, no trailing slash                         |
   | `NEXT_PUBLIC_APP_URL`                | Same origin                                                              |
   | `CLEO_PREVIEW_CLERK_ISSUER`          | Exact development Clerk issuer origin                                    |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | Matching development instance, `pk_test_`                                |
   | `CLERK_SECRET_KEY`                   | Matching development instance, sensitive `sk_test_`                      |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional matching Cleo Dev Sandbox `pk_test_`; omit for read-only review |

   Vercel supplies the source SHA, repository and branch variables. Do not
   override them. Ensure **Automatically Expose System Environment Variables**
   is enabled for the project so the ignore step and build can identify the
   source and environment. A global `NEXT_PUBLIC_CONVEX_URL` is not authoritative for
   this build: the official CLI supplies the branch Preview URL.

4. In Convex **Project Settings → Default Environment Variables**, inspect
   what new previews inherit. Do not change shared defaults if that would
   affect other deployments. If they contain production credentials or bot,
   webhook, OAuth-client or token-encryption secrets, stop and create a
   separately isolated review project instead. No dev/prod database export
   or import is permitted. Configure the review deployment/defaults with:

   | Variable                          | Required setting                                                                               |
   | --------------------------------- | ---------------------------------------------------------------------------------------------- |
   | `CLERK_JWT_ISSUER_DOMAIN`         | Same development issuer as the frontend                                                        |
   | `CLERK_SECRET_KEY`                | Matching development instance, sensitive `sk_test_`                                            |
   | `CLEO_DASHBOARD_ORIGIN`           | Same approved review origin                                                                    |
   | `CLEO_DASHBOARD_ALLOWED_ORIGINS`  | Absent or exactly that origin                                                                  |
   | `STRIPE_TEST_CHECKOUT_ENABLED`    | `false`                                                                                        |
   | `STRIPE_CATALOGUE_WRITES_ENABLED` | `false`                                                                                        |
   | `CLEO_COMMUNITY_ROLES_ENABLED`    | Absent or `false`                                                                              |
   | `CLEO_RECOGNITION_ENABLED`        | Absent or `false`                                                                              |
   | `STRIPE_SECRET_KEY`               | Omit for initial review; only approved Cleo Dev Sandbox `sk_test_` if test acceptance needs it |
   | `STRIPE_EXPECTED_ACCOUNT_ID`      | `acct_1RGgwvE1e1YdqDQQ` when Stripe is configured                                              |

   No bot tokens, bot shared secrets, webhook secrets, client secrets or token
   encryption keys. The stamped preview registers no crons and exposes no HTTP
   webhook routes. It cannot consume the shared development or live webhooks.
   Never repoint the existing development sandbox webhook at this backend.

5. Redeploy the reviewed, signed exact commit as **Preview** after setup.
   Until the restricted key is configured, automatic previews are skipped;
   do not call that hosted acceptance. The first configured push
   may create the branch Preview and then fail its isolation receipt until
   deployment-specific variables are set. Configure only that new Preview's
   variables and retry with the same `--preview-name`; its data is retained.
   Record the actual Preview slug and verify its dashboard deployment type is
   **Preview**, distinct from production and `compassionate-goose-199`.
6. Preserve Vercel Verified Commits, deployment protection, GitHub signature
   rules and required checks. Record the Vercel deployment ID, immutable URL,
   approved alias, exact Git SHA, separate Convex URL and logged parity receipt.
   Do not use a shared dev backend as a fallback when this step fails.

## Acceptance lanes

Read-only review is the initial lane. An arbitrary protected Vercel hostname
can be used to inspect read-only UI. Financial actions must run from the
approved alias; `billingOrigin` rejects other return origins. Do not add an
extra origin merely to make a failed acceptance run pass.

Authenticated acceptance must use real development Clerk identities and
Preview-owned data. Verify sign-in/out, account-switch isolation, Profile,
Security, Connections, directory, Linked Roles presentation, read-only Premium
catalogue, and purchaser billing empty/populated. Native role publication and
outbound Discord grants are intentionally unavailable in this initial preview.
Record those as unsupported until a separately scoped test integration exists.

Sandbox acceptance uses only explicitly approved no-charge fixtures in **Cleo
Dev Sandbox**. Confirm Stripe account identity and matching publishable key
before any provider mutation. Test SetupIntent success, failure, processing,
cancellation and reload recovery; inspect Stripe evidence and purchaser-owned
Convex state. Redirect-based setup methods remain disabled with
`automatic_payment_methods[allow_redirects]=never`; the client passes no return
URL. Local Next logging filters do not protect hosted request logs.

New checkout and staff catalogue writes stay disabled. Each needs its separate
acceptance and authorisation before changing its gate. Full invoice lifecycle,
refund/dispute and actual webhook-delivery acceptance needs a dedicated
Preview-only sandbox consumer and separately reviewed outbound integration
configuration. This initial build deliberately has neither. Do not represent
unit tests, signed locally generated fixture events or mock-browser screenshots
as Stripe-originated lifecycle delivery. Do not send real customers or live
payment methods through test fixtures.

## Release evidence and no-go rules

Record exact source/tree SHA, local and GitHub signature verification,
ancestry, CI URLs/results, Vercel deployment and Preview Convex receipt, safe
variable names/booleans, test counts and unsupported scenarios. Never record
credentials or SetupIntent client secrets. The repo's active **Protect main**
ruleset requires signed commits, resolved review threads and its required
status check. A signed new HEAD does not retroactively sign existing unsigned
ancestors. No force-push or history rewrite is authorised.

Run production typecheck/lint/tests/coverage, Discord safety regressions,
dashboard/PWA and the mobile gate on the combined source. The Expo 58 gate
currently reports version drift. Keep it blocking; do not exclude it from
required checks. Dependency remediation belongs in a separate focused change
with the pinned Bun lockfile, followed by mobile validation.

Code merge, test-checkout enablement and live financial launch are separate
decisions. All remain **NO-GO** while P1 findings, unmatched backend, failed
checks, signature controls or required hosted acceptance remain unresolved.
Only JCN-242 can authorise live charging, production deployment or live webhook
configuration. Jason must explicitly authorise any merge.

Rollback is to disable/delete only the branch-restricted Preview credential
and alias, stop Preview testing and select the last approved signed Preview
revision. Reusing `--preview-name` retains Preview data. Deleting/resetting that
data or rewriting shared history needs explicit approval. Production is never
part of this rollback.

Sources: [Convex preview deployments](https://docs.convex.dev/production/multiple-deployments),
[Convex deploy reference](https://docs.convex.dev/cli/reference/deploy),
[Stripe redirect-method filtering](https://docs.stripe.com/changelog/2023-08-16/automatic-payment-methods),
[Vercel verified commits](https://vercel.com/docs/project-configuration/git-settings#verified-commits).

The skip/continue exit codes follow Vercel's
[Ignored Build Step contract](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel).
