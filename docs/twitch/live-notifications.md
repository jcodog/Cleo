# Owner Twitch live notifications

JCN-224 configures one fixed Twitch source per Discord guild. Authority follows `guild.ownerDiscordId`, the trusted Discord linked-account index, an active Cleo user, and that user's linked Twitch candidates. Current Clerk external-account evidence selects exactly one current Twitch row, and Twitch OAuth validation must agree. Historical rows remain history. Missing, duplicate, disabled, unlinked or contradictory authority cannot borrow a manager's account. Provider tokens stay in backend actions.

Cleo intentionally treats an active linked broadcaster connection as authorization for its dedicated chatbot, including `channel:bot`, as specified by JCN-51. `stream.online` itself requires no broadcaster scope. This slice preserves that product permission lifecycle. Connect/Reconnect acquires permission and synchronizes Clerk evidence. Manage account opens the Clerk profile; it does not guarantee additional scopes or Convex synchronization.

`guildLiveNotificationConfigs` stores enablement, a Discord text/announcement destination and none/everyone/role mentions. Its broadcaster and owner projection fields are written only internally after verified owner resolution. Public saves never accept a broadcaster ID. Fresh Manage Guild authority, bot presence, current owner and real channel/role membership are checked server-side. Changes enter the guild audit trail.

## Reconciliation and event processing

The authenticated `/twitch-live-sources` endpoint returns cursor pages of 25 enabled configs. There is no total 500-config limit. Each page shares owner database reads and verifies unique owners with at most eight concurrent operations. A server-side, five-minute owner-check cache shares verification across pages and guilds; its evidence key changes with stored user/account authority. This cache contains no tokens and is used only for subscription reconciliation. Delivery requires fresh Clerk and Twitch evidence.

Source reconciliation runs in an independent task every five minutes, while the chat/readiness loop remains responsive every 30 seconds. The runtime consumes all pages before modifying subscriptions. A failed page or provider outage preserves subscriptions. Configs are indexed by their server-derived broadcaster so an event loads only matching targets. Event processing shares fresh owner verification and one optional Helix metadata lookup across pages, then dispatches in transactions of at most 25 targets.

Only `stream.online` v1 is reconciled. All documented online stream classifications are accepted. Bootstrap chat remains separate. A callback mismatch fails visibly with an operator-actionable error, matching the conservative chat policy. Operators must inspect and migrate old subscriptions; the runtime neither deletes a different ingress blindly nor hides a 409 as pending success. Removed broadcasters immediately publish unavailable health. Reconcile failures mark previous and newly desired IDs unavailable. Restored subscriptions publish their current state immediately.

Health updates use batches of at most 100 from the runtime. Status changes persist immediately; unchanged rows renew at most once every five minutes. Dashboard readiness expires after 15 minutes without a heartbeat.

## Delivery and retention

Verified EventSub ingress persists one event per broadcaster/stream before acknowledgement. Per-guild broadcaster/stream keys prevent duplicate jobs. Event processing allows three total attempts, including the initial attempt, then records provider failure. Restarts and reconciliation never create notifications by themselves.

Each Discord runtime polls the indexed pending queue every 15 seconds, advancing a cursor through pages of 20 jobs. Empty queues require one indexed query and no per-guild queries or claim mutation. A single transaction cancels obsolete jobs and claims at most four eligible deliveries belonging to that runtime's cached guilds. Four concurrent workers start those claims immediately within their 90-second leases. Unavailable guilds remain pending for their owning runtime.

Before reservation, deterministic destination/owner/permission/role failures store their specific code. Unknown network failures leave the claim to expire and retry, with three total claims allowed. `begin` freshly verifies authority and config, then durably enters `sending`. After that boundary, a send rejection or lost response is `uncertain` with `sendOutcomeUnknown`, never automatically retried. Known message IDs record `sent`; late acknowledgements may settle an uncertain outcome. Terminal outcomes enter the guild audit trail. Operators must inspect Discord before considering manual recovery of an uncertain send.

A pending notification older than 15 minutes remains claimable. Immediately before reservation, one bounded Helix lookup checks its original stream ID. The same live session may be announced after an outage; an ended or replaced session records `streamEnded`. Twitch/provider unavailability leaves the lease retryable. These are event/delivery-triggered checks, not polling loops.

Hourly cleanup uses created-time indexes and deletes at most 100 event and 100 delivery rows per transaction, scheduling bounded continuations when needed. Rows are retained for 31 days. Ingress ignores sessions whose start is already over 30 days old, so removing dedupe rows cannot resurrect old sessions through a fresh webhook timestamp. Guild audits remain separately available under their existing lifecycle.

The existing Discord client sends Components V2: a container, sanitized identity and optional title/category, relative start time, separator and Watch stream link built from verified Twitch login. `allowedMentions` permits none, intentional everyone only, or exactly one role. Twitch text cannot introduce mentions. Enforced nonce is an additional recent-request guard, not the persistent guarantee.

## Local grant-lock recovery

A stopped or forcibly restarted watcher can leave `bot.twitch-grant.json.lock`. It contains the owning PID, not a token. Do not remove it while an operator/runtime owns it. On Windows, check that PID with `Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>'`; also check for other Twitch runtimes before preserving a confirmed stale lock under a backup name. Do not move or edit the grant. Existing `.refreshing` and `.rotated` markers belong to grant recovery, not manual deletion. Avoid multiple watchers against the same grant.

## Production acceptance

1. Set a dedicated high-entropy `TWITCH_RUNTIME_CONVEX_SECRET` with exactly the same value in production Convex and the Twitch VPS. Keep it distinct from EventSub. A blank optional runtime secret means bootstrap chat only.
2. Release all four services through reviewed workflows. Inspect old callback subscriptions when rotating ingress URLs.
3. Confirm owner identity, health and manager restrictions. Allow up to five minutes for source lifecycle reconciliation.
4. Authorize a controlled owner stream transition and verify one Components V2 message and its audit/delivery state. Test mentions only in an approved destination.
5. Verify unlink, replacement, ownership transfer, deleted destinations, bot-left, outages, delayed recovery, redelivery and restarts.

No JCN-225/JCN-226 events, chat commands, arbitrary broadcasters or production deployment are included. Review validation and signed SHAs are recorded in PR #233 and JCN-224.
