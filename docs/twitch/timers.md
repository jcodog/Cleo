# Twitch workspace and cloud timers

The authenticated Twitch workspace has three pages: `/twitch` for identity and
connection recovery, `/twitch/alerts` for the nine existing announcements, and
`/twitch/timers` for rotating message groups. Discord and Twitch share the
platform selector. Its Discord destination comes from verified manageable
servers. Collapsing the sidebar shows only the other platform.

## Execution and persistence

`twitchTimerGroups` owns an ordered message array, configuration revision,
broadcaster association, cursor, confirmed-send timestamp, attempt timestamp
and fenced execution lease. Dashboard writes derive their owner from Clerk
authentication. A guessed group ID does not grant access. Edits use optimistic
revision checks. Deleted groups retain a content-free tombstone for workers.

`TimerScheduler` runs inside the existing Oracle `cleo-twitch` process. One
deadline loop refreshes indexed configuration changes every 15 seconds and
handles at most four due groups together. Initial loading reads only enabled,
undeleted groups. Incremental loading includes changes and tombstones. Pages
contain at most 100 groups, with a process limit of 10,000 groups. Configuration
older than 60 seconds cannot authorize a send.

The signed EventSub chat webhook updates `ChatActivity` after validating its
timestamp, broadcaster condition and bot identity. It acknowledges locally.
No ordinary chat content reaches Convex or logs. The tracker retains only
aggregate counts, activity timestamps and up to 20,000 deduplication IDs across
10,000 configured broadcasters. IDs expire after 11 minutes. At the ID limit,
activity is dropped rather than risking duplicate counts. Removing all of a
broadcaster's groups releases its activity record.

Each group has its own activity baseline. A confirmed send resets that baseline
and advances the durable cursor. Recent activity must be less than five minutes
old. The minimum count is accumulated since that group's previous confirmed
send. Cleo's own messages and duplicate message IDs do not count.

Before a send, Get Streams confirms the broadcaster is live. Due broadcasters
share a bounded batch request, with another check after queue admission. The
worker obtains an atomic Convex claim only after current Clerk and Twitch OAuth
verification. The mutation rechecks account evidence, enabled revision, current
capacity, chat subscription identity and revocation, runtime readiness, elapsed
interval and conflicting leases. Provider failures fail closed.

Claims last 60 seconds. The attempt cooldown is stored before the POST. Only a
confirmed send advances the cursor and successful-send timestamp. Failed or
ambiguous POSTs settle uncertain and do not retry immediately. A crashed worker
cannot replay a claimed execution on restart. This does not promise exactly-once
delivery from Twitch, which provides no send idempotency key.

Restarts reset ephemeral activity and wait a full interval before new work.
Missed intervals do not produce a backlog. Alerts and timers share one bounded,
fair send queue through `sendChatMessage`. Attempts are spaced at least 1.7
seconds globally and two seconds per channel. The queue holds at most 64 pending
messages, four per broadcaster, and discards work after five seconds. It honors
429/reset headers without replaying ambiguous POSTs. Runtime startup imposes a
30-second send cooldown to protect the previous process's rate budget.

## Broadcaster capacity

Free accounts have one group. Three-group access currently comes only from an
explicitly labeled test grant. Discord guild billing does not confer Twitch
capacity. There is no purchase flow or production broadcaster-subscription
resolver yet. Integrating genuine user subscriptions into the server-side
`capacity` resolver remains required before selling Twitch premium access.

Trusted Convex operators can invoke the internal `twitchTimers:provisionTestGrant`
mutation with `userId`, the currently linked `broadcasterId`, `expiresAt` in
milliseconds and a nonempty `reason`. Grants last at most 30 days. Reissuing
replaces the prior grant. `twitchTimers:revokeTestGrant` revokes by `userId`.
These functions are internal and have no dashboard or worker-secret issuance
endpoint. Use a dev deployment for testing.

Capacity is checked during every creation, activation and send claim. On expiry
or revocation, the first group belonging to the current broadcaster retains
eligibility; later groups lock. Configurations and saved enablement survive.
Deleting an earlier group can free capacity. Reconnecting a different broadcaster
does not transfer the old broadcaster's groups or grants.

## Development and rollout

The local bot reads `apps/twitch-bot/.env.local`. Set its `CONVEX_URL` to the dev
`.convex.cloud` deployment. Its `TWITCH_WORKER_SECRET`,
`TWITCH_EVENTSUB_CALLBACK_URL` and `TWITCH_EVENTSUB_SECRET` must match dev Convex.
The EventSub callback is a public HTTPS tunnel ending in `/eventsub`, forwarding
to the bot's loopback listener on port 8087. It is not the dashboard callback.
Dashboard consent uses `TWITCH_CHAT_OAUTH_REDIRECT_URL`, normally
`https://localhost:3000/twitch/chat-consent` in development, registered exactly
with Twitch. Substitute the actual dashboard port. Keep Clerk's own redirect
registered too.

After maintainer review and merge, use the existing protected promotion pipeline
to deploy the backend and bundled Linux runtime together. The new modules are
bundled into the existing `dist/index.js`; no artifact entrypoint, systemd,
Nginx, public management endpoint or production secret change is required.
Existing chat-presence activation and consent requirements remain enforced.
Validate one free broadcaster with fresh activity and a live stream before
issuing any scoped test grant. This implementation work does not activate or
deploy production services.

## Verification

`bun run --filter @workspace/dashboard test:twitch:browser` exercises actual
components through an isolated test transport. It covers desktop and mobile
platform switching, stale guild rejection, keyboard message ordering, invalid
intervals, saves, locked groups, all nine alerts, reduced motion and light/dark
layouts. It writes screenshots under `apps/dashboard/test-results/twitch`.
It does not substitute for a separately authorized live Twitch send smoke test.

The Twitch bot and new backend timer files are included in the existing 100%
coverage gates. Root validation and the unchanged Linux package/deployment
contracts remain required before promotion.
