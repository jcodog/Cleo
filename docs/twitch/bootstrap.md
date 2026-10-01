# Bootstrap Cleo's Twitch chat bot

Complete these steps after reviewing and merging the bootstrap. This guide installs the always-running webhook bot and backend subscription control plane. It does not complete the Twitch migration or JCN-213's account lifecycle work. See [architecture and trust boundaries](architecture.md) for the design and official references.

## A. Configure the Twitch Developer application

1. Create or select Cleo's Twitch Developer application. Use the **same Client ID and Client Secret** for Clerk's production Twitch connection and the runtime. Both the broadcaster's `channel:bot` grant and the bot's grants must belong to that application.
2. Copy the production OAuth redirect URI shown by Clerk's Twitch social-connection settings into the Twitch application. Use Clerk's actual URI, not Cleo's `/sso-callback`.
3. Add the operator redirect URI selected for `TWITCH_BOT_REDIRECT_URI`. The utility accepts `http://localhost:<operator-port>/callback`; register the exact port and path. The utility binds only to loopback.
4. Record the numeric Twitch user IDs of the dedicated bot and test broadcaster. They must be different. Store IDs in configuration, and credentials through your secure operator channel.

The browser return page `/twitch/link-callback?returnTo=%2Ftwitch` runs after Clerk completes its own external-account verification. It is not the Twitch Developer application's OAuth redirect URI.

## B. Enable Clerk broadcaster linking

1. Enable Twitch as a secondary social connection for existing Cleo users. Keep Discord as primary sign-in.
2. Configure production custom Twitch credentials using Cleo's application from section A. Development shared Clerk credentials cannot authorize the production bot application.
3. Sign in with Discord, open `/twitch`, and select **Connect Twitch**. Approve the additional scope `channel:bot`.
4. If Twitch is already linked without that scope, select **Reconnect Twitch**. Complete Clerk reverification if requested.
5. Confirm the page shows the matching Twitch identity and **Connected**. Select **Sync connection** if it shows **Sync required**. The callback reloads Clerk's verified account and invokes the existing trusted Convex sync action.

Provider cancellation and unavailable-provider states are recoverable from `/twitch`. No provider token is returned by the dashboard query. Unlink reconciliation and long-term freshness remain JCN-213 work; an old Convex record alone does not establish the page's connected state. JCN-51 covers the positive linking path in this branch, not the full unlink lifecycle.

## C. Authorize the dedicated Cleo bot

