# Bootstrap Cleo's Twitch chat bot

Complete these steps after reviewing and merging the bootstrap. This guide sets up one broadcaster and one dedicated Cleo bot. It does not complete the Twitch migration or JCN-213's account lifecycle work. See [architecture and trust boundaries](architecture.md) for the design and official references.

## A. Configure the Twitch Developer application

1. Create or select Cleo's Twitch Developer application. Use the **same Client ID and Client Secret** for Clerk's production Twitch connection and the runtime. Both the broadcaster's `channel:bot` grant and the bot's grants must belong to that application.
2. Copy the production OAuth redirect URI shown by Clerk's Twitch social-connection settings into the Twitch application. Use Clerk's actual URI, not Cleo's `/sso-callback`.
3. Add the operator redirect URI selected for `TWITCH_BOT_REDIRECT_URI`. The utility accepts `http://127.0.0.1:<operator-port>/callback`; register the exact port and path. The utility binds only to loopback.
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

Host contract 2 requires the reviewed controller, unit and scoped `reset-failed` sudo rule. Existing hosts with contract 1 must have the updated host tooling installed through the reviewed bootstrap procedure before a future production activation. The runner check rejects stale tooling. An interrupted activation restores the last verified release on the next controller invocation, or stops the service if no healthy previous release exists.

## D. Configure Convex EventSub ingress

1. Find the production Convex deployment's **HTTP Actions URL** (`CONVEX_SITE_URL`, with the `.convex.site` domain). Set the callback to that actual HTTPS origin plus `/twitch-eventsub`. Do not use the `.convex.cloud` client API URL.
2. Generate a cryptographically random printable ASCII secret containing 10 to 100 non-space characters. Store it as `TWITCH_EVENTSUB_SECRET` in the production Convex environment and the VPS environment. The values must match.
3. Deploy the backend through the reviewed workflow's conditional backend stage, or the established backend release process, before activating Twitch. The endpoint returns `503` when its secret is unavailable.

The runtime reconciles `channel.chat.message` version `1` over webhook transport, with the configured broadcaster and dedicated bot. Pending verification is not ready. Incoming requests verify HMAC-SHA256 over the original message ID, timestamp and body before parsing JSON. Timestamps older than ten minutes or more than one minute in the future are rejected. Valid redelivery has no chat side effects. Notifications are acknowledged without persisting or logging their content.

For EventSub secret rotation, update both environments and remove the affected old subscription through Twitch's management API before restarting the runtime. Twitch's list API does not disclose the installed secret. Do not assume an existing enabled subscription proves it uses a newly changed secret. A callback mismatch fails closed and requires operator review.

## E. Install the VPS host contract

1. Use the existing `cleo` and `github-runner` Linux accounts. Review `ops/twitch/bootstrap-host.sh`, the unit and sudoers file from a trusted checkout, then run `sudo bash ops/twitch/bootstrap-host.sh`. It installs contract version `1` and the SHA256-verified Linux x64 Node `v24.15.0`. It enables the service without starting it.
2. Restart the runner session so its `cleo-deploy` and `cleo-runtime` group memberships take effect. The runtime is excluded from `cleo-deploy`; releases are read-only to `cleo-runtime`.
3. Populate `/etc/cleo/twitch-bot.env` through your secure operator channel. Keep owner/group `root:cleo` and mode `0640`. Start from `ops/twitch/twitch-bot.env.example`.
4. Set these variable names, without placing values in workflow inputs or command history:

   - `NODE_ENV` (`production`)
   - `TWITCH_CLIENT_ID`
   - `TWITCH_CLIENT_SECRET`
   - `TWITCH_BOT_USER_ID`
   - `TWITCH_BOT_GRANT_PATH` (`/var/lib/cleo-twitch/bot.twitch-grant.json`)
   - `TWITCH_BOOTSTRAP_BROADCASTER_USER_ID`
   - `TWITCH_EVENTSUB_CALLBACK_URL`
   - `TWITCH_EVENTSUB_SECRET`
   - `TWITCH_READINESS_PATH` (`/run/cleo-twitch/state.json`)
   - `TWITCH_HTTP_TIMEOUT_MS` (`10000`)
   - `TWITCH_STARTUP_TIMEOUT_MS` (`90000`)

5. Install the private grant from section C, then run `/usr/local/libexec/cleo/twitch/check-twitch-runner` as `github-runner`. This checks installed tooling, runtime isolation, secret-file permissions, pinned Node, systemd and sudo rules.
6. Configure the GitHub environment `twitch-production`, its production `CONVEX_DEPLOY_KEY` when backend deployment is needed, and the existing trusted `cleo-prod` runner. Enable the repository variable `CLEO_TWITCH_DEPLOY_ENABLED=true` only after setup. Main protection remains JCN-206 governance work.

Keep `/srv/cleo/twitch-bot/releases/<sha>` immutable. The controller validates archive members, checksum, file hashes, package, SHA, platform and runtime metadata before switching `current`. Host tooling is root-owned and independently versioned; update it from a reviewed checkout when the host contract changes. The VPS never builds source. The service uses `NoNewPrivileges`, a strict read-only filesystem, protected home and dedicated writable state/runtime directories.

## F. Deploy and explicitly send the smoke message

1. After merge and external setup, run **Deploy Twitch Production** on `main` with operation `validate`. This tests and packages a release without deploying Convex, activating the service or sending chat.
2. Run operation `deploy`. For the first deployment, select `deploy_backend=true` if the backend route has not already been deployed. Select it for backend dependency updates confined to the lockfile too. Push-triggered releases check backend, shared and env changes in the push range. Coordinate Convex releases with the existing Discord pipeline.
3. Inspect the workflow summary, `systemctl status cleo-twitch.service`, and the safe runtime logs. The controller accepts readiness only for the current systemd PID, a process start after activation, a recent timestamp, valid tokens and an enabled subscription. Its readiness limit is 120 seconds. No incoming chat message is required.
4. If activation or readiness fails, inspect `shared/deployment-state.json`. The controller restores and checks the previous verified release. If no previous release is healthy, it stops the service and records `unhealthy`. After fixing the cause, redeploy. To explicitly restore a recorded previous release, run `/usr/local/libexec/cleo/twitch/deploy-twitch-release rollback` as `github-runner`.
5. Only after readiness succeeds, explicitly invoke the smoke once as an operator. Run this transient unit from a root-authorized operator shell. Systemd reads the private environment file; credentials do not enter the command line.

   ```bash
   sudo systemd-run --unit=cleo-twitch-smoke --collect --wait --pipe \
     --property=User=cleo --property=Group=cleo \
     --property=SupplementaryGroups=cleo-runtime \
     --property=EnvironmentFile=/etc/cleo/twitch-bot.env \
     --property=WorkingDirectory=/srv/cleo/twitch-bot/current \
     --property=NoNewPrivileges=yes --property=UMask=0077 \
     /usr/local/libexec/cleo/twitch/run-twitch-release smoke
   ```

6. Verify that the dedicated Cleo account sends `dude is online.` in the configured broadcaster's chat. A single safe message override is accepted. The command performs one send without automatic retry; after an ambiguous network failure, inspect chat before invoking it again.

Startup, restarts, reconnection checks, tests and CI never invoke the smoke command. This result proves the bootstrap's authorization, subscription and send path, not a complete Twitch feature migration.
