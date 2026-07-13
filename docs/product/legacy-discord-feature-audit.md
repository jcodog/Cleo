# Legacy Discord feature audit

This audit compares the legacy `Cleo-Bot-3` and `Cleo-Bot-main` snapshots with the current Cleo monorepo and Linear project.

The purpose is not to port old files. It is to preserve useful product intent while rejecting obsolete architecture, duplicated products, unsafe assumptions, unfinished placeholders, and generic bot filler.

## Decision meanings

- **Rebuilt** means the useful behaviour already exists in the current architecture.
- **Build** means a new product-connected surface is accepted for the current roadmap.
- **Rebuild** means the product need remains valid but the legacy implementation must not be copied.
- **Defer** means the feature belongs in a later release after dependencies or product rules are complete.
- **Replace** means a better Cleo-specific product track supersedes the legacy surface.
- **Reject** means the feature is outside Cleo, unsafe, obsolete, internal-only, or does not justify permanent product surface.

## Command audit

| Legacy or proposed command | Decision | Current position | Tracking |
| --- | --- | --- | --- |
| `/ping` | Rebuilt | v3 reports gateway dispatch, REST reply, total interaction, and heartbeat latency | JCN-26, JCN-91 |
| `/help` | Rebuilt | v3 opens or resumes private Cleo support or guild modmail instead of listing static commands | JCN-113 |
| `/ban` | Rebuilt | v3 validates permissions, bot hierarchy, targets, reasons, replies, and Convex records | JCN-41, JCN-83, JCN-89 |
| `/kick` | Rebuilt | v3 validates permissions, bot hierarchy, targets, reasons, replies, and Convex records | JCN-41, JCN-84, JCN-89 |
| `/cleo status` | Build | First accepted v3.1 command surface: real guild configuration state and a direct SaaS management route for server managers | JCN-198 |
| `/dadjoke` | Reject | Generic entertainment filler with no meaningful connection to Cleo's community operations product | JCN-198 |
| `/datetime` | Reject | Discord already renders localized timestamps and the command does not justify permanent command-surface space | JCN-198 |
| generic `/profile` | Replace | Generic account cards were removed in favour of Cleo Profiles, Pets, battles, cards, and widgets | JCN-94, JCN-108, JCN-110, JCN-111 |
| `/ai` or `/gpt` | Rebuild | Conversational assistant remains part of Cleo's direction, but legacy free quotas, ad hoc Redis history, and provider routing are not acceptable v3 foundations | JCN-199, JCN-203 |
| `/premium` | Rebuild | Access must resolve through one Convex entitlement model with Stripe and supported Discord purchases | JCN-53, JCN-57, JCN-200 |
| `/stats` | Reject | CoD Stats is a separate product and repository | JCN-15 |
| `/test` | Reject | Internal welcome simulation does not belong in the public command surface; use the maintained preview script and tests | Existing `welcome:preview` tooling |
| Placeholder AI debug and balance subcommands | Reject until designed | The legacy handlers were unfinished and should not be advertised as features | JCN-199 if later justified |

## Event and service audit

| Legacy area | Decision | Current position | Tracking |
| --- | --- | --- | --- |
| Command and event classes | Rebuilt | Typed abstractions and unified recursive registries are complete | JCN-23, JCN-96, JCN-100 |
| Command deployment | Rebuilt | Global replacement is non-destructive and production registration is SHA-aware | JCN-25, JCN-101, JCN-97 |
| `ClientReady` | Rebuilt | Bounded, shard-aware READY reconciliation and rotating presence are implemented | JCN-21, JCN-102, JCN-104 |
| `GuildMemberAdd` welcome | Rebuilt | Config-backed delivery and isolated card rendering are implemented | JCN-39 |
| `InteractionCreate` | Rebuilt | Shared routing, response handling, runtime boundaries, and incident reporting are implemented | JCN-24, JCN-92 |
| `MessageCreate` AI DMs | Rebuild | Do not copy legacy Upstash history, free daily limits, or provider-specific logic | JCN-199, JCN-203 |
| `EntitlementCreate` | Rebuild | Use verified, reconciled Discord entitlement lifecycle and the unified access resolver | JCN-200 |
| Broad `GuildAuditLogEntryCreate` embeds | Selective rebuild | v3 ships a safer focused event baseline; add only high-value event types with bounded schemas | JCN-40, JCN-201 |
| Central Discord error channel | Replaced | Structured local logs and selected Convex runtime incidents provide a safer operational path | JCN-42, JCN-79 |
| Prisma database helpers | Reject | Convex is the backend source of truth | JCN-15, JCN-16 |
| Upstash quota and chat state | Reject as default architecture | Reconsider only as a justified cache, never as a duplicate source of truth | JCN-199, JCN-203 |
| Axios for one small public request | Reject | Node provides native fetch, and no accepted v3.1 feature needs the dependency | JCN-198 |
| PM2 ecosystem file | Reject for Discord production | The supported Discord runtime uses systemd and the trusted deployment workflow | JCN-97, JCN-98 |

## Useful behaviour already improved in v3

The legacy code contained good product instincts but frequently combined unrelated responsibilities in one handler. The v3 implementations improve those areas by:

- separating Discord actions from persistence and user responses;
- validating bot-to-Convex calls through a protected secret boundary;
- using shared schemas rather than copying payload types across apps;
- adding idempotency and duplicate-delivery protection;
- excluding deleted message content from stored logs;
- distinguishing routine user errors from actionable runtime incidents;
- supporting both single-process and sharded runtime modes;
- keeping command deployment and production activation recoverable;
- testing critical services instead of relying on manual command checks.

## Gaps found outside the legacy command list

The current main branch is strong in Discord runtime safety, but broader product work remains incomplete:

- Cleo Profile and Pet storage contracts exist, while user-facing settings, cards, bot commands, battles, and widget adapters remain unfinished.
- Billing and entitlement issues remain open, so AI and premium feature access should not be reintroduced through shortcuts.
- Production still executes TypeScript through `tsx` and checks process liveness rather than a full application readiness contract.
- The Discord Convex client is becoming a high-coupling service and should be split before adding several new feature domains.
- Twitch, Kick, and the real-time relay remain planned migrations rather than production monorepo apps.
- The public repository is proprietary, so it is not currently eligible to describe itself as open source without a licensing decision.

## v3.0.1 and v3.1 boundary

Use **v3.0.1** for focused production hardening and fixes, including compiled runtime packaging, readiness verification, compatibility corrections, and first-production defects.

Use **v3.1.0** for meaningful user-facing features, beginning with `/cleo status` and later adding Cleo Profiles and Pets surfaces or redesigned AI and entitlement functionality only when each reaches complete acceptance criteria.

Do not mix a large feature release into v3.0.1. Doing so would make rollback, release notes, and production diagnosis unnecessarily ambiguous.
