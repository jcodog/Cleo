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
handles at most four broadcasters together, one due group per broadcaster per
tick. Moving selected groups to the end gives shared-channel groups independent
turns without aligning all their live checks against the same queue slot.
Initial loading reads only enabled,
undeleted groups. Incremental loading includes changes and tombstones. Pages
contain at most 100 groups. Each cycle applies at most four pages before retaining
its continuation cursor and fixed snapshot bound. Progress is acknowledged after
each page is applied, so historical tombstones cannot permanently block the feed.
The process retains at most 10,000 active groups; deletions free capacity for a
bounded rescan. Configuration reads older than 60 seconds cannot authorize a send.
Claims and the final begin fence independently recheck current server authority.
Incremental watermarks come from
the Convex query clock and overlap by two minutes to include mutation commits
that race a refresh snapshot.

Timer-specific `streamOnline` and `streamOffline` consumers use the existing
EventSub subscription identities and reference counting. They work without a
Discord guild. Offline broadcasters have no active scheduler entries or chat
activity records. Configuration remains editable. Startup reconciliation batches
up to 100 broadcaster IDs per Get Streams request. A five-minute control-plane
reconciliation repairs missed events and failed lifecycle subscriptions. Up to ten
independent session updates run concurrently. Scheduling yields after 50 ms while
reconciliation continues. Failed broadcasters retry after 30 seconds without
blocking successful peers. Provider observations are never relabelled as fresh;
expired observations require another Get Streams request.

`twitchTimerSessions` retains the provider stream ID, validated start time, live
state, observation time, and the last completed session. A genuinely new stream
atomically resets every group's cursor to zero and clears the previous stream's
interval cooldown. Same-stream reconnects and restarts preserve rotation. All
activations reset ephemeral activity and start a fresh scheduling interval.
Delayed or duplicate events cannot replace a newer authoritative observation.

The signed EventSub chat webhook updates `ChatActivity` after validating its
timestamp, broadcaster condition and bot identity. It acknowledges locally.
No ordinary chat content reaches Convex or logs. The tracker retains only
aggregate counts, validated event timestamps and 64-bit SHA-256 message-ID hashes.
Each live broadcaster has at most six minute buckets of 128 hashes, across at
most 10,000 watched broadcasters. Buckets expire by timestamp regardless of
insertion order and retain accepted IDs for the full five-minute activity window.
When a bucket fills, its deterministic hash mask tightens. Removed hashes remain
excluded by that mask until expiry, so their redeliveries cannot count again.
All active masks apply to new arrivals. This permits continued sampled counting
without a fixed cumulative-count ceiling. Hash collisions and sampling only
undercount; they never turn known duplicates into additional activity. Thresholds
therefore require at least the configured number of real messages, and can require
more under heavy load. A burst's stricter sampling expires within six minutes.
Offline transitions release the activity record. Pre-session and five-minute-old
chat events cannot satisfy the activity gate. Signed timestamps up to 60 seconds
ahead are accepted and clamped to local receipt time; greater future skew is rejected.

Each group has its own activity baseline. A confirmed send resets that baseline
and advances the durable cursor. Recent activity must be less than five minutes
old. The minimum count is accumulated since that group's previous confirmed
send. Cleo's own messages and duplicate message IDs do not count.

Before a send, a cheap Convex preflight rejects disabled, stale, offline, or
ineligible configurations. Current Clerk and Twitch OAuth verification precedes
an atomic prepared claim. Get Streams confirms the same stream ID before queue
admission. OAuth, claims and provider checks remain outside the shared queue.
At dequeue, the local gate rejects stopped sessions, stale configuration, expired
leases, insufficient activity and live checks older than two seconds. Only then
does a final database mutation recheck current ownership, entitlement, stream and
chat authorization and mark the durable attempt. This last fence has a strict
500 ms queue budget. Timeout suppresses the POST and sends a matching definite
settlement; deleting that execution also fences a late begin mutation. The gate
rechecks local validity and live-evidence freshness after the fence. Twitch can change state between
that GET and the POST; the integration cannot make those requests atomic.

