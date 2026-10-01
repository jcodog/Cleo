# JCN-226 implementation report

Branch: `feat/jcn-226-twitch-event-architecture`, based on latest fetched `main` at `4c5918b4c6917f4a3ab9f4ea4e161fae8c213efd`.

PR: [jcodog/Cleo #234](https://github.com/jcodog/Cleo/pull/234). Implementation commit: `a398dd1c5f3e0a7e598f483cdc16417f437182b9`, signed and verified locally and by GitHub. The user's signed `1614c2fe578c803c1bc965e6e7c945d5cce23a36` dependency commit also includes the inspected-host ingress correction. The report commit is recorded in PR history. No production deployment, service restart or configuration mutation was performed.

## 1. Architecture

```mermaid
flowchart LR
  Dashboard -->|trusted save or toggle action| Convex
  Convex -->|App Access Token: create/delete| EventSub[Twitch EventSub]
  EventSub -->|HTTPS POST /eventsub| Ingress[VPS Nginx TLS ingress]
  Ingress -->|127.0.0.1:8087| Client[TwitchClient webhook listener]
  Client --> Router[Typed event router]
  Router -->|receipt and current template: one action| Convex
  Router -->|focused announcement handler| Chat[Twitch chat API]
  Router -->|stream.online: one durable action| Delivery[Convex Discord delivery]
  Delivery -->|Components V2 REST message| Discord
```

The old Cleo-Kick webhook receiver and old dashboard Kick subscribe/unsubscribe router informed the split. CoD-Stats-Tracker informed service organization only. Its subscription sync timer was excluded. No stats features were imported.

## 2. Final Twitch source tree

The registry and schemas live in `packages/shared/src/twitchEventSub.ts` so the backend, dashboard and runtime use one definition. The complete source tree includes colocated tests.

```text
apps/twitch-bot/src/
  auth/
    authorization.test.ts
    authorization.ts
    grantStore.platform.test.ts
    grantStore.recovery.test.ts
    grantStore.test.ts
    grantStore.ts
    privateFile.ts
  classes/
    TwitchClient.test.ts
    TwitchClient.ts
  deployment/
    artifactTypes.test.ts
    validateArtifact.d.mts
    validateArtifact.mjs
    validateArtifact.test.ts
  handlers/eventsub/
    charityDonation.ts
    chatMessage.ts
    cheer.ts
    follow.ts
    hypeTrainBegin.ts
    hypeTrainEnd.ts
    raid.ts
    resubscribe.ts
    streamOnline.ts
    subscribe.ts
    subscriptionGift.ts
  runtime/
    readiness.test.ts
    readiness.ts
  scripts/
    authorizeBot.ts
    checkReadiness.ts
    scripts.test.ts
    sendSmokeMessage.ts
  services/
    ConvexService.test.ts
    ConvexService.ts
    TwitchApiService.test.ts
    TwitchApiService.ts
    TwitchAuthService.test.ts
    TwitchAuthService.ts
    announcements/
      AnnouncementService.ts
    eventsub/
      EventSubRouter.test.ts
      EventSubRouter.ts
      TwitchWebhookServer.test.ts
      TwitchWebhookServer.ts
  index.ts
```

## 3. TwitchClient responsibilities

Owns the dedicated bot grant, token lifecycle, API service, listener, typed router, local chat sending, readiness and orderly shutdown. Startup/shutdown remain explicit methods, with a tiny entrypoint and no side-effect imports. The 30-second local maintenance timer validates/refreshes bot authorization and readiness only. It does not query configuration or create/delete subscriptions.

## 4. Callback and actual host inspection

Callback contract: `https://<operator-chosen-twitch-host>/eventsub`, HTTPS port 443, exact path. Internal listener: `127.0.0.1:8087` by default. Public POST `/eventsub` only; health stays local and other public paths return 404.

Read-only PuTTY `oracle` inspection found the existing Twitch service active, host contract 2, no Nginx/Caddy/Apache/other ingress service installed and port 8087 unused. The implementation therefore includes a complete Nginx TLS virtual-host example, rather than assuming an existing HTTPS server. The actual DNS hostname and certificate are not configured by this task. No production endpoint is claimed to exist yet.

## 5. Enabling

The authenticated Convex action verifies current Clerk-linked broadcaster evidence, Twitch application identity and required scopes. Invalid drafts or missing permission are rejected before enabled configuration is written. One transaction saves the visible configuration/template and enabled state, acquires consumer membership and creates/updates the logical subscription row. The action immediately acquires an App Access Token, finds/adopts an exact matching external subscription or creates it, and stores its ID/status. The webhook challenge updates reactive status to Ready. No separate Save, restart or manual refresh is needed.

## 6. Disabling

One transaction saves disabled state and releases this consumer, preserving the custom template. The action immediately deletes the external subscription only if no consumers remain. Successful deletion clears its external ID; failed deletion retains the ID and error state for an authorized Retry subscription operation. Disabling one of several consumers keeps the external subscription.

## 7. Shared ownership and concurrent changes

Identity is broadcaster + Twitch type + version + sorted condition + callback. `twitchEventConsumers` stores membership; guild consumers use `guild:<id>` and announcement consumers use `announcement:<user>:<event>`. Multiple guilds share one `stream.online` subscription. Transactions, revisions and external-operation leases serialize competing changes. Recovery is one-shot for an interrupted operation, scoped to that subscription. There is no recurring desired-state reconciliation.

## 8. Polling removal

The VPS performs **zero desired-subscription polling**. Old runtime source polling, five-minute reconciliation, Convex webhook routes and desired-source tables were removed. The Discord Gateway live-notification polling worker and pending/claim client path were removed. `TWITCH_RUNTIME_CONVEX_SECRET` is obsolete. `TWITCH_WORKER_SECRET` has one purpose: authenticate verified VPS event/persistence calls.

## 9. Runtime Convex calls

| Event                                                                            | Calls and purpose                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Follow, subscribe, resubscribe, gift, cheer, raid, Hype Train begin/end, charity | One `reserveEvent` action reserves the message ID and returns the current template. Construct values, render and send locally. No enabled-state query. |
| Chat message                                                                     | One receipt reservation; no arbitrary viewer-message echo.                                                                                             |
| Stream online                                                                    | One `receiveOnline` action reserves message/session evidence and durably schedules backend fan-out. No separate receipt call or VPS guild fan-out.     |
| Challenge                                                                        | One asynchronous subscription-status call; response does not wait on it.                                                                               |
| Revocation                                                                       | One focused subscription-status action. VPS never resubscribes.                                                                                        |

## 10. Discord card and delivery

Convex resolves authorized enabled guild destinations, enriches Get Streams metadata once and Get Users profile data once for the event, then schedules durable REST deliveries using the production Discord bot token. The card uses a Twitch-purple Container, Section with optional avatar Thumbnail, title/category/name/login, 640×360 Media Gallery stream preview, relative started time, optional viewer count, Separator and Watch on Twitch link button, with `IsComponentsV2`. Missing optional metadata degrades cleanly. No legacy embeds.

Strict allowed mentions, text sanitization, destination permissions and fresh owner/config authority remain enforced. Retries are limited to pre-reservation work. After send reservation there is one POST; ambiguous outcomes become uncertain and are never blindly resent. Persistent message/session and delivery evidence prevent duplicates.

## 11. Dashboard behavior

Guild live settings keep ordinary destination/mention/role edits in a local draft. Save is disabled when clean or invalid, enabled only for valid changes, and becomes clean after success. Ordinary configuration saves do not mutate `stream.online`. Enable immediately saves a valid visible draft with enabled=true and ensures the subscription. Invalid enable writes nothing. Disable immediately releases its consumer. Reactive status shows Disabled, Connecting, Ready, Missing permission, Subscription failed or Provider unavailable. The normal Refresh connection button is gone; Retry subscription appears only for failure.

`/twitch` has nine independent announcement toggles grouped as Community, Subscriptions and Support. Each row has default/custom text, a 400-character counter, supported clickable tags, fake-data live preview, Reset to default and dirty-aware Save. Template-only saves never mutate EventSub. Enable saves a dirty template and enabled=true together. Disable preserves custom text. A missing override uses the central default; reset or identical default text clears the override.

## 12. Exact EventSubs, tags and defaults

| Announcement         | EventSub                             | Supported tags                                               | Cleo default                                                              |
| -------------------- | ------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| New follow           | `channel.follow` v2                  | `{user}`, `{channel}`                                        | Thanks for the follow, {user}! 💜                                         |
| New subscriber       | `channel.subscribe` v1               | `{user}`, `{channel}`, `{tier}`                              | Thanks for subscribing, {user}! 💜                                        |
| Resubscription       | `channel.subscription.message` v1    | `{user}`, `{channel}`, `{tier}`, `{months}`                  | {user} just resubscribed for {months} months! 💜                          |
| Gifted subscriptions | `channel.subscription.gift` v1       | `{user}`, `{channel}`, `{tier}`, `{count}`, `{total}`        | {user} gifted {count} subs! That's {total} gifted in total! 💜            |
| Bits cheered         | `channel.cheer` v1                   | `{user}`, `{channel}`, `{bits}`                              | Thanks {user} for cheering {bits} Bits! 💜                                |
| Incoming raid        | `channel.raid` v1                    | `{user}`, `{channel}`, `{viewers}`                           | Welcome raiders! {user} raided with {viewers} viewers! 💜                 |
| Hype Train started   | `channel.hype_train.begin` v2        | `{channel}`, `{level}`, `{total}`                            | 🚂 Hype Train started! Let's go!                                          |
| Hype Train ended     | `channel.hype_train.end` v2          | `{channel}`, `{level}`, `{total}`                            | 🚂 Hype Train ended at level {level} with {total} contribution points! 💜 |
| Charity donation     | `channel.charity_campaign.donate` v1 | `{user}`, `{channel}`, `{amount}`, `{currency}`, `{charity}` | {user} donated {amount} to {charity}! 💜                                  |

Also registered: `stream.online` v1 and `channel.chat.message` v1, without announcement templates. Raid conditions use `to_broadcaster_user_id`; follow conditions use the authorized broadcaster as moderator. No Host event, `channel.bits.use` or Hype Train progress spam.

Anonymous gifts/Bits resolve `{user}` to `An anonymous viewer`. Missing gift cumulative total omits the built-in default's total sentence; a custom `{total}` receives `not available`, never an invented number. Gifted recipients in `channel.subscribe` are suppressed. `{months}` is cumulative months, `{tier}` is Tier 1/2/3 and Hype Train `{total}` is contribution points. Charity `{amount}` is already formatted using integer value and decimal_places; `{currency}` is its ISO code.

Unknown or wrong-event tags, malformed syntax, blank output and source text over 400 Unicode code points are rejected. Controls/newlines and unsafe unprintable characters normalize to plain one-line text. Rendered custom output over Twitch's 500-character limit falls back to the default; an oversized default fails closed. Outbound text never enters an internal command or code execution path.

## 13. Scope resolver

`resolveBroadcasterScopes` starts with `channel:bot` and deduplicates desired feature scopes: follow `moderator:read:followers`; sub/resub/gift `channel:read:subscriptions`; cheer `bits:read`; Hype Train `channel:read:hype_train`; charity `channel:read:charity`. Raid/stream online need no extra scope. Missing permission requires Clerk `reauthorize()` with base + desired + existing approved scopes, followed by trusted account synchronization. The separate bot grant remains `user:read:chat`, `user:write:chat`, `user:bot`.

## 14. Webhook verification and dedupe

Raw-body HMAC-SHA256 uses message ID, original timestamp and the shared webhook secret, compared in constant time. Request bound 64 KiB; accepted age ten minutes and future allowance one minute. Registry schemas validate notification payload and broadcaster conditions. Challenges return plaintext immediately. Notifications persist one bounded receipt before acknowledgement and chat side effects. Receipt IDs persist 24 hours with bounded cleanup, surviving VPS restarts. Stream session dedupe additionally prevents duplicate Discord cards. Bounded pending tasks and draining shutdown prevent unbounded in-process work.

Chat reservation provides at-most-once side effects: a crash or provider failure after reservation can lose an announcement. It cannot safely retry an ambiguous chat send. Discord preserves uncertain delivery states for the same reason. Logs record event type, dispatch, send and revocation activity without secrets or raw viewer text.

## 15. Production env and host contracts

Backend server credentials: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BOT_USER_ID`, `TWITCH_EVENTSUB_CALLBACK_URL`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_WORKER_SECRET`. Runtime additionally needs `CONVEX_URL`, private grant/readiness paths and optional `TWITCH_WEBHOOK_PORT=8087`/HTTP timeout. Credentials remain server-side. The bootstrap broadcaster ID is optional and used only for explicit smoke sends.

Systemd, bootstrap, runner checker, release controller and env examples now require host contract 3. Bootstrap installs the reviewed Nginx example without activating it. The existing Twitch bot process hosts the listener. Private grant permissions, token rotation, immutable releases, readiness and rollback remain enforced. The inspected host still runs contract 2 because no rollout was authorized.

## 16. Workflow warnings

`CLEO_TWITCH_DEPLOY_ENABLED` exists in the `twitch-production` environment. Reading it before environment availability was corrected by reading it in the protected job's step and passing a boolean output to later gates. Missing/non-true fails closed; automatic trusted-main deployment remains gated.

`CONVEX_DEPLOY_KEY` exists as a protected environment secret and its step-level context is valid. VS Code cannot enumerate private environment secrets, so that name diagnostic is a false positive. The credential was not moved or exposed. Actionlint passed; optional ShellCheck/Pyflakes executables were unavailable and disabled for that invocation.

## 17. Validation and coverage

All requested root checks passed: `bun ci`, `bun run typecheck`, `bun run lint`, `bun run test:coverage`, `bun run build --env-mode=loose` and `git diff --check`. An isolated archive of the signed implementation commit also passed its exact frozen `bun ci`. Concurrent dependency upgrades were excluded from that implementation commit, then independently committed and pushed by the user in `1614c2f`; those changes were preserved. The final root checks ran with the updated installed dependencies. GitHub checks for subsequent commits are recorded on the PR.

Final coverage run: **651 passing tests**: dashboard 71, backend 186, Twitch 45, Discord 287, env 20, shared 33, logger 7, UI 2. All enforced 100% statement/branch/function/line thresholds passed. Twitch covers all production source; backend/dashboard retain their existing selected-module coverage policies, so this is not a claim that every new backend/UI line is covered.

Tests cover subscription create/delete/ID state, shared consumer retention/deletion, scope/provider failures, configuration-only saves, dirty/invalid immediate toggles, preserved/reset/custom templates and preview/tags, every announcement payload and default, optional/anonymous values, source/rendered limits and controls, raw HMAC/challenge/replay bounds, durable duplicate receipts, revocation, stream-to-Convex fan-out, no desired polling and Discord send reservation/uncertainty. Linux Twitch ops, six Discord ops scripts, release artifact/private-file/compiled-entrypoint checks and workflow actionlint passed. Twitch ops were rerun successfully after the inspected-host ingress correction.

Convex API/schema codegen and type validation passed. After automatic approval review disallowed a further remote codegen invocation, touched generated types were refreshed using a temporary local validator-export helper and typechecked; the helper was removed. No production deployment occurred. The pasted stale test references were migrated and the final backend checks passed. Nginx live `nginx -t`, TLS challenge and real-provider side effects remain rollout checks because ingress is not installed.

Implementation commit's [GitHub regression CI](https://github.com/jcodog/Cleo/actions/runs/36926790119) passed. Automatic Vercel preview also passed. Final-head validation state is visible in the PR checks.

## 18. Signed commits and PR

Implementation SHA: `a398dd1c5f3e0a7e598f483cdc16417f437182b9`. User dependency/ingress SHA: `1614c2fe578c803c1bc965e6e7c945d5cce23a36`. Local `git verify-commit` and GitHub verification passed for both. Signing key fingerprint: `A089A96EFF673B6FEE751491A66007EDF3657AB3`. The report commit is signed and verified before push; its SHA is recorded in the final handoff and PR history.

PR: [feat: Twitch webhook event architecture and announcements #234](https://github.com/jcodog/Cleo/pull/234), attached to this chat, against `main`. No merge or production workflow dispatch.

## 19. Review state

CodeRabbit skipped review because the diff exceeded its 100-file review limit and review capacity was unavailable. Cubic remained in progress with no actual findings after bounded checks. No reviewer was retriggered. Manual review is required; skipped checks are not treated as an approval.

## 20. Linear state

No Linear integration tools were exposed. JCN-226, JCN-224, JCN-46, JCN-48, JCN-51 and JCN-59 could not be read through Linear, and no issue update is claimed. The GitHub Linear integration linked JCN-226 automatically. Ready-to-post notes follow; they were not submitted.

**JCN-226 note:** Implemented Convex-owned EventSub subscription lifecycle and shared consumer ownership, replacing VPS desired-subscription polling. The always-running Twitch bot receives verified HTTPS webhooks and dispatches typed handlers. Added nine chat announcements with strict custom templates, reactive immediate dashboard toggles, dirty-aware config saving, durable webhook dedupe and revocation state. Moved stream.online delivery into durable Convex-to-Discord REST actions and redesigned the Components V2 card. Root validation passed with 651 tests and all enforced coverage thresholds. Implementation SHA a398dd1c5f3e0a7e598f483cdc16417f437182b9; follow-up ingress/report SHA is in PR history. PR https://github.com/jcodog/Cleo/pull/234. Production has not been deployed; oracle requires host contract 3 and new HTTPS ingress. CodeRabbit unavailable, Cubic did not finish within bounded checks; manual review required.

**JCN-224 note:** The production-discovered source/config polling model delayed subscription changes and required a refresh/reconciliation path. PR #234 replaces it with immediate dashboard-to-Convex subscribe/unsubscribe actions, shared broadcaster subscription ownership and an always-running VPS webhook receiver. Destination/mention saves do not modify stream.online subscriptions. Last-consumer disable deletes the external subscription immediately. The old five-minute desired-source reconciliation and Discord pending/claim polling paths are removed. No production deployment yet.

## 21. Manual production setup

Choose the callback DNS hostname and provision TLS, install/validate the reviewed Nginx vhost, permit TCP 443 in Oracle and the host firewall, keep 8087 internal, install host contract 3 and configure the matching server-side credentials/private bot grant. Set `TWITCH_WORKER_SECRET` and callback secret identically on Convex and VPS. Review before enabling the protected production deploy gate.

During a separately authorized coordinated rollout, remove only obsolete EventSub IDs targeting the old Convex callback before the explicit paginated `liveNotificationActions:migrateConsumers` migration; do not delete unrelated subscriptions. Validate local health, public signed challenge, journal activity, missing-scope reconnect, each event/template, redelivery across restart, two-guild sharing, last-consumer deletion and ambiguous-send behavior. See [bootstrap](bootstrap.md) for exact sequencing and operator commands.

## 22. Remaining checkpoint

Manual PR review and production setup/validation after review and merge remain. Linear notes need posting when an integration is available. This task did not deploy production. The user's concurrent dependency commit was preserved; no production HTTPS or EventSub validation was attempted against the unreleased branch.
