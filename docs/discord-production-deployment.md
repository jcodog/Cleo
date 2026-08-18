# Discord production deployment

Cleo deploys the Discord runtime only from trusted `main` pushes or an explicit
manual workflow dispatch. Pull requests never activate production. Vercel owns the
dashboard deployment; the Discord production workflow validates the bot and backend,
packages the Discord runtime, deploys Convex when appropriate, and activates the
validated release on the production VPS.

## Architecture

The production VPS is an application host, not a CI build machine.

### Hosted Linux x64 validation and packaging

`Validate and package Discord bot` runs on GitHub-hosted `ubuntu-24.04` and:

1. checks out the exact commit;
2. installs the locked workspace with `bun ci`;
3. runs Discord and backend tests, typechecks, and lint;
4. builds the Discord Node ESM runtime exactly once;
5. packages the already-validated `dist` tree without rebuilding or mutating it;
6. installs only the Discord production dependency closure into a standalone,
   hoisted Bun staging layout;
7. validates native `@napi-rs/canvas` on Linux x64 GNU;
8. creates an immutable release manifest and deterministic tarball;
9. uploads the release tarball and SHA-256 checksum;
10. deploys Convex for a real deploy operation.

The packager fails if the compiled output is missing, if packaging changes the
validated `dist` tree, or if the packaged `dist` differs from the validated build.

### Production VPS activation

`Activate Discord release on production VPS` runs on `cleo-prod` and deliberately
does not check out the repository or set up Node, Bun, or another package manager.
It invokes root-owned host tooling installed by `ops/discord/bootstrap-host.sh`.

Activation performs:

- host contract, Node version, platform, systemd, permissions, and environment checks;
- release artifact download;
- checksum and safe archive path verification;
- manifest, exact commit SHA, Linux x64, Node version, entrypoint, and critical-file
  hash verification;
- staging under `/srv/cleo/discord-bot/releases/<sha>`;
- atomic `current` symlink activation;
- systemd restart and repeated liveness checks;
- global command registration only when the release command fingerprint changes;
- atomic deployment-state update;
- automatic restoration of the previous release when activation fails.

Rollback uses the same installed controller and does not depend on Git history or
source files.

## Deployment observability

The activation and rollback steps always write a GitHub Actions job summary before
returning their final status. The summary records:

- whether the operation succeeded;
- the attempted deployment SHA or rollback target;
- the SHA actually referenced by `current` after the attempt;
- the persisted application and previous SHAs;
- the persisted command fingerprint;
- the systemd service state.

This is intentional. A failed health check can successfully restore the previous
release, and a later green run must not hide which revision was actually left
running. The workflow step still fails when the controller fails; recording the
summary does not weaken the deployment gate.

## Host contract

The workflow, runner check, and deployment controller share host contract version
`4`. Activation verifies the installed controller contract before downloading an
artifact. A stale bootstrap installation therefore fails closed.

The expected host controller Node version is `24.15.0` and the release platform is
`linux-x64`.

| Purpose                   | Value                                                   |
| ------------------------- | ------------------------------------------------------- |
| Actions runner user       | `github-runner`                                         |
| Runtime user              | `cleo`                                                  |
| Writable deployment group | `cleo-deploy` (`github-runner` only)                    |
| Read-only runtime group   | `cleo-runtime`                                          |
| Runner label              | `cleo-prod`                                             |
| Deployment root           | `/srv/cleo/discord-bot`                                 |
| Releases                  | `/srv/cleo/discord-bot/releases/<sha>`                  |
| Active release            | `/srv/cleo/discord-bot/current`                         |
| Persistent state          | `/srv/cleo/discord-bot/shared/deployment-state.env`     |
| Runtime environment       | `/etc/cleo/discord-bot.env`                             |
| Runtime service           | `cleo-discord.service`                                  |
| Command service           | `cleo-discord-register-commands.service`                |
| Deployment controller     | `/usr/local/libexec/cleo/deploy-discord-release`        |
| Runner check              | `/usr/local/libexec/cleo/check-discord-runner`          |
| State reader              | `/usr/local/libexec/cleo/read-discord-deployment-state` |
| Controller Node           | `/usr/local/libexec/cleo/node`                          |

The state reader never evaluates the state file as shell code. It requires a regular
non-symlink file with the expected ownership and mode, accepts only the known state
keys, rejects duplicates and unknown keys, and validates SHA and fingerprint shapes.

## Release artifact contract

Every new release contains:

- `dist/index.js` and source map;
- `dist/scripts/registerCommands.js` and source map;
- the compiled artifact validator;
- production dependencies for Linux x64 GNU;
- `runtime-artifact.json`;
- `.cleo-release-sha`;
- `.cleo-release-platform`;
- `.nvmrc`;
- `release-manifest.json`.

The release manifest records the commit SHA, platform, architecture, required Node
version, artifact contract version, deterministic build timestamp, runtime and
command entrypoints, SHA-256 hashes of critical compiled files, and the command
registration fingerprint.

New releases contain neither source TypeScript nor `tsx`, and they do not contain
the workspace Bun lock or Bun configuration. Local development remains source-based;
this restriction applies only to immutable production release artifacts.

## Bootstrap and rollout for JCN-207