1. Create a private operator directory outside the checkout. On Linux, use mode `0700`; on Windows, restrict its ACL to the operator. Choose a grant filename ending in `.twitch-grant.json`.
2. Configure `apps/twitch-bot/.env.local` with `NODE_ENV=development`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BOT_USER_ID`, `TWITCH_BOT_GRANT_PATH` and `TWITCH_BOT_REDIRECT_URI`. Use an absolute private grant path and the exact registered redirect URI. Do not commit this file.
3. Run `bun run --filter @workspace/twitch-bot bot:authorize` from the repository root in an interactive terminal. The authorization URL contains one-use callback state and is printed only to that terminal, never structured logs or CI output.
4. Open the printed authorization URL while signed in as the dedicated bot. The utility requests exactly `user:read:chat`, `user:write:chat` and `user:bot`. It checks callback state, exchanges the code server-side, validates the client, bot identity and scopes, then saves a private grant. It never prints tokens or overwrites an existing grant.
5. Transfer the resulting grant JSON through a secure operator channel to `/var/lib/cleo-twitch/bot.twitch-grant.json`. Set owner/group `cleo:cleo` and mode `0600`; keep its directory `cleo:cleo` and `0700`.

The JSON contains the access token, rotating refresh token, expiry, Client ID and bot user ID. Keep it outside release artifacts and GitHub Actions. The runtime validates the bot on startup and every 30 seconds, refreshes expired/rejected access tokens, and atomically persists refresh rotation before a subsequent validation request. Validation outages and missing scopes fail readiness. App access tokens stay in process memory and are reacquired when invalid; they have no refresh token.

If authorization must be repeated, stop the runtime and preserve the existing grant securely before selecting a new output path. After a crash, a surviving `<grant-path>.lock` fails closed. Inspect its PID and confirm no runtime or operator uses the grant before removing that lock. Never delete a lock held by a live process.

Refresh writes a durable `<grant-path>.refreshing` marker before contacting Twitch, then stores the replacement in `<grant-path>.rotated` before replacing the primary grant. The next startup recovers a completed rotation. If storage fails before a replacement can be saved, the marker blocks reuse of the potentially invalid old token and requires operator reauthorization. Permanent loss of writable storage cannot guarantee recovery of a token returned by a remote service. Keep all sidecars private and transfer them together when recovering a failed rotation.

For local watch mode, use `bun run --filter @workspace/twitch-bot dev`. The `start`, `start:production`, `twitch:smoke` and `readiness` scripts execute compiled artifacts and require `bun run --filter @workspace/twitch-bot build` first. `twitch:smoke` remains an explicit operator action and must never be used as a readiness check.

Host contract 3 requires the reviewed controller, unit and scoped `reset-failed` sudo rule. Existing hosts with contract 1 or 2 must have the updated host tooling installed through the reviewed bootstrap procedure before a future production activation. The runner check rejects stale tooling. An interrupted activation restores the last verified release on the next controller invocation, or stops the service if no healthy previous release exists.

## D. Configure server-side control plane and HTTPS ingress

1. Choose a DNS hostname for the VPS and provision its valid TLS certificate. The read-only inspection of PuTTY profile `oracle` found no installed HTTPS ingress, host contract 2 and an unused loopback port 8087. There is no existing HTTPS hostname to reuse. Set `TWITCH_EVENTSUB_CALLBACK_URL=https://<twitch-host>/eventsub` in Convex and the VPS. The callback is the VPS, not a Convex HTTP Actions URL. HTTPS port 443 and the exact `/eventsub` path are required.
2. Set production Convex `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BOT_USER_ID`, `TWITCH_EVENTSUB_CALLBACK_URL`, and a random printable ASCII `TWITCH_EVENTSUB_SECRET` of 10 to 100 non-space characters. Client credentials must match Clerk and the dedicated bot application. Convex acquires App Access Tokens and creates/deletes subscriptions; credentials remain server-side.
3. Set a distinct high-entropy `TWITCH_WORKER_SECRET` identically in Convex and the VPS. It authenticates only verified-event receipt/template lookup, stream handling and subscription-state calls. Remove the obsolete `TWITCH_RUNTIME_CONVEX_SECRET` after coordinated rollout. Set VPS `CONVEX_URL` to the client API deployment URL ending in `.convex.cloud`.
4. During the separately authorized rollout, install Nginx and activate the complete TLS virtual host in `ops/twitch/nginx/eventsub.conf.example` after replacing `YOUR_TWITCH_HOST` and provisioning the referenced certificate. DNS-01 certificate validation can avoid another public HTTP route. Permit inbound TCP 443 in Oracle's network security rules and the host firewall; keep 8087 closed externally. Run `nginx -t` before activation. The runtime defaults to `127.0.0.1:8087`; only POST `/eventsub` is public and other paths return 404. Keep health local. Validate the certificate, request-size limit, timeout and signed challenge routing before enabling any feature. Nginx terminates TLS for the existing bot process; no second bot service is needed.
5. Inventory legacy subscriptions pointing at the old Convex `/twitch-eventsub` callback. Remove those exact old IDs through Twitch's management API as part of coordinated ingress migration; they cannot be adopted under a different callback. Avoid leaving old subscriptions consuming Twitch's duplicate limits. Never delete unrelated applications' subscriptions.
6. After the reviewed backend/runtime rollout, run the internal `liveNotificationActions:migrateConsumers` operation with `{}`. Repeat with its returned cursor until null, reviewing skipped owners that require reconnection. This explicit migration ensures existing enabled guilds acquire shared subscriptions immediately and is safe to repeat.

Secret rotation requires recreating affected subscriptions after updating both server environments. Twitch does not disclose installed webhook secrets in subscription listing. Do not assume an existing enabled subscription proves the secret changed. Rotation is an operator maintenance operation, not a normal dashboard requirement.

## E. Install VPS host contract 3

