# Guild billing and Premium access

The original foundation described below now has a test-mode Checkout, Portal,
verified webhook and reconciliation adapter. See
[community integration setup](community-integrations.md) for current setup,
acceptance checks, rollout locks and live-billing limitations.

JCN-53 and JCN-57's October beta scope uses Convex as the billing authority. The Linear plugin, direct Linear MCP and connected GitHub issue tools were unavailable during implementation. Scope follows the supplied requirements and the repository, including Welcome Cards from PR #247 on main. The linked issues are [#29](https://github.com/jcodog/Cleo/issues/29) and [#33](https://github.com/jcodog/Cleo/issues/33).

## Authority and lifecycle

`billingCustomers` associates one Stripe customer with an existing Clerk user. `guildSubscriptions` binds a subscription permanently to that customer and one explicit Discord guild. The same customer can purchase another subscription for another guild. A billing owner has no additional guild-management permissions.

`guildBillingPrices` explicitly approves Product/Price pairs for guild Premium. Disabling a price removes its subscription benefits on the next authoritative read. Discord observes revocation within at most 60 seconds. This is an operational kill switch, not a plan migration mechanism. Migrations should register the replacement price before reconciling subscriptions.

All billing writes are internal Convex mutations in `mutations/internal/guildBilling`. No dashboard or bot caller can submit authoritative billing claims. The eventual trusted Stripe adapter must verify webhook signatures and customer ownership, resolve the purchased guild, approve the Product/Price pair, and submit a full subscription snapshot.

`reconcileSubscription` records trusted event IDs, a canonical payload, event timestamps, the applied/stale outcome and a monotonically increasing reconciliation revision. Exact retries have no effect; conflicting event-ID reuse fails. Older revisions or event timestamps cannot overwrite current state. The adapter must serialize reconciliation per subscription and derive revisions from authoritative snapshots, rather than blindly numbering webhook arrival order. `eventCreatedAt` is the time of the verified Stripe snapshot. Reconciliation must retrieve current Stripe state when events conflict or arrive out of order.

`resolveCleoGuildAccess` in `packages/shared/src/cleoEntitlements.ts` resolves trusted records for the selected guild only. Convex's `getGuildAccess` validates stored customer, guild and approved-price associations before calling it. Both guild capabilities are supported:

- `guild.welcome.premium-style`
- `guild.twitch.premium-style`

Active access ends at the paid period deadline. Trial access additionally ends at the trial deadline. Past-due subscriptions receive only an explicitly recorded grace period, capped at seven days from the first payment failure. Grace may outlive the previous paid period. Repeated failed-payment updates cannot restart grace; a verified recovery clears the failure interval. Scheduled cancellation retains access through the period; immediate cancellation, unpaid, paused, incomplete, expired or revoked state grants no access. Canceled, incomplete-expired and revoked subscriptions cannot be revived into paid access; use a new subscription.

Subscription evidence expires seven days after its trusted snapshot timestamp, even if the paid period is longer. Subsequent Stripe integration must refresh active subscriptions before that deadline. Reading or replaying old events does not refresh evidence. Invalid or missing lifecycle data fails closed. Reconciliation rejects event timestamps before the period starts and lifecycle timestamps inconsistent with the trusted event. Expiry is evaluated on reads, so it does not depend on a cron job.

Complimentary, staff and test grants bind to one guild and explicit capabilities. Every grant requires an active staff issuer, a reason, a unique idempotency key and a finite expiry. Revocations preserve the issuer and record the revoker, reason and time. Test grants last at most seven days and can target a real development guild on the chosen deployment. They never apply to other guilds or supply manager authority. Identical issuance retries remain idempotent after expiry or revocation, and capability order does not change the grant terms.

The dashboard consumes the resolver through its managed guild overview. Discord consumes the same resolver through its authenticated runtime configuration action. Convex-based Twitch delivery can consume `getGuildAccess` or `queries/internal/guildEntitlements:resolve`; the existing Twitch card design stays unchanged pending its separate styling work.

## Read bounds and overlap rules

Access reads use guild/status/deadline indexes, excluding expired subscription history and revoked grants. Ingestion limits concurrent sources to 64 subscriptions per live status and 64 unrevoked, unexpired grants per guild. Reads detect excess sources and fail closed. Product, customer and owner validation deduplicates IDs and batches lookups. Historical rows remain available for audit.

Valid sources are additive. Each capability lasts until its last valid source expires. The summary state uses active, then trial, then grace precedence, independent of iteration order. `capabilityDeadlines` exposes independent deadlines; the summary `validUntil` is the earliest capability loss. Welcome rendering uses only the Welcome deadline. Discord caches paid decisions for at most 60 seconds, clamped to the actual deadline. On a failed refresh, retained free settings continue using Classic. Saved designs remain stored and ordinary settings saves omit unchanged styling.

## Live Notifications display

The dashboard caches only verified source display fields, Discord destination status and verification time. The session cache holds at most 12 entries for five minutes and is keyed by Clerk user, session, Discord guild and current owner evidence revision. It supports navigation and browser refreshes. Missing or expired display data uses the existing skeleton until initial verification completes. Temporary provider failures preserve the previous display within its deadline. A confirmed reconnect requirement replaces it directly, without refresh badges or animations.

Reactive configuration and subscription state remain live. Owner evidence changes select a new cache key, rejected manager queries invalidate the display, and obsolete asynchronous results are discarded. Configuration edits survive verification. Cache contents never establish authorisation: protected actions still verify Twitch and Discord on the server. The browser fixture uses an isolated transport outside app routes; real provider checks still require a development-guild smoke test after an approved deployment.

## Subsequent development-guild activation

No real grant is seeded by the code, migrations or tests. After an explicitly approved deployment:

1. Confirm the actual development guild's Discord snowflake and existing Convex `guilds` record. Confirm an active staff `users` record for attribution and the manager's verified guild membership.
2. Invoke the internal `mutations/internal/guildBilling:issueGrant` function through trusted Convex administration on the intended deployment. Supply a unique `grantKey`, that `discordGuildId`, `category: "test"`, `capabilities: ["guild.welcome.premium-style"]`, `startsAt` and `endsAt` in epoch milliseconds, the staff user's Convex ID as `issuedBy`, and a reason. Use a short window within the seven-day limit.
3. Open that guild's Welcome page, save a Premium design and verify a real member-join delivery. Confirm a second free guild cannot save or render the design.
4. Invoke `mutations/internal/guildBilling:revokeGrant` with the same key, `revokedBy` and a reason. Verify Classic delivery and retained styling. A later valid grant should restore the saved design.

Use `queries/internal/guildEntitlements:resolve` to inspect capability decisions without exposing customer or subscription identifiers. No permanent developer override exists.

## Remaining integration

The community adapter implements test-mode Stripe signature verification,
webhook ingestion, scheduled reconciliation, fresh owner/Administrator purchase
selection, Checkout and Customer Portal. It uses the existing guild entitlement
tables and resolver. Production configuration, live charging and live activation
remain outside this implementation. Follow the linked setup guide before testing.
