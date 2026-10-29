# Stripe Elements checkout rollout

JCN-253 changes the test-only community checkout to Checkout Sessions with
`ui_mode=elements`, `CheckoutElementsProvider`, Payment Element and Express
Checkout Element. The server adapter pins `2026-09-30.endive`. Live keys and
live webhook events remain rejected. JCN-242 is the separate live release gate.

## Account evidence, 29 October 2026

Read-only inspection through the connected Stripe integration found:

| Environment | Product and recurring Price | Existing webhook |
| --- | --- | --- |
| Cleo live, `acct_1QsyFxE1O7ChWNwx` | `prod_SpXiCl2PJ8aHD7`, `price_1RtscmE1O7ChWNwxZGKD5Rn1`, GBP 499/month | `we_1RtsPXE1O7ChWNwx4KfMTTjJ`, `https://cleoai.cloud/webhooks/stripe`, `2025-07-30.basil` |
| Cleo shared test mode | No Products or Prices | No endpoints |
| Cleo Dev Sandbox, `acct_1RGgwvE1e1YdqDQQ` | New `prod_VX3KxV0lTiLijQ`, `price_1UVzEKE1e1YdqDQQ2ET4LiZ4`, GBP 499/month | Existing Svix `we_1RtrP6E1e1YdqDQQz7cAkRA5` preserved; new Convex `we_1UVzFRE1e1YdqDQQiKOxjur2`, `2026-09-30.endive` |

The connector initially reported a legacy GBP 999/month sandbox Price, but its
Product could not be retrieved using the configured sandbox key. Direct API
inspection verified that key's account identity and found no active Premium
Product. The new Product and Price above were created through that verified key
with stable idempotency keys and approved in the existing dev Convex registry.
An unused setup Product with a custom ID unsupported by the current registry,
and its Price, were archived before approving the final pair.

Neither existing destination has been deleted, repointed or upgraded. Their
consumers must be identified before any future change. Both have limited event
subscriptions and are not evidence that the Convex billing handler receives
invoice, refund, dispute or asynchronous payment events.

## Application configuration

Use one Cleo-owned test environment consistently. For the existing Dev Sandbox:

1. Create a new GBP 499/month licensed recurring Price for the intended Premium
   Product. Preserve the legacy Price and its subscribers.
2. Set `STRIPE_EXPECTED_ACCOUNT_ID=acct_1RGgwvE1e1YdqDQQ` and that sandbox's
   `sk_test_` key in the intended development Convex deployment. Never commit keys.
3. Approve the exact Product/Price pair through the existing internal
   `mutations/internal/guildBilling:configurePrice` function. Set
   `STRIPE_GUILD_PREMIUM_PRICE_ID` to it. Retain approved historical mappings for
   existing subscriptions when a Price is retired from new sales.
4. Set the matching `pk_test_` key as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the
   dashboard. The `/account` identity check rejects a mismatched backend account;
   Stripe also requires the browser key to match the session's account.
