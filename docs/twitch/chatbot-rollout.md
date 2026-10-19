# Activate Twitch chatbot identity

Run this procedure only during a maintainer-approved production rollout. Implementation does not change production services, secrets, grants or databases. Keep the existing Production Release coordinator and protected environment approvals.

## Maintainer configuration

The table distinguishes existing requirements from settings introduced by this PR. Existing means required by the deployed architecture, not newly inspected production configuration. Confirm values privately; this review did not read or change production environments.

| Location                      | Status                                          | Exact setting or action                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twitch Developer application  | Existing                                        | Retain the production Client ID/secret, Clerk OAuth redirect and bot operator loopback redirect. Bot, Clerk and Convex must use the same application. Preserve CleoJCN's validated grant and moderator assignments.                                                                                           |
| Twitch Developer application  | New for revoked recovery                        | Add `https://app.cleoai.cloud/twitch/chat-consent` as an OAuth redirect if that is the canonical production dashboard origin. If the deployed origin differs, use its exact HTTPS `/twitch/chat-consent` URL instead. Keep Clerk's redirect registered too. No additional application or bot grant is needed. |
| Clerk production instance     | Existing                                        | Twitch remains a secondary connection with custom credentials for that same production application. Keep Discord primary. Keep user-created, user-updated and user-deleted webhook delivery to the existing Convex `/clerk-users-webhook` endpoint and its signing secret.                                    |
| Clerk permissions             | Existing, verify per broadcaster                | Normal linking requests `channel:bot`; selected announcements request their feature scopes. Retain already granted scopes. Do not enable every optional scope globally. Only users missing required permissions reconnect through Clerk.                                                                      |
| Convex production environment | Existing                                        | Retain `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BOT_USER_ID`, `TWITCH_EVENTSUB_CALLBACK_URL`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_WORKER_SECRET`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` and `CLERK_JWT_ISSUER_DOMAIN`. Callback, HMAC secret and worker secret must match the deployed runtime. |
| Convex production environment | New, default off                                | Leave `TWITCH_CHAT_PRESENCE_ENABLED` unset or `false` until the compatible runtime is healthy and reports readiness. Set exactly `true` only at the activation step below.                                                                                                                                    |
| Convex production environment | New, optional unless revoked recovery is needed | Set server-only `TWITCH_CHAT_OAUTH_REDIRECT_URL` to the exact registered dashboard recovery URL. Absence or an invalid URL prevents recovery; valid existing connections continue working.                                                                                                                    |
| Vercel dashboard              | Existing                                        | Deploy the callback page with the existing Clerk and Convex configuration and canonical `NEXT_PUBLIC_APP_URL`. No new client secret, public OAuth variable or Clerk provider configuration is required. Do not expose either new Convex setting with `NEXT_PUBLIC_`.                                          |
| Oracle Twitch runtime         | Existing                                        | Preserve the grant file, `TWITCH_BOT_GRANT_PATH`, credentials, `CONVEX_URL`, worker/HMAC secrets, HTTPS `/eventsub` callback, local port 8087 and readiness path. Release the compatible runtime through the protected coordinator. No extra daemon, IRC connection or new environment variable is required.  |
| Operator workstation          | Optional                                        | Existing `TWITCH_BOOTSTRAP_BROADCASTER_USER_ID` selects the single controlled smoke destination. The existing bot reauthorization utility is only for a separately confirmed invalid bot grant; do not run it for the validated grant.                                                                        |

The recovery flow remains narrowly scoped to revoked chatbot authority. Clerk handles all normal connections. See the [Clerk versus OIDC evidence and decision](consent-architecture-review.md) for the documented limits of Clerk audit data and Twitch authorization events. This is Cleo's explicit-revocation policy, not an extra Twitch API requirement.

The maintainer's 19 October Clerk configuration screenshot shows `user:read:email`, `user:read:chat`, `user:write:chat`, `channel:bot`, `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`, `channel:read:hype_train` and `channel:read:charity`, with the account selector enabled. This is configuration evidence, not proof that each broadcaster granted every scope. Preserve the existing configuration for this release. Recovery retains whichever scopes Twitch actually validates on the Clerk token, including this complete set when granted, and adds only `openid`. Do not copy the broadcaster scope list onto the dedicated bot grant.

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

