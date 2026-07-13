# Discord production deployment

Cleo Discord production deploys only from trusted `main` pushes or an explicit
manual dispatch. Pull requests never use the production runner. Vercel remains
responsible for `apps/dashboard`; this workflow validates and packages the Discord
runtime, deploys Convex, and activates the prepared release on the VPS.

## Pipeline architecture

The production VPS is an application host, not a CI build machine.

### GitHub-hosted Linux x64 job

`Validate and package Discord bot` runs on the hosted `ubuntu-24.04` Linux x64
runner and performs:

- exact checkout and frozen workspace install;
- peer dependency validation;
- Discord bot and Convex backend tests;
- Discord bot and Convex backend typecheck and lint;
- compiled Node ESM build with source maps;
- `pnpm deploy` packaging for `@workspace/discord-bot` and its production dependency closure;
- compiled runtime, command-registration, artifact-contract, and native canvas probes;
- creation of a deterministic commit-marked Linux x64 tarball and SHA-256 checksum;
- workflow artifact upload;
- Convex production deployment for an actual deploy operation.

The dashboard is not built or copied by this workflow.

### Self-hosted `cleo-prod` job

`Activate Discord release on production VPS` performs only lightweight host work:

- exact checkout for deployment scripts and Git history;
- runner, service, permission, environment, and runtime checks;
- download of the validated release artifact;
- checksum, archive-path, commit-SHA, and Node-version verification;
- staging under `/srv/cleo/discord-bot/releases/<sha>`;
- atomic `current` symlink switch;
- systemd restart and 30-second liveness check;
- selective global command registration;
- deployment-state update and automatic runtime rollback on activation failure.

The production VPS must never run `pnpm install`, tests, lint, typecheck, builds,
or Convex deployment as part of release activation.

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
| Persistent state | `/srv/cleo/discord-bot/shared/deployment-state.env` |
| Runtime environment | `/etc/cleo/discord-bot.env` |
| Runtime service | `cleo-discord.service` |
| Command service | `cleo-discord-register-commands.service` |
| Host checks | `/usr/local/libexec/cleo/check-discord-*` |

The runtime environment is never copied or linked into a release. Systemd loads
`/etc/cleo/discord-bot.env`, and the application reads the resulting `process.env`.

Each release contains the compiled runtime at `dist/index.js`, compiled global
command registration at `dist/scripts/registerCommands.js`, their source maps,
the artifact contract and validator, production dependencies, and exact release
metadata. The systemd units use the root-owned release launcher, which starts Node
against the compiled runtime and command-registration entrypoints. During the
JCN-194 release-format transition, the launcher also recognizes the previously
deployed TypeScript artifact so switching the `current` symlink back restores the
known rollback release. New production releases contain neither `src/` nor the
`tsx` package. Local development, watch mode, previews, and source command
registration continue to use `tsx`.

## JCN-194 first compiled-release migration

The production host initially has the legacy systemd units and does not have the
root-owned release launcher. Use this exact sequence for the first compiled
release so the merge cannot trigger activation before the host contract is
installed:

1. Set `CLEO_DISCORD_DEPLOY_ENABLED=false` before merging the PR.
2. Merge the reviewed PR into `main`.
3. Update the VPS checkout to the merged `main` revision.
4. Run `sudo bash ops/discord/bootstrap-host.sh` to install the release launcher
   and updated systemd units.
5. Run **Discord Production Runner Smoke** from the merged `main` revision.
6. Run **Deploy Discord Production** with `operation=validate` and require the
   validation-only workflow to pass.
7. Set `CLEO_DISCORD_DEPLOY_ENABLED=true`, then run the compiled production
   deployment.
8. Keep the previous legacy release available and confirm rollback remains
   usable until the first compiled release is accepted.

Do not re-enable the deployment gate before the bootstrap, runner smoke, and
validation-only workflow have all passed.

## One-time VPS setup

The `github-runner` and `cleo` users and the `cleo` user's NVM installation must
already exist. From a clean `main` checkout on the VPS:

```bash
sudo bash ops/discord/bootstrap-host.sh
```

The idempotent bootstrap installs or verifies:

- `cleo-deploy` membership for `github-runner` and `cleo`;
- `/srv/cleo/discord-bot/{releases,shared}`;
- `/etc/cleo/discord-bot.env` as `root:cleo` mode `0640`;
- root-owned environment and runtime validators plus the release launcher;
- system-level runtime and command-registration units;
- the narrow deployment sudo policy;
- systemd reload and runtime-service enablement.

It preserves an existing environment file. Restart the GitHub runner service after
changing group membership so new jobs receive `cleo-deploy`.

Install the exact Node version from `.nvmrc` for the runtime user:

```bash
sudo -iu cleo bash -lc \
  'source "$HOME/.nvm/nvm.sh" && nvm install 24.15.0 && nvm alias default 24.15.0'
```

Do not manually start the bot before the first release creates `current`.

## Production credentials and environment placement

### Discord Developer Portal

Use the production Cleo application.

- **General Information → Application ID** supplies `DISCORD_APPLICATION_ID` and normally `DISCORD_CLIENT_ID`.
- **Bot → Token** supplies `DISCORD_BOT_TOKEN`.
- **Bot → Privileged Gateway Intents** must enable **Server Members Intent**.
- Guild installation scopes must include `bot` and `applications.commands`.
- User installation must permit `applications.commands` for supported user/DM commands.