5. Set the canonical HTTPS dashboard origin in `CLEO_DASHBOARD_ORIGIN` and add a
   dedicated development webhook at `/stripe-community-webhook` on that Convex
   deployment's `.convex.site` origin. Use `2026-09-30.endive` and the complete
   event list in [community integration setup](community-integrations.md#stripe-test-setup).
   Store its signing secret as `STRIPE_WEBHOOK_SECRET` in that deployment.
6. Configure Customer Portal invoice, payment-method and cancellation access.
   Confirm payment method settings and applicable wallet domains. Then enable
   `STRIPE_TEST_CHECKOUT_ENABLED=true` in development only.

The maintainer configured the matching test keys. The dev deployment
`compassionate-goose-199` now has the expected sandbox account, approved Price,
HTTPS localhost return origin and new dedicated endpoint signing secret. The
dashboard has a test publishable key. `STRIPE_TEST_CHECKOUT_ENABLED` remains
false. Default sandbox Portal configuration `bpc_1UVzOcE1e1YdqDQQVzDremJy` is
active with invoice history, payment-method updates and end-of-period cancellation.
After the approved local integration preview reached the existing development
watcher, the signed no-op HTTP probe returned **204**. The earlier deployed action
had rejected the probe; no signature checks were weakened. This proves the
configured handler accepts a correctly signed request, not that Stripe has
delivered a subscription lifecycle event. No real sandbox payment, wallet
authorisation, redirect or Stripe-originated billing delivery is verified yet.

## Maintainer checkpoint

Further testing stopped at the maintainer's request on 29 October. PR #283 remains
a draft. Keep the test checkout gate disabled until acceptance resumes.

The maintainer subsequently clarified that Cleo's official server may itself
receive Premium, may be the notification destination, and should use an existing
free code. The current code still excludes that server from checkout and does
not support that free-code flow. This requirement is **not implemented**.
Revise the purchase guard separately from independent-community qualification,
and verify zero-cost subscription evidence without granting paid-supporter
recognition from a free invoice. Current connected live-account lookups found no
active promotion codes or coupons; locate the intended offer before creating or
changing anything. Live charging remains under JCN-242.

## Payment and entitlement boundaries

Session creation checks the authenticated Clerk purchaser, current Discord
identity and fresh Owner/Administrator authority. The approved recurring Price
is fetched from Stripe and checked against the configured account and Product.
The reservation and stable Stripe idempotency key prevent duplicate checkout
creation. A reload resumes the original consent choices; a verified Stripe
expiration releases the reservation. Ambiguous responses keep it fenced.

Payment details stay inside Stripe Elements. No payment-method allowlist is
submitted. Stripe decides transaction eligibility from its account settings,
currency, country, device and subscription support. A configured method is not
a promise it will appear for every customer.

The confirmation screen checks Stripe status for the authenticated purchaser
and community. It never grants access. Signed webhooks reconcile current Stripe
subscription, invoice, successful PaymentIntent and charge evidence under the
existing transactional lease. Delayed invoice events use the current latest
invoice. Replay receipts prevent duplicate application. Refunds, disputes and
early fraud warnings conservatively revoke coverage; revocation remains sticky
pending operator investigation. Existing expiry and bounded grace rules remain.
Purchasing never creates Discord ownership or management authority.

## Evidence required before the first real customer

Every row remains a launch gate until its evidence is recorded in JCN-241/JCN-242.

| Gate | Required evidence |
| --- | --- |
| Business settings | Cleo account identity, verification requirements, charge/payout readiness, bank destination, public business/support details, statement descriptor and customer-facing policies reviewed by the maintainer. |
| Tax | Business owner/accountant determines applicable VAT/sales-tax obligations, registrations, product classification, customer location collection and inclusive/exclusive pricing. Configure and test tax calculation only after those decisions; this PR does not enable automatic tax or establish tax compliance. |
| Customer billing | Correct authenticated purchaser/customer association; receipts and invoices; working Portal payment-method updates and cancellation, including after guild access loss; clear renewal and cancellation terms. |
| Price and currencies | Approved Cleo GBP 499/month live Product/Price confirmed. Do not imply other currencies are supported without explicitly configured Prices and transaction tests. Preserve historical subscription mappings. |
| Payment methods | Cleo Dashboard settings, eligible recurring methods and wallet domains reviewed. Test actual card success, decline and authentication, eligible wallets, redirects, cancellation and delayed success/failure on supported devices. |
| Billing lifecycle | A real sandbox purchase, signed Convex webhook, matching payment evidence and guild entitlement; replay/reordering; renewal; failed collection and grace expiry; scheduled/immediate cancellation; entitlement expiry; refund, dispute and early fraud warning. Record Stripe IDs and resulting Convex state without secrets. |
| Operations | Confirm current consumers of both legacy webhook destinations. Verify new endpoint signatures, retries, monitoring, secret rotation and reconciliation recovery. Assign refund/dispute response ownership and document manual review of sticky revocation. |
| Release | Required checks and maintainer review complete; JCN-241 acceptance recorded; explicit JCN-242 approval for a separately reviewed live-capable adapter and production configuration. This test-only PR cannot accept a real charge. |

Official references: [Checkout Elements](https://docs.stripe.com/payments/accept-a-payment?payment-ui=elements&api-integration=checkout),
[dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods),
[Customer Portal](https://docs.stripe.com/customer-management),
[payment method domains](https://docs.stripe.com/payments/payment-methods/pmd-registration),
[Stripe Tax setup](https://docs.stripe.com/tax/set-up),
[tax registrations](https://docs.stripe.com/tax/registering),
[webhook handling](https://docs.stripe.com/webhooks), and
[dispute handling](https://docs.stripe.com/disputes/how-disputes-work).
