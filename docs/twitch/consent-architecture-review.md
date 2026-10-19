# Twitch consent recovery decision

Reviewed 19 October 2026 for PR #252. Decision: retain the existing OIDC recovery proof for revoked chatbot subscriptions. Clerk remains the broadcaster account and credential owner for every normal connection. No new authorization EventSub framework is added.

## Clerk evidence

Clerk's [`ExternalAccount.reauthorize()`](https://clerk.com/docs/js-frontend/reference/types/external-account#reauthorize) starts another provider flow and accepts additional scopes and a return URL. Cleo already uses it for reconnecting and adding feature permissions. A browser reaching that return URL does not prove the flow completed.

The backend [external account](https://clerk.com/docs/reference/backend/types/backend-external-account) exposes identity, approved scopes and verification. [Verification](https://clerk.com/docs/reference/backend/types/backend-verification) includes status, expiry, attempts and a nonce, but the documentation does not establish a Twitch authorization completion timestamp or a nonce that Cleo can supply and later verify against a particular recovery attempt. An unchanged `verified` record is compatible with an older authorization.

The [OAuth access token object](https://clerk.com/docs/reference/backend/types/backend-oauth-access-token) includes expiry, external-account ID, scopes and an optional provider ID token. These help establish identity and current authorization. Documentation does not promise a fresh Twitch ID token for each `reauthorize()` call or expose control of its signed nonce for Cleo's recovery attempt. Token expiry, refresh and ID-token availability alone cannot establish renewed consent after a specific revocation.

Clerk does document `user.external_account.reauthorized` in [Application Logs](https://clerk.com/docs/guides/dashboard/logs/application-logs). This is useful operator evidence. The reviewed documentation does not establish an authenticated completion contract binding that event to a Cleo-issued challenge, Twitch Client ID and revocation version. It must not be treated as an available recovery webhook merely because it appears in an audit log. Ordinary signed [`user.updated` synchronization](https://clerk.com/docs/guides/development/webhooks/syncing) provides an account snapshot, not that contract.

Conclusion: equivalent Clerk proof is not demonstrated by the documented interfaces reviewed here. This is a limitation of the available evidence, not a claim that Clerk could never support it. Consolidation needs a documented correlation contract or confirmation from Clerk, followed by replay and ordering tests.

## Twitch authorization events

[`user.authorization.grant` and `user.authorization.revoke`](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#userauthorizationgrant) identify the application and Twitch user. Their documented event payloads do not include an OAuth state, nonce, recovery-attempt ID, revocation generation or authorization occurrence timestamp. The subscription's `created_at` describes the subscription, not the user's authorization.

The documentation does not explicitly guarantee a grant notification for every same-scope reauthorization through an existing Clerk connection. Its general statement that authorization was granted is insufficient to assume that stronger guarantee.

EventSub has [at-least-once delivery](https://dev.twitch.tv/docs/eventsub/), so duplicate delivery is expected. [Webhook headers](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#list-of-request-headers) authenticate message ID, message timestamp and payload; they do not bind the event to our challenge. No cross-grant/revoke ordering guarantee was identified in the reviewed docs. A recently delivered signed message can still describe an earlier authorization. Matching user and Client ID, deduplicating messages and checking delivery time do not establish the missing attempt/version binding.

Conclusion: these events could support a separate authorization ledger, but they are not a demonstrated drop-in replacement. Do not introduce that ledger in this release.

## Current grant versus recovery consent

Twitch requires [valid user grants before an app-token webhook subscription](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/#authorization). A currently validated Clerk token plus an accepted EventSub subscription is sufficient evidence of current provider permission. Twitch does not require Cleo to implement a second OIDC flow for chatbot presence.

Cleo deliberately retains a stricter rule: once chatbot authority is explicitly revoked, an old token, account snapshot or automatic retry cannot clear that barrier. Accepting current scopes alone would discard that product security rule. It could revive access after a revocation while an older valid token or delayed provider state remained available. That is a security-policy change, not an equivalent simplification.

The retained [Twitch OIDC code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/) supplies a signed, fresh nonce bound to a server-created attempt. Cleo verifies signature, issuer, audience, subject and times; validates the exchanged token; and atomically consumes the user/account/application/subscription/revocation-version binding. A subsequent current-subscription revocation invalidates it. Delayed webhooks for replaced subscription IDs cannot overwrite the recovered row. Pending and consumed records expire; bounded provider retries use the consumed proof.

## Credential compatibility and release scope

Only genuinely revoked rows can start recovery. Missing configuration fails closed. Valid links, permission additions, account synchronization, transport failures and stream/daemon restarts continue through Clerk and the existing control plane without an extra consent flow.

Recovery uses the same Twitch application and broadcaster. Its requested scopes are `openid` plus scopes already validated on the Clerk-managed token, including `channel:bot`. It does not add unrelated feature permissions or request a narrower scope set. The code only reads Clerk APIs, never replaces Clerk credentials, never invokes token revocation or refresh for this proof, and discards the temporary exchanged credentials. The dedicated bot grant is untouched.

Local tests verify that behavior. They cannot prove undocumented Twitch account-wide token behavior. The official [refresh guidance](https://dev.twitch.tv/docs/authentication/refresh-tokens/) describes refresh-token rotation and token limits, not a guarantee that every independent consent operation leaves every other token unchanged. Before production acceptance, validate the existing Clerk token's identity and enabled feature scopes before and after one controlled revoked-account recovery, then verify an announcement and Clerk's normal refresh path. If provider behavior invalidates the Clerk grant, reconnect through Clerk and investigate before wider activation. Do not revoke either grant as cleanup.

Configuration, bounded migration, acceptance and rollback steps are in [the rollout runbook](chatbot-rollout.md). Removing the secondary flow is deferred until equivalent documented proof is available.