The reviewed v3 permission bitfield is:

```text
309237894150
```

It covers View Channels, Send Messages, Embed Links, Attach Files, Read Message
History, configured role mentions, public threads, thread messaging, kicks, and
bans. Convex may override it only with a deliberate valid decimal value.

### VPS: `/etc/cleo/discord-bot.env`

Edit with:

```bash
sudoedit /etc/cleo/discord-bot.env
```

Required values:

```dotenv
NODE_ENV=production
CONVEX_URL=https://your-production-deployment.convex.cloud
DISCORD_BOT_CONVEX_SECRET=replace-with-a-long-random-shared-secret
DISCORD_BOT_TOKEN=replace-with-the-production-discord-bot-token
DISCORD_APPLICATION_ID=replace-with-the-discord-application-id
DISCORD_BOT_RUNTIME_MODE=single
DISCORD_BOT_SHARD_COUNT=auto
DISCORD_CLIENT_ID=replace-with-the-discord-application-id
```

Generate the bot-to-Convex secret once:

```bash
openssl rand -hex 32
```

Put the same value in VPS and Convex production
`DISCORD_BOT_CONVEX_SECRET`. `DISCORD_TEST_GUILD_ID` is development-only and must
not be present in production.

Validate without printing values:

```bash
sudo -u cleo /usr/local/libexec/cleo/check-discord-env \
  /etc/cleo/discord-bot.env
```

### GitHub environment: `discord-production`

Set environment secret:

| Secret | Purpose |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | Production Convex key with deployment permission. |

Restrict the environment deployment branch to `main`.

Set repository Actions variable `CLEO_DISCORD_DEPLOY_ENABLED=false` or leave it
unset during bootstrap and workflow changes. Manual `validate` and `rollback`
remain available while the gate is off. Automatic pushes and manual `deploy`
require the value to be exactly `true`.

### Convex production environment

Set these on the production deployment:

| Variable | Source / requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk production Convex integration URL |
| `CLERK_SECRET_KEY` | Clerk production API secret |
| `CLERK_WEBHOOK_SECRET` | Production Clerk webhook signing secret |
| `DISCORD_BOT_CONVEX_SECRET` | Same value as VPS |
| `DISCORD_BOT_TOKEN` | Same production bot token as VPS |
| `DISCORD_APPLICATION_ID` | Discord application ID |
| `DISCORD_CLIENT_ID` | Normally the same application ID |
| `DISCORD_BOT_PERMISSIONS` | `309237894150` unless deliberately overridden |
| `DISCORD_INSTALL_REDIRECT_URI` | Optional approved HTTPS redirect |

The production Convex `.convex.cloud` URL is used by VPS `CONVEX_URL` and Vercel
`NEXT_PUBLIC_CONVEX_URL`. The `.convex.site` URL is used for the Clerk webhook at:

```text
https://<production-deployment>.convex.site/clerk-users-webhook
```

Subscribe the Clerk webhook to `user.created`, `user.updated`, and `user.deleted`.

### Vercel Production: `apps/dashboard`

Set:

```dotenv
NEXT_PUBLIC_CONVEX_URL=https://your-production-deployment.convex.cloud
NEXT_PUBLIC_APP_URL=https://cleoai.cloud
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-production-publishable-key
CLERK_SECRET_KEY=your-production-secret-key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

Trigger a new Vercel Production deployment after changing build-time values.

## Safe first-production activation

1. Keep `CLEO_DISCORD_DEPLOY_ENABLED=false`.
2. Merge the reviewed workflow revision to `main`.
3. Keep the recovered self-hosted runner disabled until the merge is complete.
4. Pull the new `main` into `/opt/cleo-source`.
5. Re-run `bootstrap-host.sh` only when host templates or helpers changed.
6. Enable and start the GitHub runner service.
7. Dispatch **Discord Production Runner Smoke** from `main` and require it to pass.
8. Dispatch **Deploy Discord Production** with `operation=validate`.
9. Confirm `Validate and package Discord bot` runs on GitHub-hosted Linux x64 and no job is assigned to `cleo-prod`.
10. Set repository variable `CLEO_DISCORD_DEPLOY_ENABLED=true`.
11. Dispatch **Deploy Discord Production** with `operation=deploy`.
12. Confirm hosted validation/package and Convex deployment pass before the lightweight VPS activation begins.
13. Complete the JCN-118 production acceptance matrix.
14. Prove a second harmless deployment and rollback before closing the release epic.

## Operations

### Runner smoke

The smoke workflow verifies identity, toolchain, runtime Node, groups, directories,
systemd units, environment validity, helper ownership, sudo rules, and a harmless
release-directory write. It performs no dependency installation.

### Validate

Manual `operation=validate` runs only the GitHub-hosted Linux x64 validation and package
job. It uploads a seven-day release artifact but does not deploy Convex or touch the
VPS.

### Deploy

Manual `operation=deploy`, or a relevant trusted `main` push while the deployment
gate is enabled, validates and packages on hosted Linux x64, deploys Convex, then sends
the prepared artifact to `cleo-prod` for activation. The VPS does not install
packages.

### Rollback

Manual `operation=rollback` runs only on `cleo-prod`. It switches to the recorded
previous SHA, restarts and verifies the service, reapplies command state when
required, and updates deployment state. Convex is not rolled back automatically.