1. Review `ops/twitch/bootstrap-host.sh`, the systemd unit, ingress example and sudoers file from a trusted checkout. Use the existing `cleo` and `github-runner` accounts. Run `sudo bash ops/twitch/bootstrap-host.sh` only during the separately authorized production rollout. It installs contract 3 and SHA256-verified Linux x64 Node `v24.15.0`, enables the service without starting it, and installs `/etc/cleo/twitch-eventsub.nginx.example` without activating ingress.
2. Restart the runner session so `cleo-deploy` and `cleo-runtime` memberships take effect. The runtime cannot write releases or use deployment privileges.
3. Populate `/etc/cleo/twitch-bot.env` privately, `root:cleo`, mode `0640`, using the reviewed example. Required runtime names are:

   - `NODE_ENV=production`
   - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BOT_USER_ID`
   - `TWITCH_BOT_GRANT_PATH=/var/lib/cleo-twitch/bot.twitch-grant.json`
   - `TWITCH_EVENTSUB_CALLBACK_URL`, `TWITCH_EVENTSUB_SECRET`
   - `TWITCH_WORKER_SECRET`, `CONVEX_URL`
   - `TWITCH_READINESS_PATH=/run/cleo-twitch/state.json`
   - Optional `TWITCH_WEBHOOK_PORT=8087`, `TWITCH_HTTP_TIMEOUT_MS=10000`
   - Optional `TWITCH_BOOTSTRAP_BROADCASTER_USER_ID`, used only by an explicit operator smoke send, never to choose runtime subscriptions.

4. Install the private grant from section C. Run `/usr/local/libexec/cleo/twitch/check-twitch-runner` as `github-runner`; it checks installed tooling/ingress contract, secret permissions, runtime isolation, pinned Node and systemd/sudo rules. Separately test actual TLS/proxy routing: the host checker does not prove public reachability or certificate validity.
5. Configure the GitHub `twitch-production` environment, its protected `CONVEX_DEPLOY_KEY` and existing trusted `cleo-prod` runner. Keep `CLEO_TWITCH_DEPLOY_ENABLED=true` in that environment only after setup is complete. The workflow reads this environment variable inside the runner and forwards a boolean output to gated deployment jobs.

Releases under `/srv/cleo/twitch-bot/releases/<sha>` remain immutable. The controller validates archive members, checksum, hashes, SHA, package/platform/runtime metadata before switching `current`. The VPS never builds source. Systemd retains `NoNewPrivileges`, strict filesystem protection, private home and dedicated writable grant/readiness directories. This change uses the same bot process and service.

## F. Future production validation and optional smoke

No production deployment was performed by the implementation task. These are manual instructions for the later reviewed rollout.

1. Run Deploy Twitch Production on trusted `main` with operation `validate` to test and package without backend deployment, activation or chat sends. When separately authorized, use operation `deploy`; select `deploy_backend=true` for the initial control-plane/schema rollout or relevant dependency changes. Trusted-main pushes remain automatically gated by the protected environment setting.
2. Confirm the systemd service, `journalctl -u cleo-twitch.service`, local `GET http://127.0.0.1:8087/healthz` and public HTTPS routing. Readiness requires the current PID/start, valid token lifecycle and an operational listener, independently of whether any customer subscriptions exist. The controller readiness limit remains 120 seconds.
3. Enable a controlled announcement on `/twitch`: confirm immediate external creation, webhook challenge, reactive Ready status and one expected chat message. Edit/save its template and confirm no external subscription mutation. Disable and confirm immediate deletion; revoke a subscription and verify the dashboard's real failure state. Reconnect through Clerk for each missing feature permission.
4. Enable two controlled Discord guilds for one owner: confirm one `stream.online` subscription, one Components V2 card per approved destination, one enrichment operation, retained subscription after first disable and deletion after last disable. Exercise dirty valid/invalid enable, clean Save, ordinary destination/mention save, provider failure and authorized Retry subscription. Redelivery/restart must not duplicate side effects. Never blindly resend uncertain deliveries.
5. Activation failures trigger verified rollback or a stopped unhealthy service. Inspect `shared/deployment-state.json` before intervention. Explicit rollback uses `/usr/local/libexec/cleo/twitch/deploy-twitch-release rollback` as `github-runner`.
6. An optional operator smoke requires `TWITCH_BOOTSTRAP_BROADCASTER_USER_ID` and sends once without automatic retry. Credentials are read from the private environment through systemd, never command arguments:

   ```bash
   sudo systemd-run --unit=cleo-twitch-smoke --collect --wait --pipe \
     --property=User=cleo --property=Group=cleo \
     --property=SupplementaryGroups=cleo-runtime \
     --property=EnvironmentFile=/etc/cleo/twitch-bot.env \
     --property=WorkingDirectory=/srv/cleo/twitch-bot/current \
     --property=NoNewPrivileges=yes --property=UMask=0077 \
     /usr/local/libexec/cleo/twitch/run-twitch-release smoke
   ```

The default smoke text is `dude is online.`. After an ambiguous response, inspect chat before invoking it again. Startup, CI, readiness and deployment never send smoke messages. A smoke send proves chat authorization, not subscription lifecycle or webhook ingress.
