# Account and billing environment setup

## Verified failure, 30 October 2026

Vercel Preview and local Next.js both target
`https://compassionate-goose-199.convex.cloud`. An actual HTTP query returned
`Could not find public function for accountBilling:overview` (request
`4b41c3f44f02eeff`). Convex logs also record an authenticated request for missing
`billingCatalogue:access` (`a016eaf48fab16d6`). These are missing deployed functions,
not empty subscription history or a missing frontend Stripe key.

Read-only checks confirmed Clerk instance `ins_2jxwxZGK2pYcC2Mm7vfWykmGuER` is
reachable and uses the development issuer `usable-oarfish-98.clerk.accounts.dev`.
The deployed Stripe secret successfully reads Cleo Dev Sandbox
`acct_1RGgwvE1e1YdqDQQ` and matches `STRIPE_EXPECTED_ACCOUNT_ID`. Both the plugin and
that account's API report approved Product `prod_VX3KxV0lTiLijQ`, Price
`price_1UVzEKE1e1YdqDQQ2ET4LiZ4`, GBP 499 per month. An active default Customer Portal
configuration exists (`bpc_1UVzOcE1e1YdqDQQVzDremJy`). This does not prove a Portal
session or payment has been accepted for an authenticated purchaser.

The actual development `guildBillingPrices` table also contains the enabled
approved Product/Price pair. Clerk MCP tools are not exposed in this Codex
session; the Clerk connectivity result above came from an authenticated,
read-only official Backend API call using the existing local credential.

Additional configuration differences: new test checkout is explicitly disabled;
catalogue writes and manager IDs are absent, so writes remain denied. The deployed
return origin is `https://localhost:3000`, whereas Preview's application URL is
`https://dev-app.cleoai.cloud`. Preview redirects would therefore return to the
wrong host. Correct the selected deployment's return origin for the acceptance
frontend, or use separate development deployments for local and Preview testing.
No configuration was changed by these diagnostic reads.

## Frontend settings

Set local values in `apps/dashboard/.env.local`. Set hosted values in the Vercel
**Cleo** project's appropriate environment, then rebuild. Do not copy production
Clerk credentials into Preview. Public values are embedded during Next.js build;
changing Vercel settings does not repair a previously built deployment.

| Variable | Purpose and format | Secret? | Local | Vercel Preview | Vercel Production |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | HTTPS `.convex.cloud` URL with the matching backend revision | No | Selected development URL | Selected development/preview URL, currently compassionate-goose-199 | Protected production deployment only |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend identity, `pk_test_` or `pk_live_` | No | Development instance | Same development instance as Preview Convex issuer | Production instance |
| `CLERK_SECRET_KEY` | Next.js Clerk server authentication, `sk_test_` or `sk_live_` | Yes | Matching development instance | Matching development instance | Matching production instance |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Elements identity, `pk_test_` | No | Cleo Dev Sandbox | Same sandbox as Preview Convex Stripe secret | Leave checkout disabled under JCN-242; live keys are rejected |
| `NEXT_PUBLIC_APP_URL` | Canonical dashboard HTTPS origin | No | `https://localhost:3000` | `https://dev-app.cleoai.cloud` or the approved preview origin | `https://app.cleoai.cloud` |
| `NEXT_PUBLIC_SITE_URL` | Public landing origin | No | `https://localhost:3001` | Approved landing origin | Public production landing origin |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Hosted sign-in path | No | `/sign-in` | `/sign-in` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Hosted sign-up path | No | `/sign-up` | `/sign-up` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Post-login fallback | No | `/dashboard` | `/dashboard` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Onboarding fallback | No | `/onboarding` | `/onboarding` | `/onboarding` |

Vercel supplies `VERCEL_ENV` and `VERCEL_URL`; do not put Stripe secrets in Vercel
for this architecture. Preview builds now run a read-only function-availability
preflight. It fails if the configured backend lacks account billing, catalogue
access or the checkout offer action. It does not impersonate a user or prove
Stripe acceptance. Run the same check locally with
`bun run --filter @workspace/dashboard check:backend`.

## Convex settings

`packages/backend/.env.local` selects the CLI deployment using
`CONVEX_DEPLOYMENT=dev:<deployment-name>`. Local file values do **not** automatically
configure hosted Convex functions. Configure the following in the selected
Convex deployment's Environment Variables settings. Never use `--prod` for this
work. Use `bunx --no-install convex env list --names-only` for safe inventory.

