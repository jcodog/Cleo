# Activate Twitch chatbot identity

Run this procedure only during a maintainer-approved production rollout. Implementation does not change production services, secrets, grants or databases. Keep the existing Production Release coordinator and protected environment approvals.

## Verify permission evidence

Use Twitch's `/oauth2/validate` endpoint from a private operator session. Inspect the bot grant locally and resolve the broadcaster token through Clerk on the server. Report only client/identity matches, expiry and missing scope names. Never copy tokens, refresh tokens, authorization headers or viewer message bodies into logs, issues or screenshots.

| Principal                        | Required authorization                                                                                                                                     | Purpose                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dedicated CleoJCN bot            | `user:read:chat`, `user:write:chat`, `user:bot`                                                                                                            | Authorizes the application's dedicated sender and EventSub `user_id`                |
| Broadcaster linked through Clerk | `channel:bot`                                                                                                                                              | Authorizes cloud-chatbot presence and chat delivery in that channel                 |
| Application                      | Client credentials for the same production Twitch Client ID                                                                                                | Creates App Access Tokens for webhook subscriptions and `POST /helix/chat/messages` |
| Broadcaster, optional feature    | `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`, `channel:read:hype_train`, `channel:read:charity`, as required by the enabled event | Authorizes announcement events only                                                 |

App Access Tokens do not themselves carry the bot or broadcaster's user grants. Both user authorizations must belong to the same Client ID used by the application. Verify that the broadcaster ID differs from `TWITCH_BOT_USER_ID`.

The bot grant validated on 18 October 2026 already has all three required scopes. Retain it. Existing broadcasters with a valid same-client `channel:bot` grant need migration, not reauthorization. Reconnect only for missing scopes, revoked authorization, an incorrect client or a changed identity. Retain existing granted scopes during reconnect; request optional scopes only for selected features.

Moderator status remains unchanged. This implementation uses `channel:bot` rather than relying on moderator status. Twitch permits moderator status as an alternative for API sending, but its Chat Bots listing specifically requires broadcaster `channel:bot` authorization.

## Roll out in order

