# Discord production deployment

Cleo Discord production deploys only from trusted `main` pushes or an explicit
manual dispatch. Pull requests never run on the production runner. Vercel remains
responsible for `apps/dashboard`; the Discord workflow deploys Convex and the bot
runtime.

The production runner is selected by the unique `cleo-prod` label. A workflow run
that classifies a dashboard-only, documentation-only, or runner-smoke-only commit
as non-deploying is expected to skip the production job.

## Production ownership and paths

| Purpose | Value |
| --- | --- |
| Actions runner user | `github-runner` |
| Runtime user | `cleo` |
| Shared deployment group | `cleo-deploy` |
| Runner label | `cleo-prod` |
| Deployment root | `/srv/cleo/discord-bot` |
| Releases | `/srv/cleo/discord-bot/releases/<sha>` |
| Active release | `/srv/cleo/discord-bot/current` |
| Persistent deployment state | `/srv/cleo/discord-bot/shared/deployment-state.env` |
| Runtime environment | `/etc/cleo/discord-bot.env` |
| Runtime service | `cleo-discord.service` |
| Command registration service | `cleo-discord-register-commands.service` |
| Host checks | `/usr/local/libexec/cleo/check-discord-*` |

The runtime environment is never copied or linked into a release checkout. The
systemd services load `/etc/cleo/discord-bot.env` directly, and the application
reads the resulting `process.env` values.

## One-time VPS setup

The `github-runner` and `cleo` users and the `cleo` user's NVM installation must
already exist. After this repository revision reaches `main`, run from a clean
checkout on the VPS:

```bash
sudo bash ops/discord/bootstrap-host.sh
```

The idempotent bootstrap installs or verifies:

- `cleo-deploy` membership for `github-runner` and `cleo`;
- `/srv/cleo/discord-bot/{releases,shared}`;
- `/etc/cleo/discord-bot.env` with `root:cleo` and mode `0640`;
- root-owned environment and runtime check helpers;
- system-level runtime and command-registration units;
- the narrow deployment sudo policy;
- systemd reload and runtime-service enablement.

It preserves an existing environment file. If the file does not exist, it copies
the non-secret template and intentionally leaves validation failing until every
placeholder is replaced.

Do not start the runtime service manually before the first release creates the
`current` symlink. Restart the GitHub runner service after changing group
membership so new jobs receive `cleo-deploy`.

The Actions workflow installs the Node and pnpm versions pinned in `package.json`.
The bot runtime independently uses the `cleo` user's NVM installation through
`/home/cleo/.nvm/nvm-exec`. Install the exact version from `.nvmrc` for that user:

```bash
sudo -iu cleo bash -lc 'source "$HOME/.nvm/nvm.sh" && nvm install 24.15.0 && nvm alias default 24.15.0'
```

The runner smoke validates both the Actions toolchain and the separate `cleo`
runtime Node installation.

## Environment placement

### VPS: `/etc/cleo/discord-bot.env`

Start from `ops/discord/discord-bot.env.example` and edit the real file with
`sudoedit`. Required values:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables production runtime validation. |
| `CONVEX_URL` | HTTPS origin of the production Convex deployment. |
| `DISCORD_BOT_CONVEX_SECRET` | Shared bot-to-Convex secret; must exactly match Convex production. |
| `DISCORD_BOT_TOKEN` | Production Discord bot token. |
| `DISCORD_APPLICATION_ID` | Discord application ID used for global command registration. |
| `DISCORD_BOT_RUNTIME_MODE` | Use `single` initially or `sharded` when deliberately enabled. |
| `DISCORD_BOT_SHARD_COUNT` | Use `auto` unless a fixed positive shard count is required. |

`DISCORD_CLIENT_ID` is an optional compatibility alias. `DISCORD_TEST_GUILD_ID` is
for development registration and does not belong in the production runtime file.

Generate the shared Convex secret once, then put the same value on the VPS and in
Convex production:

```bash
openssl rand -hex 32
```

The root-owned host validator rejects missing, duplicate, placeholder, malformed,
or unsafe production values without printing them. The runner cannot read the file
directly; it may only execute the validator as `cleo` and receive pass/fail output.

Never paste the completed environment file into GitHub, Linear, workflow logs, or
chat.

### GitHub environment: `discord-production`

Set this Actions environment secret:

| Secret | Purpose |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | Authorizes `convex deploy` against the production deployment. |

Restrict the environment deployment branch to `main`. Runtime Discord and Clerk
secrets remain on their owning platforms instead of GitHub Actions secrets.

