# Twitch owner live notifications

The dashboard guild source is always its current owner's trusted Twitch broadcaster. A guild manager cannot substitute their own account. Fresh Manage Guild authority, owner identity, Clerk/Twitch evidence and real Discord destination/role membership protect saves and send reservation.

## Dashboard behavior

Destination, mention mode and custom role are ordinary draft configuration. Save is disabled when clean or invalid; a successful save resets the baseline. Saving these fields while enabled leaves `stream.online` unchanged.

Enable immediately saves the visible valid draft and enabled state together, then ensures the shared subscription through Convex. An invalid draft writes nothing. Disable immediately persists false and releases the guild consumer, while preserving ordinary configuration; unsaved draft edits do not prevent disabling. The last consumer deletes the external subscription. No restart, separate Save or Refresh connection is needed. Subscription failures expose Retry subscription only in the error state, including failed cleanup after disable. Reactive Convex queries update Disabled, Connecting, Ready, Missing permission, Subscription failed and Provider unavailable states.

## Event and delivery path

Twitch sends `stream.online` to the VPS listener. One authenticated Convex action validates the typed event, reserves its message ID and stream-session key, then schedules processing before the webhook is acknowledged. Convex resolves indexed guild targets, verifies unique owners with bounded concurrency, and fetches stream metadata and profile metadata once for the event. Enrichment is reused for every guild. Per-guild broadcaster/stream keys prevent duplicate deliveries.

A scheduled Convex action claims each delivery, checks real Discord bot/channel/mention permissions through REST, and freshly verifies owner/config authority immediately before entering `sending`. It performs exactly one Discord message POST using the production backend bot token. The Discord Gateway runtime no longer runs a live-notification polling worker or needs any pending/claim API.

Before reservation, transient failures may retry through a durable claim lease, with at most three claims. Deterministic failures record their specific reason. After reservation, every ambiguous outcome, including a lost response, HTTP rejection or malformed successful response, becomes `uncertain` and is never blindly retried. A known message ID becomes `sent`; a late acknowledgement may settle an uncertain outcome. Inspect Discord before any manual recovery. An enforced nonce is an additional recent-request safeguard, not the durable idempotency guarantee.

Deliveries older than 15 minutes check that the original stream session is still live before reservation. This is a delivery-triggered eligibility check, not polling or repeated metadata enrichment. An ended/replaced stream records `streamEnded`. Retention keeps event/session and delivery evidence for 31 days with bounded hourly cleanup; ingress rejects sessions already older than 30 days.

## Components V2 card

The backend builds a Twitch-purple `ContainerBuilder`, broadcaster identity in a `SectionBuilder` with optional profile-image `ThumbnailBuilder`, category/login and stream title using `TextDisplayBuilder`, a large 16:9 `MediaGalleryBuilder`, relative start time and optional viewer count, `SeparatorBuilder`, and a Watch on Twitch link button. `MessageFlags.IsComponentsV2` is required. No legacy embeds are used.

Get Streams `thumbnail_url` width/height placeholders resolve to 640x360; Get Users supplies `profile_image_url`. Missing avatar, preview or viewers degrades cleanly. Twitch text is normalized and markdown/mention sanitized. `allowed_mentions` allows only the configured everyone mention, exactly one approved role, or none. Destination validation checks real overwrite precedence and bot permissions before send.

## Rollout

See [bootstrap](bootstrap.md) for HTTPS ingress, shared server credentials and host contract 3. Existing enabled guild configurations require the explicit paginated internal `liveNotificationActions:migrateConsumers` operation after backend rollout; it verifies current authority, ensures consumers and subscriptions, and can be safely repeated. There is no background migration or desired-subscription polling.

Production acceptance should exercise two guilds sharing one owner: one external subscription, first disable retains it, last disable deletes it. Verify immediate dirty-draft enable, ordinary saves without EventSub changes, redelivery, revocation, missing scopes, provider outage, destination deletion and uncertain-send handling. No production deployment or live side-effect test was run during implementation.