| Variable | Purpose and required format | Secret? |
| --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Exact HTTPS issuer of the frontend's Clerk instance; Convex auth provider uses audience `convex` | No |
| `CLERK_SECRET_KEY` | Matching Clerk instance credential for identity/OAuth server operations | Yes |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook destination signing secret | Yes |
| `STRIPE_SECRET_KEY` | `sk_test_` from Cleo Dev Sandbox; financial actions reject live keys | Yes |
| `STRIPE_EXPECTED_ACCOUNT_ID` | `acct_1RGgwvE1e1YdqDQQ`; actual Stripe `/account` must match | No |
| `STRIPE_GUILD_PREMIUM_PRICE_ID` | Approved recurring `price_...` in the same sandbox | No |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` for that sandbox's dedicated Convex `/stripe-community-webhook` endpoint | Yes |
| `STRIPE_TEST_CHECKOUT_ENABLED` | Exact `true` only after sandbox prerequisites and acceptance authorisation; otherwise `false` | No |
| `STRIPE_CATALOGUE_WRITES_ENABLED` | Independent sandbox write gate; default off | No |
| `STRIPE_CATALOGUE_MANAGER_IDS` | Comma-separated Clerk user IDs; active admin/superadmin role and a fresh signed session are additionally required | No, access-controlled administration setting |
| `CLEO_DASHBOARD_ORIGIN` | Exact approved HTTPS dashboard origin, no path/query/fragment; used for Stripe return URLs | No |

Deploy the matching functions and schema to the intended development deployment
before testing the new UI. Publishing a frontend alone cannot publish Convex
functions. Existing production deployment and webhook consumers must remain
untouched. The historical instruction prohibiting manual Convex deployment still
requires maintainer approval before this agent publishes development functions.

## Financial prerequisites are separate capabilities

The authenticated purchaser ledger reads Convex and works without a Stripe
publishable key, new-checkout flag or existing subscription. No customer means
an honest empty history. Purchaser access survives losing guild permissions.

API credentials alone do not approve a Product/Price. The existing
`guildBillingPrices` mapping must enable the exact recurring Product/Price pair.
Sandbox catalogue writes require separate financial authority and fresh Clerk
reverification. Read-only staff do not need production keys. Changing a default
Price does not migrate existing subscribers or automatically approve checkout.

Portal management additionally needs a purchaser-associated Stripe Customer,
the matching account, an active Portal configuration and a correct return origin.
New-checkout being disabled must not block purchaser management or existing
checkout status/cancellation recovery. A Stripe SDK initialisation success does
not prove that the public key and server session match; verify with the same
sandbox's Elements session under JCN-241.

Check the dedicated webhook URL, enabled event set, signing secret and actual
delivery. Keep Checkout, async payments, invoices, subscription changes, refunds,
disputes and fraud-warning reconciliation covered. Entitlements activate only
from verified backend evidence. A signed webhook probe is not payment acceptance.

The application reports safe configuration names, mode and return origin without
exposing keys or tokens. Missing deployed functions and rejected Convex identity
have distinct messages and leave Clerk navigation usable. Ledger configuration
presence is never presented as proof of Stripe connectivity.

## Acceptance and launch gates

JCN-241 still requires an authenticated sandbox checkout, wallet/redirect return,
verified webhook, renewal, failed invoice, cancellation, refund/dispute handling,
customer Portal and expiry checks. JCN-242 separately authorises live rollout.
Before any real customer: approve business/legal details, taxes, invoices,
refund/dispute operations, currencies, payment methods, live mappings, all existing
webhook consumers and full end-to-end subscription evidence. No live charging or
live catalogue writes are enabled by this PR. The intended free offer remains
unidentified; internal complimentary coverage is distinct from paid recognition.

## Official references

- [Clerk custom UserProfile pages](https://clerk.com/docs/nextjs/guides/customizing-clerk/adding-items/user-profile)
- [Clerk UserProfile](https://clerk.com/docs/nextjs/reference/components/user/user-profile)
- [Convex Clerk authentication](https://docs.convex.dev/auth/clerk)
- [Deployment-scoped Convex environment](https://docs.convex.dev/production/environment-variables)
- [Next.js build-time environment](https://nextjs.org/docs/app/guides/environment-variables)
- [Stripe API keys](https://docs.stripe.com/keys)
- [Checkout Sessions integration choices](https://docs.stripe.com/payments/checkout)
- [Stripe Customer Portal configuration](https://docs.stripe.com/customer-management/configure-portal)