1. Leave the Convex-only `TWITCH_CHAT_PRESENCE_ENABLED` variable unset or set to `false`. This variable is independent of the existing protected release gates.
2. Use the existing release coordinator to deploy the compatible webhook runtime and backend. The default-off gate prevents account sync, dashboard Retry and migration from creating chat subscriptions during this stage. Do not dispatch an alternate deployment path.
3. Verify the current release SHA, systemd service, `/healthz`, public webhook routing and runtime readiness. The runtime validates its bot grant and app token, starts the listener, then reports the configured Client ID and bot ID under the existing worker secret. `twitchBotRuntime` must contain a recent `chat-v1` report for those identities. Reports expire after 90 seconds; they do not scan subscriptions.
4. Confirm with a signed fixture that ordinary `channel.chat.message` notifications return 204 without receipt writes, dispatch, content logs or per-message Convex requests. Verify the production executable is from the compatible release before activation.
5. After health verification and maintainer approval, set `TWITCH_CHAT_PRESENCE_ENABLED=true` in Convex. Do not add it to public dashboard environment variables.
6. In one controlled broadcaster's `/twitch` workspace, use **Retry chat connection**. Confirm separate broadcaster authorization, dedicated bot readiness and chat subscription status. **Chat connected** means a provider-confirmed enabled subscription, not an OAuth account or a running daemon.
7. Run the internal `twitchChatActions:migrate` action with `{}` using the approved Convex operator interface. Each call examines at most 25 linked-account records with concurrency four. Pass its returned `cursor` into the next invocation until null. Save processed/deferred counts. Repeating a page is safe. Revoked rows are not revived. Inspect and retry deferred users after resolving missing permissions or provider failures.
8. List the provider's active EventSub subscriptions using an App Access Token. Match type `channel.chat.message`, version `1`, broadcaster ID, dedicated bot `user_id`, webhook callback and enabled status. Confirm only one subscription for that exact identity. Check the existing announcements and shared `stream.online` subscription separately.
9. Open Twitch's **Users in Chat** list and verify CleoJCN appears in **Chat Bots**. Allow the Twitch UI to refresh after the subscription becomes enabled.
10. Invoke the existing explicit smoke sender once for the controlled broadcaster, following [bootstrap smoke instructions](bootstrap.md#f-future-production-validation-and-optional-smoke). It now validates the existing bot grant and sends with an App Access Token and the dedicated bot's `sender_id`. Confirm the official Chat Bot badge and the existing moderator badge in Twitch. A successful HTTP response alone does not prove the rendered badge. Do not automatically repeat an uncertain send.
11. Trigger one controlled announcement and one existing Discord live notification. Verify formatting, destination permissions and deduplication. Restart the stream and daemon through the approved operational process and verify the enabled chat subscription remains in place without reconnecting OAuth.

New successful trusted account links and account syncs schedule the same Convex-owned lifecycle. Transport revocations and temporary provider failures get bounded retries. Authorization revocation remains blocked until fresh successful reauthorization. Missing permissions, unlink, identity changes and disabled accounts remove consumer membership; the last consumer's removal requests provider deletion. No stream-start handler creates chat subscriptions.

## Recover or roll back

1. Keep a runtime containing the local chat privacy guard running while any chat subscription exists. Do not roll back to a runtime from before that guard.
2. Set `TWITCH_CHAT_PRESENCE_ENABLED=false` to prevent further chat subscription creation.
3. Run internal `twitchChatActions:retire` one page at a time with the returned cursor until null. It removes chat consumers and uses the existing leased reconciliation for deletion. Announcements and Discord live notification consumers remain intact.
4. Inspect rows with no consumers and `failed` or `providerUnavailable` status. Retry their specific `twitchEventSubActions:reconcile` operation through the approved internal interface until provider deletion succeeds. Retirement and deletion are idempotent. Preserve grants and customer announcement settings.
5. Verify the provider has no active `channel.chat.message` subscriptions on the production callback. Only then use the existing protected runtime rollback path. If deletion cannot be verified during an outage, retain the compatible webhook runtime until it can be verified.
6. To reactivate, deploy and verify a compatible runtime, enable the gate and repeat the bounded migration. Neither reactivation nor ordinary stream or daemon restarts require valid users to reconnect.

## Reauthorize the dedicated bot only if its grant is invalid

Do not run this procedure for the validated 18 October 2026 grant.

1. Diagnose sanitized `wrongClient`, `wrongBot`, `missingScope`, expiry or provider errors first. Temporary provider failures do not justify replacing a grant. The existing locked refresh and recovery mechanism handles normal expiry and preserves rotated refresh credentials.
2. If a maintainer confirms reauthorization is necessary, use an interactive trusted operator workstation. Configure the existing operator utility with the production Client ID, dedicated bot ID and registered loopback redirect. Choose a new private output path; the utility refuses to overwrite an existing grant.
3. Run `bun run --filter @workspace/twitch-bot bot:authorize`. Sign in explicitly as CleoJCN. The existing utility verifies OAuth state, Client ID, bot ID and all three scopes before saving privately. Do not approve as the broadcaster.
4. Validate the new grant through Twitch and transfer it only through the established secure operator procedure. Installing it or restarting the service requires separate production approval. Preserve the old file for recovery without exposing either grant.

## Acceptance record

Record the approved release SHA and these observations without credentials or viewer content:

- Matching Client IDs and distinct broadcaster/bot IDs; required grants remain valid.
- Recent bot readiness report and healthy compatible webhook runtime before activation.
- One enabled provider chat subscription with the exact condition and callback.
- CleoJCN appears under Chat Bots; one controlled API message shows the official Chat Bot badge and retains moderator privileges.
- Signed chat traffic produces zero per-message Convex requests, receipt rows, dispatches or content logs.
- Existing announcements and Discord live notifications work without duplicate sends.
- Stream/daemon restart and provider recovery preserve authorization and presence.
- Authorization revocation, missing permission, unlink and user disable fail closed.

Twitch controls the rendered listing and badge. These final UI observations require the approved production acceptance session and cannot be proven by local fixtures.

See [Twitch chat identity](https://dev.twitch.tv/docs/chat/#chatbot-badge-and-chat-identity), [cloud chatbot authentication](https://dev.twitch.tv/docs/chat/authenticating/), [Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message), [chat subscription authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channel-chat-message), [subscription lifecycle](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/) and [scope reference](https://dev.twitch.tv/docs/authentication/scopes/).
