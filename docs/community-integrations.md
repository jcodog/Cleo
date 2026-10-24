# Community integration setup and acceptance

## Release state

Automated moderation is **locked in code** by `MODERATION_ROLLOUT_LOCKED` in
`packages/shared/src/moderation/index.ts`. Dashboard controls are disabled,
policy writes reject enabled rules or enforcement, both legacy Discord module
mutations reject enabling moderation, bot policy endpoints return no active
policy, and enforcement endpoints refuse actions. Environment flags cannot
unlock this release. Discord does not request Message Content through its
default client options while the lock is present. Existing historical manual
moderation records remain available. No production data was changed.

The engine, policy storage, bounded cache, adapters and tests are present for a
later moderation release. That release needs a reviewed code change to remove
the lock and a separate permission and false-positive acceptance exercise.
Do not set the moderation environment flags to true now.

All setup below is an operator checklist. Creating this branch does not create
Discord channels, register metadata, change production secrets, deploy services,
enable community role assignment, send announcements or activate live billing.
Normal Convex codegen was run against the existing development deployment.

## Where configuration goes

Use separate development Discord applications, communities and Stripe test
resources. Set backend secrets in the intended **Convex deployment's environment
variables**, never dashboard `NEXT_PUBLIC_*` variables. Dashboard continues to use
its existing Clerk and Convex public configuration.

| Variable                               | Location                         | Value or purpose                                                                                          |
| -------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLEO_OFFICIAL_GUILD_ID`               | Convex and Discord bot           | Official Cleo server snowflake; excluded from external-community qualifications and purchases             |
| `DISCORD_APPLICATION_ID`               | Convex; metadata script shell    | The matching Discord application ID                                                                       |
| `DISCORD_CLIENT_SECRET`                | Convex only                      | Application OAuth secret                                                                                  |
| `DISCORD_APPLICATION_PUBLIC_KEY`       | Convex only                      | Developer Portal application's Ed25519 public key, 64 hex characters                                      |
| `DISCORD_ROLE_CONNECTION_REDIRECT_URL` | Convex only                      | Exact HTTPS dashboard URL ending `/discord/linked-role`; register the identical OAuth redirect in Discord |
| `DISCORD_TOKEN_ENCRYPTION_KEY`         | Convex only                      | Base64 encoding of 32 cryptographically random bytes; retain it securely for token decryption             |
| `DISCORD_BOT_TOKEN`                    | Existing Convex and bot settings | Same application's bot token; script needs it only for explicit metadata registration                     |
| `CLEO_MANAGED_ROLE_IDS`                | Convex only                      | JSON mapping of allowed role keys to official-server role IDs; omit `premiumSupporter`                    |
| `CLEO_COMMUNITY_ROLES_ENABLED`         | Convex and Discord bot           | Leave absent or `false`; set both to `true` only for an authorised role rollout                           |
| `CLEO_RECOGNITION_ENABLED`             | Convex only                      | Leave absent or `false`; controls real announcement delivery                                              |
| `CLEO_COMMUNITY_UPGRADES_CHANNEL_ID`   | Convex only                      | Official server's `#community-upgrades` text channel ID                                                   |
| `CLEO_LINKED_ROLES_FAQ_CHANNEL_ID`     | Operator reference in Convex     | Optional FAQ channel ID; source is rendered for manual publication, no posting worker uses it             |
| `STRIPE_SECRET_KEY`                    | Convex only                      | **Test** secret beginning `sk_test_`; live keys are rejected by this adapter                              |
| `STRIPE_WEBHOOK_SECRET`                | Convex only                      | Signing secret for the matching test-mode webhook endpoint                                                |
| `STRIPE_GUILD_PREMIUM_PRICE_ID`        | Convex only                      | Approved recurring guild Premium test Price ID                                                            |
| `STRIPE_TEST_CHECKOUT_ENABLED`         | Convex only                      | Leave absent or `false`; set `true` only in the test environment after setup                              |
| `CLEO_DASHBOARD_ORIGIN`                | Convex only                      | Trusted HTTPS dashboard origin, no path, query or fragment                                                |

Existing `CLERK_SECRET_KEY`, `DISCORD_BOT_CONVEX_SECRET`, `TWITCH_WORKER_SECRET`
and Twitch credentials remain authoritative. Do not replace working secrets.
Generate encryption material with a cryptographic tool, for example
`openssl rand -base64 32`, then place it privately in Convex. Do not log it or
commit it. Changing that key without a key migration requires users to reconnect.

## Discord Developer Portal and official server

1. In Installation, enable both Guild Install and User Install. User Install
   requires `applications.commands`; preserve existing guild installation scopes
   and permissions. The dashboard offers separate account and server buttons.