The artifact-only workflow depends on root-owned host tooling, so the deployment gate
must remain disabled while the new host contract is installed.

Use this sequence for the migration:

1. Set repository Actions variable `CLEO_DISCORD_DEPLOY_ENABLED=false`.
2. Merge the reviewed deployment change into `main` using the normal verified commit
   path.
3. Update the trusted administrative checkout used for host bootstrap.
4. Run `sudo bash ops/discord/bootstrap-host.sh`.
5. Restart the GitHub Actions runner service if group membership changed.
6. Dispatch **Discord Production Runner Smoke** from `main` and require success.
   The smoke workflow executes `check-discord-runtime` as `cleo`, using the same
   NVM runtime contract as `run-discord-release`, so a missing or stale runtime
   fails before deployment.
7. Dispatch **Deploy Discord Production** with `operation=validate` and require the
   hosted x64 validation/package job to pass.
8. Set `CLEO_DISCORD_DEPLOY_ENABLED=true`.
9. Dispatch **Deploy Discord Production** with `operation=deploy`.
10. Inspect the activation job summary and confirm the attempted SHA, running SHA,
    persisted application SHA, and active systemd service agree.
11. After a second manifest-based release exists, exercise `operation=rollback` and
    verify the rollback summary and command state.

Do not enable automatic deployment before bootstrap, smoke, and validation have all
passed.

Any later change to files installed by `bootstrap-host.sh`, including host scripts,
systemd units, sudoers policy, or the bootstrap script itself, requires the gate to
be disabled and bootstrap to be rerun before activation resumes.

## One-time VPS prerequisites

The `github-runner` and `cleo` users must already exist. The runtime user must have
the exact Node version from `.nvmrc` installed through NVM. For the current contract:

```bash
sudo -iu cleo bash -lc \
  'source "$HOME/.nvm/nvm.sh" && nvm install 24.15.0 && nvm alias default 24.15.0'
```

Bootstrap also downloads the pinned official Node Linux x64 archive over HTTPS and verifies its repository-pinned SHA-256 checksum before installing the root-owned controller runtime. This root-owned Node is intentionally separate from the Cleo application's NVM runtime. The checksum must be updated deliberately whenever `.nvmrc` changes.

Then run:

```bash
sudo bash ops/discord/bootstrap-host.sh
```

Bootstrap is idempotent and installs or verifies:

- writable `cleo-deploy` membership for `github-runner` only;
- read-only `cleo-runtime` membership for `github-runner` and `cleo`;
- `/srv/cleo/discord-bot/{releases,shared}`;
- `/etc/cleo/discord-bot.env` as `root:cleo` mode `0640`;
- root-owned environment and runtime validators;
- the root-owned deployment controller, state reader, runner check, and release
  launcher;
- a root-owned controller Node extracted from the pinned official Node release archive only after its SHA-256 checksum is verified;
- systemd runtime and command-registration services;
- the narrow deployment sudo policy.

The bot service is enabled but should not be manually started before a valid
`current` release exists.

Bootstrap migrates existing releases to `github-runner:cleo-runtime`, with
directories at mode `0750` and files at mode `0640`, and removes `cleo` from the
writable deployment group. If the bot is already active, bootstrap restarts it so
the running process immediately receives the read-only group set.

## Runtime environment

Edit the VPS environment with:

```bash
sudoedit /etc/cleo/discord-bot.env
```

Required values include:

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

Generate the bot-to-Convex shared secret once with `openssl rand -hex 32` and store
the same value in the VPS environment and Convex production. Do not place
`DISCORD_TEST_GUILD_ID` in production.

Validate the environment without printing secret values:

```bash
sudo -u cleo /usr/local/libexec/cleo/check-discord-env \
  /etc/cleo/discord-bot.env
```

## GitHub production environment

The `discord-production` environment requires `CONVEX_DEPLOY_KEY`. Restrict the
environment to `main`.

`CLEO_DISCORD_DEPLOY_ENABLED` controls automatic and manual deploy activation:

- unset or `false`: automatic deployment and manual `deploy` are blocked;
- `true`: relevant trusted `main` pushes and manual `deploy` may activate production;
- manual `validate` remains available while the gate is off;
- manual `rollback` remains available while the gate is off.

## Operations

### Runner smoke

The smoke workflow verifies the installed host contract, exact controller Node,
Linux x64 platform, systemd units, permissions, environment, root-owned helpers,
sudo rules, and a harmless release-directory write. It performs no checkout or
dependency installation.

### Validate

Manual `operation=validate` runs only hosted Linux x64 validation and packaging.
It uploads the release artifact for inspection but does not deploy Convex or touch
the VPS.

### Deploy

Manual `operation=deploy`, or a relevant trusted `main` push while the deployment
gate is enabled, validates and packages on hosted Linux x64, deploys Convex, and
then sends the validated artifact to `cleo-prod` for activation. The VPS does not
build or install packages.

### Rollback

Manual `operation=rollback` runs only on `cleo-prod`. It validates the recorded
previous release, switches the active symlink, restarts and health-checks the
service, reapplies command registration when its fingerprint differs, and atomically
updates deployment state. If rollback command registration fails, the controller
restores the release it started from and repairs command/state consistency. Convex
is not rolled back automatically.
