# Owner Twitch live notifications

JCN-224 configures one fixed Twitch source per Discord guild. The source is resolved through the guild owner's Discord ID, the trusted Discord linked-account index, the active Cleo user, and that user's Twitch linked account. Current Clerk accounts and Twitch token validation must agree with those records. Provider tokens stay in backend actions.

The dedicated Cleo Connect/Reconnect flow still requests `channel:bot` and synchronizes Clerk evidence to Convex. Manage account opens Clerk's account-management UI. It does not replace scope acquisition or synchronization. `stream.online` v1 itself requires no additional broadcaster scope.

Configuration is stored in `guildLiveNotificationConfigs`. It contains enabled state, a Discord text/announcement destination, and none/everyone/role mention settings. Twitch broadcaster IDs are never accepted by the dashboard save action. The save action verifies fresh Manage Guild authority, bot presence, owner consistency, and channel/role membership using Discord REST. Changes enter the guild audit trail.

The existing Twitch runtime requests desired owner-linked broadcasters from the authenticated Convex `/twitch-live-sources` endpoint. Every runtime check reconciles only `stream.online` v1 webhook subscriptions at the configured callback. Bootstrap chat subscriptions remain separate. Disabled/unlinked owners leave the desired set. Provider outages preserve subscriptions and expose unavailable health rather than treating the outage as unlink. Reconciliation never sends a notification merely because it starts or reconnects.

The verified EventSub ingress persists one event per broadcaster and stream ID before acknowledging Twitch. A scheduled action resolves eligible guilds and creates one durable delivery per guild, broadcaster, and stream. A single Helix stream lookup enriches a received event with optional title/category. It is not stream polling. Event processing retries provider outages at most three times. Dedupe records are retained across deployments and runtime restarts.

Each Discord runtime polls a bounded batch of its cached guilds for delivery jobs every 15 seconds. Convex atomically claims a job for 90 seconds. Before sending, the bot verifies the current owner, channel type, send permission, and mention permission. Convex rechecks live owner authority and config before persisting the send reservation. The bot uses its existing authenticated Discord client, a Components V2 container, safe text displays, and a Watch stream link built from verified login data. Twitch text cannot introduce mentions. `allowedMentions` permits only the configured mention.

An expired claim that has not reserved a send can retry at most three times. A send already reserved is never automatically replayed. If the bot dies after reservation, its outcome becomes `uncertain`, with a structured failure record. This avoids duplicate notifications across the send/ack crash window. Discord's enforced nonce provides an additional recent-request guard, not the persistent dedupe guarantee. Failed and uncertain outcomes require operator inspection; do not manually retry an uncertain send without checking Discord first.

## Production acceptance

No production secrets or services are changed by this implementation. Before enabling the feature, an operator must:

1. Set a dedicated high-entropy `TWITCH_RUNTIME_CONVEX_SECRET` in the Twitch VPS environment and the production Convex environment. The values must match and differ from the EventSub secret.
2. Release the backend, Twitch runtime, Discord runtime, and dashboard through their normal reviewed deployment workflows.
3. Confirm a linked owner shows ready subscription health. Verify a non-owner manager sees that owner's broadcaster and cannot substitute their own account.
4. Authorize a controlled real owner stream transition, confirm one Components V2 Discord message, and inspect its stream/guild delivery record. Test none/everyone/custom-role mentions only in an explicitly approved destination.
5. Check unavailable, owner unlink, ownership transfer, deleted destination/role, and bot-left behavior. Check redelivery/restarts do not resend the recorded session.

The first reconciliation is bounded to 500 guild configurations. Exceeding that limit fails visibly and requires pagination work before growth past that capacity. No JCN-225 or JCN-226 events, chat commands, or additional channel selection are included.

## Local verification

Validated on 2026-10-01:

- `bun run typecheck` and `bun run lint`: passed across all eight workspaces with checks.
- `bun run test --env-mode=loose`: passed, 642 tests. Dashboard 68, backend 174, Discord bot 292, Twitch bot 51, shared 28, env 20, logger 7, UI 2.
- `bun run test:coverage --env-mode=loose`: passed. All existing enforced scopes retain 100% statements, branches, functions, and lines. Twitch coverage includes the entire new subscription implementation; dashboard coverage includes the new overview state helper.
- `bun run build --env-mode=loose`: passed for dashboard, Discord bot, and Twitch bot. `NODE_USE_SYSTEM_CA=1` uses the host certificate store.
- `bun run --filter @workspace/backend codegen --typecheck disable`: passed. This is Convex's read-only codegen operation, not a deployment.
- `bash ops/twitch/test.sh` and every `ops/discord/bin/*.test.sh`: passed in disposable WSL fixtures, using checksum-verified Node 24.15.0 and Linux line endings. Service and command-deployment calls were mocked; no production services or messages were involved.
- `git diff --check`: passed.

The root test/build commands use environment passthrough because strict Turborepo environment filtering removes the sandbox's injected Git ownership configuration, which existing artifact tests need. No coverage thresholds or production security settings were changed.