2. Add the exact role-connection OAuth redirect above. Set the Linked Roles
   verification URL to the dashboard's `/account/roles` page. The flow requests
   `identify role_connections.write`, uses a five-minute single-use state bound
   to the signed-in user's current linked Discord identity, and encrypts tokens.
3. Configure the application event webhook URL as
   `https://<development-deployment>.convex.site/discord-application-webhook`.
   Subscribe to `APPLICATION_AUTHORIZED` and `APPLICATION_DEAUTHORIZED`.
   Discord's signed PING must receive 204. Test an invalid signature as well.
4. Register global commands through the existing bot registration workflow.
   `/ping` supports user and guild installation contexts. Guild-only commands
   retain their guild restrictions. An account install link click is never
   installation proof. Use `/ping` from a user-install context to verify it.
5. Preview metadata locally: `bun scripts/register-discord-role-metadata.ts`.
   After explicit operator authorisation, set the script shell's application ID
   and bot token and run `bun scripts/register-discord-role-metadata.ts --apply`.
   This registers exactly five fields, not Discord server roles.
6. In official Server Settings, create permission-free roles. Configure native
   Linked Role requirements: `personal_premium = 1`, `creator_pro = 1`,
   `community_owner_tier >= 1` or `>= 2`, `community_manager_tier >= 1` or
   `>= 2`, and `premium_supporter = 1`. Standard and Premium roles can stack.
   Personal and Creator billing are unavailable, so their metadata stays zero.
7. Configure only the intended automatic role IDs. Supported keys are `member`,
   `personalPremium`, `creatorPro`, `discordBotUser`, `twitchBotUser`,
   `communityOwner`, `premiumCommunityOwner`, `communityManager`, and
   `premiumCommunityManager`. IDs must be distinct, roles must have no Discord
   permissions, and they must be below the bot's role. Grant the bot Manage
   Roles. Do not add `premiumSupporter` to this mapping: it is native, opt-in,
   and claimed by the user. No unrelated roles are modified.
8. Create `#linked-roles-faq` manually if it does not exist. Allow members to
   View Channel and Read Message History; allow only authorised maintainers to
   Send Messages. Render the maintained text with
   `bun scripts/register-discord-role-metadata.ts --faq`, then publish its
   paragraphs as messages within Discord's message-length limits. No publication
   was performed during development.
9. Create `#community-upgrades` manually when recognition is approved. Members
   need View Channel and Read Message History. The bot needs View Channel, Send
   Messages, Embed Links and Read Message History. Record its ID in Convex.
   The delivery action verifies the channel belongs to the official server.

Role synchronization uses the existing Discord process. It claims bounded jobs
every 15 seconds, checks fresh Discord membership through Clerk OAuth, and
reconciles linked accounts every five minutes. External community authority
expires after five minutes without verified refresh. Owner and Administrator
eligibility remain independent; Manage Server alone is insufficient for manager
roles or purchases. Installation evidence expires after 24 hours and becomes
verification-needed. Discord does not provide a general bot endpoint to poll all
personal installations; signed events and fresh user-install interactions are
the supported evidence. Ambiguous deauthorization never confirms installation.
Periodic role bootstrapping runs only when the Convex community-role gate is
enabled. It inserts missing jobs without resetting existing retry backoff,
revisions or active leases. Disconnecting Linked Roles while a token refresh or
metadata update holds the lease returns a retryable error. Wait one minute and
retry; success means the grant was revoked or was already disconnected.
Only the Discord shard caching the available official guild claims role jobs.
Provider preparation runs in parallel for at most five users under a two-minute
preparation lease. Dispatch rechecks worker/revision ownership and supplies a
fresh one-minute lease. Guild loss settles unfinished claims as failed.

## Stripe test setup

1. In Stripe test mode, create the recurring server Premium Product and Price.
   Through trusted Convex administration on the **dev** deployment, invoke
   `mutations/internal/guildBilling:configurePrice` with
   `{ "stripeProductId": "prod_...", "stripePriceId": "price_...", "enabled": true }`.
   Set `STRIPE_GUILD_PREMIUM_PRICE_ID` to that same Price ID.
2. Configure a test Customer Portal that permits viewing invoices and cancelling
   the relevant subscription. Checkout and Portal are Stripe-hosted. Returning
   from Checkout does not grant entitlements.
