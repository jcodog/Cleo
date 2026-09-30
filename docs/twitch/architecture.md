# Twitch bootstrap architecture

The broadcaster is a Clerk-verified linked account. The dedicated Cleo bot is infrastructure and never occupies a customer's linked-account record. Both grants, Clerk and the runtime use the same Twitch Developer application's Client ID.

Use an App Access Token for webhook EventSub and Send Chat Message. The dedicated bot grants `user:read:chat`, `user:write:chat`, `user:bot`; the broadcaster grants only the additional `channel:bot` scope. These choices follow [Twitch cloud chatbot authentication](https://dev.twitch.tv/docs/chat/authenticating/) and [the chat API reference](https://dev.twitch.tv/docs/api/reference/#send-chat-message).

The runtime acquires app tokens through client credentials and reacquires them when invalid. It validates bot credentials at startup and at least hourly. Bot access and refresh credentials live in a private, atomically replaced grant file outside releases. Refresh operations serialize through a private lock file. This avoids losing rotated refresh tokens and keeps credentials out of release artifacts. See [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/) and [refresh-token rotation](https://dev.twitch.tv/docs/authentication/refresh-tokens/).

Convex owns public EventSub ingress. Verify HMAC over the message ID, original timestamp and raw bytes before parsing JSON. Reject old or future timestamps; bootstrap notifications have no chat side effects, so valid redelivery can be acknowledged safely without persisting chat. See [webhook verification](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/).

The runtime reconciles only its explicitly configured broadcaster/bot/callback subscription and waits for `enabled`, rather than treating a pending verification as ready. Periodic checks refresh local readiness and detect revocation. Readiness identifies the live process and its start time. The smoke command is a separate executable and is never called by the normal runtime.

The dashboard uses Clerk external-account creation, reauthorization for an existing Twitch account and reverification where required. It then invokes the existing server-side trusted synchronization. Preserve the Discord sign-in callback. See [Clerk SSO account management](https://clerk.com/docs/guides/development/custom-flows/account-updates/manage-sso-connections) and [reauthorization](https://clerk.com/docs/reference/types/external-account).

JCN-213 still owns generic provider unlink/freshness reconciliation. This bootstrap must not authorize operations from stale browser or Convex identity alone, add a caller-supplied identity mutation or claim full JCN-51 lifecycle completion.