Clerk unlink, transfer and deletion invalidate account authority in their original transaction. Subscription cleanup follows in scheduled batches of five subscription records and 25 memberships, so guild count cannot block the Clerk transaction. Cleanup preserves other owners' consumers and a fresh trusted link to the same broadcaster. Inspect failed scheduled `twitchChat:cleanup` or `twitchChat:cleanupMembers` mutations and retry their recorded arguments through the approved internal interface. Repeated cleanup is safe.

Provider `authorization_revoked` and `user_removed` states require explicit reauthorization. Its intent survives bounded provider retries. Webhooks for an obsolete subscription ID cannot overwrite a different current ID or invalidate its recovery proof. Early callbacks without a stored ID still apply. If revocation wins a race with subscription creation, `twitchEventSubActions:deleteRejected` retires the rejected provider result with bounded retries. If those retries exhaust, retry that specific scheduled operation and verify provider deletion. Retain the compatible webhook runtime until cleanup is confirmed.

## Recover a revoked broadcaster

The public Retry and account Sync actions cannot assert renewed consent. Clerk callback navigation, unchanged account metadata and token refresh do not clear revocation. The revocation barrier survives unlink, relink, final-consumer cleanup and provider deletion. A later revocation invalidates any earlier recovery proof.

Before enabling this recovery flow, a maintainer must register the dashboard's exact HTTPS `/twitch/chat-consent` URL on the existing production Twitch application and configure that same URL as Convex `TWITCH_CHAT_OAUTH_REDIRECT_URL`. This is a deployment prerequisite, not an implementation-time infrastructure change. The variable is server-only and optional; when unset, recovery fails closed while valid connections continue normally. Keep the existing activation gate and protected release coordinator.

1. For a revoked broadcaster, select the workspace's existing **Reconnect Twitch** action if its Clerk grant is stale or missing permission. Complete Clerk's flow as that broadcaster and synchronize the account. This alone does not lift revocation.
2. Select **Authorize chatbot**. Cleo starts Twitch's OIDC authorization-code flow with `force_verify=true`, `openid` plus the existing Clerk token's server-validated scopes (including `channel:bot`), a random state and a distinct nonce. Retaining the validated scopes avoids requesting a narrower grant. Only revoked connections need this additional proof. No dedicated bot authorization is requested or changed.
3. Complete Twitch authorization as the same linked broadcaster. The server exchanges the single-use code, verifies Twitch's RS256 ID-token signature against its fixed JWKS endpoint, issuer, audience, subject, nonce and time claims, and validates the returned user token's Client ID, broadcaster and `channel:bot` scope. It also rechecks the authenticated Clerk identity and current linked-account evidence.
4. The server atomically consumes the proof against the exact linked-account record, subscription and revocation version, then schedules reconciliation. One proof cannot authorize another user, broadcaster, application or later revocation. Provider retries use the consumed server record rather than a browser flag.
5. Pending attempts expire after ten minutes. Consuming a verified proof starts a fresh ten-minute retry window, so completing consent near the original deadline still permits bounded provider recovery. State and nonce hashes, identity bindings and proof status are then removed. Only one recovery record is retained per user. Codes, ID tokens, access tokens and refresh tokens are not stored in the proof or application logs; temporary returned tokens are discarded without replacing or revoking Clerk's tokens. The callback removes its query parameters from browser history and sets `no-referrer`.
6. If code exchange or verification fails, start a new recovery flow after the brief issuance limit. The code may already have been consumed by Twitch, so it is not automatically replayed. A verified proof survives the existing bounded EventSub provider retries. Check the actual provider subscription and workspace state after recovery.
7. During controlled acceptance, compare the existing Clerk token's validated identity and enabled feature scopes before and after recovery. Verify an existing announcement and Clerk's normal token refresh. The implementation never writes Clerk credentials or revokes either grant; local fixtures cannot certify undocumented provider-wide token side effects. Stop wider activation if this compatibility check fails and reconnect the broadcaster through Clerk as needed.

Do not roll the backend back to a version with client-controlled reauthorization flags. Retain this authorization boundary when recovering an older runtime. If a backend rollback is unavoidable, disable chat activation and retire chat subscriptions first through the approved process.

References: [Twitch OIDC flow and nonce validation](https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/), [Clerk verification fields](https://clerk.com/docs/reference/backend/types/backend-verification).

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
