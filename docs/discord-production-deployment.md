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

The runtime environment is never copied or linked into a release checkout. The
systemd services load `/etc/cleo/discord-bot.env` directly.

## One-time VPS setup

The `github-runner` and `cleo` users must already exist.

```bash
sudo groupadd --force cleo-deploy
sudo usermod -aG cleo-deploy github-runner
sudo usermod -aG cleo-deploy cleo

sudo install -d -o root -g cleo-deploy -m 2775 /srv/cleo/discord-bot
sudo install -d -o root -g cleo-deploy -m 2775 /srv/cleo/discord-bot/releases
sudo install -d -o root -g cleo-deploy -m 2775 /srv/cleo/discord-bot/shared

sudo install -d -o root -g cleo -m 0750 /etc/cleo
sudo touch /etc/cleo/discord-bot.env
sudo chown root:cleo /etc/cleo/discord-bot.env
sudo chmod 0640 /etc/cleo/discord-bot.env
```

Install the reviewed unit and sudo policy templates from the repository:

```bash
sudo install -o root -g root -m 0644 \
  ops/discord/systemd/cleo-discord.service \
  /etc/systemd/system/cleo-discord.service
sudo install -o root -g root -m 0644 \
  ops/discord/systemd/cleo-discord-register-commands.service \
  /etc/systemd/system/cleo-discord-register-commands.service
sudo install -o root -g root -m 0440 \
  ops/discord/sudoers/cleo-discord-deploy \
  /etc/sudoers.d/cleo-discord-deploy

sudo visudo -cf /etc/sudoers.d/cleo-discord-deploy
sudo systemctl daemon-reload
sudo systemctl enable cleo-discord.service
```

Do not start the runtime service until the first release has created the `current`
symlink. Restart the GitHub runner service after changing its group membership so
new jobs receive `cleo-deploy`.

The production workflow uses the Node and pnpm versions pinned in `package.json`.
The runtime service uses the `cleo` user's NVM installation through
`/home/cleo/.nvm/nvm-exec`.

## Environment placement

### VPS: `/etc/cleo/discord-bot.env`

Start from `ops/discord/discord-bot.env.example` and edit the real file with
`sudoedit`. Required values:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables production runtime validation. |
| `CONVEX_URL` | HTTPS URL of the production Convex deployment. |
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

Never paste the completed environment file into GitHub, Linear, workflow logs, or
chat.

### GitHub environment: `discord-production`

Set this Actions environment secret:

| Secret | Purpose |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | Authorizes `convex deploy` against the production deployment. |

Restrict the environment deployment branch to `main`. Runtime Discord and Clerk
secrets remain on their owning platforms instead of GitHub Actions secrets.

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

## Smoke, deploy, and rollback

After the host, services, sudo policy, and environment values are installed,
dispatch **Discord Production Runner Smoke** from `main`. It verifies:

- the `cleo-prod` runner and `github-runner` identity;
- pinned Node and pnpm versions;
- `cleo-deploy` membership and release-directory access;
- system-level services running as `cleo`;
- external environment-file wiring without reading its contents;
- the narrow systemd sudo policy;
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