Prepared claims expire after 60 seconds and have non-reused execution identities.
Provider checks and queue waiting leave the execution prepared and recoverable
after expiry on restart. Once the final begin mutation succeeds, a crash or ambiguous POST quarantines the
execution for the current stream. A definite non-send releases it. A confirmed
POST advances local rotation immediately and retries only its idempotent success
settlement if persistence fails. A lost settlement acknowledgement cannot undo
success. Completion updates use an immutable send context and must still own the
same entry, revision, execution and stream before changing local rotation or
activity. Older streams cannot advance a newer stream's cursor. Backend refresh
repairs cursor divergence even when the confirmed-send timestamp does not increase.
Metadata edits preserve rotation, including in-flight confirmations;
changing the ordered messages resets that edited rotation to zero. This does
not promise exactly-once delivery from Twitch, which provides no send idempotency
key. A crash after begin commits but before the POST remains indistinguishable
from a crashed POST, including loss of the begin acknowledgement. This small
boundary is conservatively quarantined for the stream, never blindly replayed.
Known pre-POST cancellation clears the execution, restores the prior attempt
timestamp and gets a fresh opportunity after one 15-second tick. This is a bounded
retry with fresh live verification, not a backlog of missed messages. Offline
settlement persists `waitingForStream`; other definite outcomes retain their
specific provider, authorization, rate-limit or failure diagnostic. A definitive
HTTP rejection after begin respects the persisted attempt's full interval, or a
longer provider rate limit. Known cooldowns reject before external authorization.
Deleting a group removes its execution as well as its public messages, so the
tombstone retains no serialized rotation text and delayed operations cannot restore it.

Runtime projections reuse linked-account, sibling-group and entitlement reads
within each query invocation. Deleted and disabled rows need no owner expansion.
No process-global authorization cache is used.

The editor saves incomplete drafts to browser session storage, scoped by signed-in
user, linked broadcaster and group. Returning through routes, history or refresh
offers explicit Restore draft and Discard draft actions. Saved revisions accompany
drafts so restoration cannot silently overwrite a newer server revision. Confirmed
save, deletion and explicit discard remove the corresponding draft. Message text
never enters navigation URLs or analytics. Browser-unload protection remains enabled.
Draft storage validates its own permissive schema and 32,000-unit serialized limit
before reporting success, including incomplete and Unicode message text. If storage
fails, the editor warns immediately and group switching explicitly warns of loss.

Restarts reset ephemeral activity and wait a full interval before new work.
Missed intervals do not produce a backlog. Alerts and timers share one bounded,
fair send queue through `sendChatMessage`. Attempts are spaced at least 1.7
seconds globally and two seconds per channel. The queue holds at most 64 pending
messages, four per broadcaster. Best-effort timer work expires after five seconds.
Durable announcements get 60 seconds after the shared startup cooldown, and
pre-send receipts receive another bounded recovery opportunity during runtime
maintenance. It honors 429/reset headers without replaying ambiguous POSTs.
Runtime startup imposes a 30-second send cooldown to protect the previous
process's rate budget. Shutdown stops admissions immediately, drains accepted
work for up to 15 seconds, and then aborts resources within systemd's 20-second
stop limit.

Timer text rejects leading `/` or `.` after whitespace. It is never rewritten.
The [Helix chat documentation](https://dev.twitch.tv/docs/chat/send-receive-messages/)
requires `is_sent` and a message ID to confirm delivery; it does not guarantee
literal round-tripping of command-like input. The stricter v1 timer policy avoids
relying on that behavior. No live command probe is part of local verification.

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
Locked groups belonging to the current broadcaster remain editable with their
saved enabled preference. A disabled locked group cannot be activated until its
entitlement is restored. Edits do not alter group ordering or bypass claim-time
eligibility. Deleting an earlier group can free capacity. Reconnecting a different broadcaster
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
intervals, rejected create/edit/delete operations, revision conflicts, entitlement
expiry and restoration, heartbeat expiry, stream transitions, first-save feedback,
locked groups, all nine alerts, reduced motion, light/dark layouts, draft recovery
through Twitch and Discord navigation, history, refresh, account isolation and
revision conflicts. It writes
screenshots under `apps/dashboard/test-results/twitch`.
It does not substitute for a separately authorized live Twitch send smoke test.

The Twitch bot and new backend timer files are included in the existing 100%
coverage gates. Root validation and the unchanged Linux package/deployment
contracts remain required before promotion.