Set the repository Actions variable `CLEO_DISCORD_DEPLOY_ENABLED` to `false` or
leave it unset during bootstrap. Automatic and manual deployment remain disabled
until this variable is exactly `true`. Manual `validate` and `rollback` operations
remain available while the gate is off.

### Convex production environment

Enter these through the Convex production deployment settings. The reference file
`ops/convex/production.env.example` is not loaded automatically.

| Variable | Requirement |
| --- | --- |
| `NODE_ENV=production` | Enables production URL validation and runtime defaults. |
| `CLERK_JWT_ISSUER_DOMAIN` | Required by Convex auth configuration. |
| `CLERK_SECRET_KEY` | Required for Clerk user and Discord OAuth token resolution. |
| `CLERK_WEBHOOK_SECRET` | Required by `/clerk-users-webhook`. |
| `DISCORD_BOT_CONVEX_SECRET` | Required; same random value as the VPS. |
| `DISCORD_BOT_TOKEN` | Required for server-install and Discord REST verification. |
| `DISCORD_APPLICATION_ID` | Required for the Discord server-install URL and command identity. |
| `DISCORD_CLIENT_ID` | Recommended compatibility alias, normally the same ID. |
| `DISCORD_BOT_PERMISSIONS` | Recommended decimal permission value for Cleo server installs. |
| `DISCORD_INSTALL_REDIRECT_URI` | Optional only when the approved Discord flow needs an explicit redirect. |

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are not Discord v3.0.0 release
requirements unless production billing is deliberately enabled.

### Vercel production: `apps/dashboard`

Set these in the Vercel **Production** environment. Public values are embedded at
build time, so changing them requires a new dashboard deployment.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Same production Convex URL used by the VPS. |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS dashboard URL, currently `https://cleoai.cloud`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk production publishable key. |
| `CLERK_SECRET_KEY` | Clerk production secret key. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/dashboard` |

Use `apps/dashboard/.env.example` as the non-secret reference. Do not set a local
HTTP URL in a production build; the shared environment validator permits HTTP only
for explicit loopback development URLs.

## Values shared across platforms

| Value | Locations that must agree |
| --- | --- |
| Production Convex URL | VPS `CONVEX_URL`; Vercel `NEXT_PUBLIC_CONVEX_URL` |
| Bot-to-Convex secret | VPS and Convex `DISCORD_BOT_CONVEX_SECRET` |
| Discord bot token | VPS and Convex `DISCORD_BOT_TOKEN` |
| Discord application ID | VPS and Convex `DISCORD_APPLICATION_ID` |
| Clerk secret key | Vercel and Convex `CLERK_SECRET_KEY` |

## Safe first-production activation

1. Leave `CLEO_DISCORD_DEPLOY_ENABLED` unset or set to `false`.
2. Merge the reviewed workflow and operations revision to `main`.
3. Run `sudo bash ops/discord/bootstrap-host.sh` from the new `main` checkout.
4. Populate the VPS, Convex production, Vercel Production, and GitHub environment.
5. Restart the GitHub runner service after group or helper changes.
6. Dispatch **Discord Production Runner Smoke** from `main` and require it to pass.
7. Dispatch **Deploy Discord Production** with `operation=validate`. This runs the
   frozen install, peer check, tests, typecheck, lint, and build on `cleo-prod`
   without deploying Convex or changing the running bot.
8. Set repository Actions variable `CLEO_DISCORD_DEPLOY_ENABLED=true`.
9. Dispatch **Deploy Discord Production** with `operation=deploy`.
10. Keep the variable enabled for automatic relevant `main` deployments, or switch
    it back to `false` as a production kill switch.

## Smoke, deploy, and rollback

The runner smoke verifies:

- the `cleo-prod` runner and `github-runner` identity;
- pinned Actions Node and pnpm versions;
- the exact Node version available to the `cleo` runtime user;
- `cleo-deploy` membership and release-directory access;
- system-level services running as `cleo` with release paths read-only;
- external environment-file wiring and required production values without exposing them;
- root ownership of the host checks and the narrow systemd sudo policy;
- a harmless release-directory write and cleanup.

A relevant trusted `main` push then validates the exact commit, deploys Convex,
stages a standalone Discord release, atomically switches `current`, restarts the
runtime, holds a 30-second liveness check, and registers commands only when their
inputs changed. Deployment state records the application, previous application,
and command-registration SHAs.

For rollback, dispatch **Deploy Discord Production** with `operation=rollback`.
Convex is not redeployed during rollback. The previous runtime release is restored,
its command state is reapplied when necessary, and the state file is updated so the
operation remains reversible.
