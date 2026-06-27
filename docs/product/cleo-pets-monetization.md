# Cleo Pets monetization and entitlement contract

Status: implementation-ready product contract for JCN-114. This document
constrains JCN-108, JCN-109, and JCN-110. Billing persistence and provider
integration remain owned by JCN-53, JCN-57, and JCN-58.

## Product invariants

1. Free users can adopt one starter pet, progress it, play unranked battles,
   qualify for ranked battles through gameplay, and publish one basic Cleo
   Profile/Card.
2. Money never changes ranked combat stats, matchmaking, ranked energy,
   evolution strength, move power, reward odds, or leaderboard scoring.
3. Paid value is expression, collection capacity, additional unranked play,
   richer layouts, and guild-hosted events.
4. Every paid or granted benefit resolves through one entitlement contract.
   Commands, dashboard pages, jobs, and widgets must not inspect Stripe,
   Discord SKU, role, or grant records directly.
5. Public profile/card/widget payloads contain selected presentation and game
   state only. Commerce evidence and private operational data never leave
   authenticated backend surfaces.

The executable vocabulary and baseline limits live in
`packages/shared/src/cleoEntitlements.ts`.

## Existing repository state

At JCN-114 design time, the repository has Stripe server environment entries
and dormant generic `PLANS`/`ENTITLEMENT_*` constants, but no billing tables,
entitlement resolver, checkout implementation, webhook synchronization, or
public pricing page. Those generic constants are not authoritative for Cleo
Pets and must not be used for pet/profile feature gates. JCN-53/JCN-57 should
either replace them with the provider-neutral contract in this document or
remove them after confirming no other product surface depends on them.

## Entitlement categories

| Category                       | Owner         | Persistence semantics                       | Allowed benefit                |
| ------------------------------ | ------------- | ------------------------------------------- | ------------------------------ |
| `free`                         | Every user    | Implicit; never stored as a purchase        | Starter loop and basic profile |
| `user-subscription`            | User          | Active/trial/grace lifecycle                | User subscription bundle       |
| `guild-subscription`           | Guild         | Active/trial/grace lifecycle                | Guild subscription bundle      |
| `durable-one-time-purchase`    | User          | Permanent until refund/revocation           | One named cosmetic asset       |
| `consumable-one-time-purchase` | User          | Append-only credit, then consumption ledger | Unranked energy or event entry |
| `staff-grant`                  | User or guild | Audited and explicitly revocable            | Bundle or durable cosmetic     |
| `creator-grant`                | User or guild | Audited; bundles should be time-bounded     | Bundle or durable cosmetic     |
| `test-grant`                   | User or guild | Non-production only                         | Bundle or durable cosmetic     |

Provider source is separate from category:

- `stripe`: website-originated subscriptions and purchases.
- `discord`: Discord SKU entitlement ownership.
- `staff`: an authenticated JCN staff grant.
- `creator-program`: an approved creator grant.
- `test-fixture`: local/test environments only; production resolution rejects
  it.

`free` is not a synthetic database entitlement. This prevents missing billing
data from breaking the base game.

## Exact free and paid boundaries

### Free baseline

- One owned pet slot.
- One starter adoption.
- Basic XP, leveling, mood, bond, evolution, collection, and earned rewards.
- Five daily unranked energy.
- Ranked access after gameplay eligibility; no paid bypass.
- One Cleo Card layout and the basic profile/card renderer.
- Earnable base cosmetics remain available through play.

### User subscription

- Three total pet slots.
- Three total card layouts.
- Ten daily unranked energy instead of five.
- Premium theme, frame, title, and widget-layout catalogs.
- No ownership of separately sold durable cosmetics unless explicitly included
  by catalog policy.
- No ranked energy, ranked entry, stat, XP, evolution, move, matchmaking, or
  reward-odds advantage.

### Guild subscription

- Guild tournaments and scheduled community events.
- Guild cosmetic pools.
- Shared event rewards that apply only to unranked/community events.
- Guild support/automation extensions may use the same guild entitlement later,
  but are not implemented by JCN-114.
- No member combat-stat boost and no ranked reward multiplier.

### Durable one-time purchase

Permanent ownership of exactly one named:

- Pet skin.
- Card frame.
- Profile theme.
- Profile title.

Refunds, chargebacks, policy revocations, and deleted catalog assets may revoke
future use. Historical receipts remain private. No randomized contents are
allowed.

### Consumable one-time purchase

Allowed consumables:

- Additional unranked energy.
- Explicit event entries.

Resolver caps are 25 banked unranked energy and 10 banked event entries. A
purchase must disclose the exact quantity before checkout. Consumables cannot
affect ranked play, stats, XP rate, evolution, hidden odds, or matchmaking.
Consumption must be an idempotent Convex ledger mutation; never decrement a
provider entitlement record.

## Resolution contract

All feature checks call a Convex-owned resolver equivalent to
`resolveCleoPetAccess` with:

- Current Cleo user ID.
- Optional active guild ID.
- Current time and deployment environment.
- Normalized Convex entitlement records.

The resolver:

1. Starts with the free baseline.
2. Rejects wrong-subject, future, expired, revoked, invalid-source, invalid
   benefit, malformed consumable, and production test records.
3. Treats `active` as eligible and `trialing` as eligible for subscriptions.
4. Treats subscription `grace` as eligible only before an explicit
   `graceEndsAt`.
5. Merges user and active-guild bundles without converting guild benefits into
   personal combat benefits.
6. Deduplicates durable cosmetic keys.
7. Caps consumable balances.
8. Returns applied/rejected internal entitlement IDs for private diagnostics.

`trialing` and `grace` are valid only for subscription categories. Purchases
and grants must be `active`; a refunded, expired, or revoked record never
resolves.

Provider lifecycle normalization happens before resolution:

- A subscription canceled at period end remains `active` until its paid
  `endsAt`.
- Provider payment failures become `grace` only when Cleo has an explicit,
  bounded grace policy; otherwise they are inactive.
- Refunds and chargebacks revoke the affected durable or unconsumed purchase.
- Discord subscription objects are lifecycle/reporting inputs. Discord
  entitlements determine Discord-originated access.

## Required Convex persistence for JCN-53/JCN-57

Do not add Prisma or revive legacy premium tables. Recommended tables:

### `commerceCustomers`

Private provider-customer mappings keyed by Cleo user. Store provider IDs,
timestamps, and reconciliation state. Never return this table to public profile
queries.

### `commerceSubscriptions`

One normalized lifecycle record per provider subscription. Keep provider status,
current period end, cancel-at-period-end, subject, product mapping, and last
provider event. It is not queried directly by product features.

### `commerceEntitlements`

Provider-neutral grants matching the shared contract:

- Category, source, user/guild subject.
- Bundle or durable/consumable benefit.
- Normalized lifecycle and validity timestamps.
- Private provider evidence ID.
- Stable idempotency key.
- Created/updated/revoked timestamps.

Unique indexes must prevent the same Stripe event, Discord entitlement, or
manual grant from producing duplicate access.

### `consumableLedger`

Append-only credit/debit entries with operation IDs. Balance is derived or
transactionally cached. Every debit is idempotent and rejects negative balance.
If unconsumed credit lots are passed to the shared resolver, their quantities
must already reflect ledger debits; raw provider purchase history is never
summed as current balance.

### `entitlementGrantAudit`

Staff/creator/test grant actor, reason code, scope, expiry, revocation actor, and
timestamps. Free access never depends on a grant.

## Provider and checkout boundary

JCN-114 does not implement payment providers.

When JCN-53/JCN-58 implement website commerce:

- Use Stripe Billing plus Checkout Sessions for subscriptions.
- Use Checkout Sessions for durable and consumable one-time purchases.
- Use Stripe-hosted Customer Portal for subscription self-service.
- Use Stripe Prices and Stripe-supported adaptive currency behavior.
- Never calculate or display fabricated exchange rates.
- Convex synchronizes signed provider events and remains Cleo's backend source
  of truth.

For Discord commerce:

- Map Discord SKUs to the same internal categories/benefits.
- Resolve access from Discord entitlements.
- Use Discord subscriptions only for lifecycle and reporting.
- Never expose raw SKU, entitlement, subscription, or billing IDs publicly.

Stripe and Discord product identifiers belong in private deployment
configuration/catalog records, not source-code feature gates.

## Pricing and upgrade copy

Public pricing must:

- Name the exact owner: user or guild.
- Say whether payment is recurring, durable, or consumable.
- State the exact included quantity and cap for consumables.
- Mark additional battle energy as unranked only.
- Say cancellation timing and durable ownership behavior plainly.
- Render provider-returned prices/currencies only.

Upgrade prompts must:

- Appear after a user intentionally selects a paid feature.
- Show the free alternative when one exists.
- Avoid countdown pressure, repeated cooldown prompts, fake scarcity, and
  ambiguous “premium” wording.
- Never imply that payment improves ranked win probability.

## Public payload safety

Public Cleo Profile/Card/Widget serializers must allowlist fields. They must not
include:

- Email or Clerk identity.
- Stripe customer, subscription, Price, Checkout, invoice, or payment IDs.
- Discord SKU, entitlement, or subscription IDs.
- Entitlement/grant evidence or internal entitlement IDs.
- Private guild IDs.
- Support tickets or submitted support messages.
- Moderation records.
- Tokens, secrets, internal logs, or Linear data.

`isCleoPublicProfilePayloadSafe` is a defense-in-depth test/runtime guard. It
does not replace an allowlisted public DTO.

## Required acceptance tests for pet implementation

JCN-108/JCN-109 must preserve these vectors:

1. No records still yields the complete free loop.
2. User subscription changes capacity, expression, and unranked energy only.
3. Guild subscription changes guild event capabilities only.
4. Durable ownership resolves one explicit cosmetic.
5. Consumables cap and never create ranked capability.
6. Expired/revoked/wrong-subject/wrong-source records fail closed.
7. Production rejects test grants.
8. Public payloads reject all private commerce and operational fields.
9. Ranked stat calculation accepts no entitlement input.
10. Battle rewards and random rolls accept no billing source or price input.