3. Create a test webhook endpoint at
   `https://<development-deployment>.convex.site/stripe-community-webhook`, using
   API version **2025-03-31.basil**. Subscribe to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`, `charge.refunded`,
   `charge.dispute.created`, and `charge.dispute.closed`. Configure its signing
   secret in Convex. Basil invoices use `payments`, not the removed `paid` field.
4. Enable `STRIPE_TEST_CHECKOUT_ENABLED=true` in dev. Sign in as a verified owner
   or Administrator of an independent Cleo-installed test server without existing
   Premium coverage. Open that server's Settings and choose Checkout. Both public
   recognition preferences start off. Community identity consent is separate.
5. Complete payment using Stripe's documented test payment methods. Confirm a
   signed webhook, retrieved subscription, successful PaymentIntent and matching
   charge create guild-scoped coverage. A second buyer must be blocked while
   Checkout or coverage exists. `/account/billing` exposes only the payer's
   purchases and billing management, including after loss of guild permissions.
6. Test duplicate and reordered webhook delivery, failed payment, scheduled
   cancellation, immediate cancellation, period expiry, refund and dispute.
   Refreshes fetch current Stripe state under a transactional subscription lease.
   Failed payments get one day of bounded grace. Refunds, partial refunds and
   disputes conservatively revoke coverage; reversal is sticky pending operator
   investigation, including disputes later won. A new payment event cannot
   silently undo that revocation.
7. Test payments never qualify for public Supporter recognition or announcements.
   Deterministic fixtures cover real-mode recognition privacy without contacting
   Discord. Live charging requires a separate reviewed change to the test-only
   adapter and separately approved Stripe setup. No live key or charge was used.

Checkout reservations and Stripe idempotency keys prevent concurrent duplicate
session creation. A reservation abandoned before any Stripe session request can
be replaced by its purchaser with fresh expiry and consent. Once session creation
starts, concurrent retries share its idempotency key; timeouts and conflicts keep
it fenced. A definitive Stripe parameter rejection releases it for a fresh retry.
Uncertain expired reservations remain blocked until provider reconciliation.
Recovery retries every five minutes initially, then hourly after attempt 12,
until Stripe confirms expiry or a completed subscription is reconciled. Known
subscriptions refresh every five minutes. Failed reconciliation always releases
its worker's lease so webhook retries can recover immediately. Subscriptions
without Cleo checkout metadata are acknowledged without granting coverage;
malformed managed subscriptions still fail closed. Invoices with incomplete pagination or
more than ten payments fail closed for manual reconciliation. Subscription
entitlements continue to use the existing Convex resolver.

Subscription reconciliation now selects at most 20 indexed due records per
batch. Failures remain due for a later retry; verified canceled, revoked and
expired records leave the recurring queue. Before enabling this integration on
an existing deployment, initialize legacy billing records once. From
`packages/backend`, on the intended development deployment, run:

```sh
bunx --no-install convex run premiumPurchases:backfillReconciliation '{}'
```

This internal mutation processes 100 records at a time and schedules its own
continuation. It is safe to repeat. `nextReconcileAt` is absent on legacy rows,
numeric for scheduled work and `null` after verified terminal/expired state.
An expired legacy active row gets one provider reconciliation before leaving the
queue. Run the equivalent migration in production only as part of a separately
approved release through the existing coordinator. No production migration was
performed during development. No new environment variables are required.

Native Linked Roles sweeps select only active connections due for refresh;
permanently revoked history is excluded by index. Unknown refund/dispute events
are acknowledged after retrieving the charge and proving its customer has no
managed subscription or open community checkout. A known customer's incomplete
payment association keeps failing closed until payment reconciliation supplies
the evidence. Recognized reversals remain sticky.

## Recognition and privacy

An eligible first paid activation creates one durable outbox record. Renewals,
free/test/staff grants, zero-paid invoices and incomplete checkouts do not create
public recognition. Delivery checks purchaser consent, community publication
consent, current identity binding, paid eligibility and installed guild state.
Role visibility and announcements are separate opt-ins. An Administrator's
message says they sponsored the community, never that the owner authorised it.

Discord delivery uses a stable nonce and one send attempt. Ambiguous sends become
`uncertain`; reconciliation matches the bot author's reference footer in the last
100 channel messages, in the verified official-server channel. An unmatched row
moves to `investigation`, leaving subsequent uncertain records serviceable. It
is never returned to the send queue automatically. Investigate that state using
Discord history and the stable reference footer; do not clear it to `pending`
or blindly resend. Network failures leave rows uncertain for later recovery.
Consent withdrawal prevents pending publication but does not
delete a message already posted. Preserve Stripe receipts/payment associations
for durable idempotency and reversal handling.

The moderation release lock also short-circuits Twitch processing before cache
access. Future unlocked runtime histories are isolated by Discord channel while
sharing guild policy caches. They retain at most 256 message IDs, timestamps and
SHA-256 comparison digests per history, with at most the configured number of
histories. Raw history remains subject to the original 65,536-character engine
budget. Four concurrent background policy refreshes are deduplicated and do not
block Twitch readiness. These changes do not enable moderation.

## VPS changes and safe rollout after review

No VPS command was executed. No new service, worker, database, proxy route,
systemd unit or host-controller upgrade is needed for this implementation.
After merge and a separately authorised release, use the existing protected
release coordinator and artifact deployment workflow documented in
[Discord deployment](discord-production-deployment.md) and
[Twitch bootstrap](twitch/bootstrap.md). Do not copy source into running releases.

For automatic community roles, add only `CLEO_OFFICIAL_GUILD_ID` and, when ready,
`CLEO_COMMUNITY_ROLES_ENABLED=true` to `/etc/cleo/discord-bot.env`. Keep it
`root:cleo`, mode `0640`, and set the same rollout gate plus the role map in
Convex. The existing `cleo-discord.service` loads the environment on its next
approved deployment/restart. Use `journalctl -u cleo-discord.service` to inspect
sanitized reconciliation failures and verify only allowlisted test roles change.

The Twitch runtime must eventually receive the new reviewed artifact for its
chat routing changes; `/etc/cleo/twitch-bot.env` and `cleo-twitch.service` otherwise
keep their existing configuration. Do not enable Twitch moderation scopes or
`TWITCH_MODERATION_ENFORCEMENT_ENABLED` for this release. Leave Discord
`DISCORD_MESSAGE_CONTENT_ENABLED` and `DISCORD_MODERATION_ENFORCEMENT_ENABLED`
absent or `false`. Even setting them cannot bypass the backend release lock.

In dev, verify account install and removal, wrong-account OAuth rejection, native
role claiming and disconnect, external owner/Admin permission loss, server bot
removal, subscription changes and consent withdrawal. Confirm unrelated Discord
roles remain unchanged. Keep announcements off while using actual communities.
Finally, verify every moderation switch is disabled and direct enable API calls
are rejected. Production moderation activation remains deferred.

## Implementation validation

The combined Cubic/Grok correction pass adds recovery, query-count, concurrency,
privacy and boundary regressions for the 16 outstanding findings. Final coverage
passed all nine workspace tasks on the second full run, with no assertions or
coverage thresholds weakened. The first run identified an uncovered bounded
history rollover branch; its regression now verifies the capacity boundary.

| Workspace   | Passing tests | Reported statements / branches / functions / lines |
| ----------- | ------------: | -------------------------------------------------- |
| Shared      |            88 | 100% / 100% / 100% / 100%                          |
| Backend     |           331 | 100% / 100% / 100% / 100%                          |
| Discord bot |           316 | 100% / 100% / 100% / 100%                          |
| Twitch bot  |           124 | 100% / 100% / 100% / 100%                          |
| Dashboard   |            98 | 100% / 100% / 100% / 100%                          |
| Environment |            23 | 100% / 100% / 100% / 100%                          |
| Logger      |             7 | 100% / 100% / 100% / 100%                          |
| Landing     |             4 | 100% / 100% / 100% / 100%                          |
| UI          |             2 | 100% / 100% / 100% / 100%                          |

Total: **993 passing tests**. Coverage uses each package's established inclusion
list. Shared and Twitch include their full source scopes; backend, Discord and
dashboard have explicit existing coverage allowlists. These percentages do not
claim every new integration file has 100% coverage. The added functional tests
exercise OAuth identity/state, signed application events, test Checkout and
payment reconciliation, refunds, privacy, durable delivery states, policy locks,
cache leases and signed Twitch chat routing.

Executed successfully: changed-file Prettier check, `bun run lint:ci`,
`bun run typecheck`, `bun run test:ci` with Git Bash on PATH,
`bun run test:coverage --concurrency=1 --continue`, and `bun run build`.
The eight added browser checks exercise real React callback effects in Strict
Mode, URL cleanup and independent recognition preferences through the existing
Twitch Playwright fixture. The full Twitch/browser suite passed 27 checks and
welcome verification passed 12 checks across Chromium and Firefox. GitHub CI
results are recorded on the PR; no additional review was requested.
Coverage executes the
same test suites as package `test` scripts; a redundant final root test run was
not added. Final coverage reran affected workspaces and reused unchanged Turbo tasks.

No external Discord installation, native-role claim, actual Stripe Checkout,
live webhook delivery or VPS deployment was fabricated. Those operator smoke
checks remain the setup/acceptance steps above. GitHub CI and requested automated
PR reviews are separate evidence and must be checked on the PR.

Protocol references: [Discord Linked Roles](https://docs.discord.com/developers/tutorials/configuring-app-metadata-for-linked-roles),
[Discord application events](https://docs.discord.com/developers/events/webhook-events),
[Stripe Basil invoice payments](https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices).
