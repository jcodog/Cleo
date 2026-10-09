# Guild billing and Premium access

JCN-53 and JCN-57's October beta scope uses Convex as the billing authority. The Linear plugin, direct Linear MCP and connected GitHub issue tools were unavailable during implementation. Scope follows the supplied requirements and the repository, including Welcome Cards from PR #247 on main. The linked issues are [#29](https://github.com/jcodog/Cleo/issues/29) and [#33](https://github.com/jcodog/Cleo/issues/33).

## Authority and lifecycle

`billingCustomers` associates one Stripe customer with an existing Clerk user. `guildSubscriptions` binds a subscription permanently to that customer and one explicit Discord guild. The same customer can purchase another subscription for another guild. A billing owner has no additional guild-management permissions.

`guildBillingPrices` explicitly approves Product/Price pairs for guild Premium. Disabling a price immediately removes its subscription benefits. This is an operational kill switch, not a plan migration mechanism. Migrations should register the replacement price before reconciling subscriptions.

All billing writes are internal Convex mutations in `mutations/internal/guildBilling`. No dashboard or bot caller can submit authoritative billing claims. The eventual trusted Stripe adapter must verify webhook signatures and customer ownership, resolve the purchased guild, approve the Product/Price pair, and submit a full subscription snapshot.

`reconcileSubscription` records trusted event IDs, a canonical payload, event timestamps, the applied/stale outcome and a monotonically increasing reconciliation revision. Exact retries have no effect; conflicting event-ID reuse fails. Older revisions or event timestamps cannot overwrite current state. The adapter must serialize reconciliation per subscription and derive revisions from authoritative snapshots, rather than blindly numbering webhook arrival order. `eventCreatedAt` is the time of the verified Stripe snapshot. Reconciliation must retrieve current Stripe state when events conflict or arrive out of order.

`resolveCleoGuildAccess` in `packages/shared/src/cleoEntitlements.ts` resolves trusted records for the selected guild only. Convex's `getGuildAccess` validates stored customer, guild and approved-price associations before calling it. Both guild capabilities are supported:

- `guild.welcome.premium-style`
- `guild.twitch.premium-style`

Active access ends at the paid period deadline. Trial access additionally ends at the trial deadline. Past-due subscriptions receive only an explicitly recorded grace period, capped at seven days from the first payment failure. Grace may outlive the previous paid period. Repeated failed-payment updates cannot restart grace; a verified recovery clears the failure interval. Scheduled cancellation retains access through the period; immediate cancellation, unpaid, paused, incomplete, expired or revoked state grants no access. Canceled, incomplete-expired and revoked subscriptions cannot be revived into paid access; use a new subscription.

Subscription evidence expires seven days after its trusted snapshot timestamp, even if the paid period is longer. Subsequent Stripe integration must refresh active subscriptions before that deadline. Reading or replaying old events does not refresh evidence. Invalid or missing lifecycle data fails closed. Expiry is evaluated on reads, so it does not depend on a cron job.

Complimentary, staff and test grants bind to one guild and explicit capabilities. Every grant requires an active staff issuer, a reason, a unique idempotency key and a finite expiry. Revocations preserve the issuer and record the revoker, reason and time. Test grants last at most seven days and can target a real development guild on the chosen deployment. They never apply to other guilds or supply manager authority.

The dashboard consumes the resolver through its managed guild overview. Discord consumes the same resolver through its authenticated runtime configuration action. Convex-based Twitch delivery can consume `getGuildAccess` or `queries/internal/guildEntitlements:resolve`; the existing Twitch card design stays unchanged pending its separate styling work.

## Subsequent development-guild activation

No real grant is seeded by the code, migrations or tests. After an explicitly approved deployment:

1. Confirm the actual development guild's Discord snowflake and existing Convex `guilds` record. Confirm an active staff `users` record for attribution and the manager's verified guild membership.
2. Invoke the internal `mutations/internal/guildBilling:issueGrant` function through trusted Convex administration on the intended deployment. Supply a unique `grantKey`, that `discordGuildId`, `category: "test"`, `capabilities: ["guild.welcome.premium-style"]`, `startsAt` and `endsAt` in epoch milliseconds, the staff user's Convex ID as `issuedBy`, and a reason. Use a short window within the seven-day limit.
3. Open that guild's Welcome page, save a Premium design and verify a real member-join delivery. Confirm a second free guild cannot save or render the design.
4. Invoke `mutations/internal/guildBilling:revokeGrant` with the same key, `revokedBy` and a reason. Verify Classic delivery and retained styling. A later valid grant should restore the saved design.

Use `queries/internal/guildEntitlements:resolve` to inspect capability decisions without exposing customer or subscription identifiers. No permanent developer override exists.

## Remaining integration

Stripe signature verification, webhook ingestion, reconciliation scheduling and authenticated purchase-to-guild selection are subsequent work. Configure real approved Product/Price IDs and verified customer associations through trusted integration code before accepting paid snapshots. Checkout, Customer Portal, live payments and live guild activation are outside this implementation.
