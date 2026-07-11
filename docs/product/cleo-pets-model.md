# Cleo Profiles and Pets foundation

This contract covers JCN-108 and JCN-109's backend foundation. It does not
implement battles, Discord widget publishing, or the JCN-110 card editor.

## Ownership and persistence

- `cleoProfiles` owns account-level public-card settings and the selected
  `activePetId`.
- `cleoPets` owns pet identity, progression, derived stats, evolution, mood,
  bond, equipped cosmetics, and a stable battle summary.
- `cleoPetInventories` owns collection keys and consumable balances. Slot and
  balance limits come from the entitlement resolver, not client input.
- `cleoPetBattleRecords` is an immutable result snapshot for future battle
  implementations. Opponents are stored as sanitized species/level snapshots,
  not account or guild identifiers.
- Any mutation that changes `activePetId` must verify the pet's `ownerUserId`
  matches the profile's `userId`.

Species and cosmetic IDs use stable lowercase catalog keys. They remain strings
so content can expand without a schema migration; shared validators constrain
their format before writes.

## Deterministic progression

Pet XP is a non-negative cumulative integer. Level starts at 1 and caps at 100.
The XP needed to advance from level `L` is:

```txt
100 + 25 × (L - 1) + 5 × (L - 1)²
```

Stored level and derived stats are snapshots for efficient reads. Write paths
must recompute them with the shared progression helpers rather than trusting a
client value.

Each species catalog entry supplies base and per-level growth values for
vitality, power, guard, speed, and focus. Base values are 0–250, growth is 0–10,
and derived values cap at 999. Evolution adds a flat per-stat bonus of 10 for
`evolved` and 25 for `ascended`; evolution requirements belong to future game
rules and must not be inferred from paid entitlements.

Mood is 0–100 and bond is 0–1,000. Battle counters, rating, season points,
consumable rewards, and collection percentages have explicit shared bounds.
No paid entitlement may alter ranked stat calculation, XP curves, matchmaking,
or ranked rewards.

## Public profile safety

Public cards are constructed by `buildCleoPublicProfileCard`; callers cannot
serialize database documents directly. The builder:

- exposes only fields selected in `visibleFields`;
- omits account IDs, pet IDs, guild IDs, entitlement/billing data, support and
  moderation records, internal logs, and raw Linear data;
- strips email addresses, URLs, and issue identifiers from public text;
- grants the Cleo Developer badge only to current `staff`, `admin`, or
  `superadmin` roles when the user has opted in;
- exposes only sanitized aggregate Forge fields from a bounded cache snapshot.

Public routes must additionally require `publicEnabled` and resolve profiles by
`publicSlug`, never by a Clerk ID or Convex document ID.

## Deferred surfaces

- The JCN-110 settings UI and preview must render the exact shared public DTO.
- Discord publishing remains JCN-111. The
  `cleoDiscordProfileWidgetPublishing` feature gate fails closed when no gate
  record exists.
- Battle simulation, matchmaking, rewards, and evolution mutations are not part
  of this foundation.
