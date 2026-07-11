# Discord production deployment

GitHub Actions deploys the Discord bot only from trusted pushes to `main` or a
manual dispatch. Pull requests never run on the production runner. Vercel's Git
integration remains responsible for dashboard deployment.

## Required VPS state

The dedicated runner is `cleo-prod-london-01` with the labels `self-hosted`,
`linux`, `x64`, and `cleo-prod`. Run it under the existing least-privileged
`github-runner` account with Node `24.15.0`, the pnpm version pinned in
`package.json`, and user systemd available.

Create these account-owned paths:

```text
/opt/cleo/discord/
├── current -> releases/<sha>
├── releases/
└── shared/
    ├── .env.production
    └── deployment-state.env
```

`shared/.env.production` must be mode `0600` and contain the Discord and Convex
runtime values used by `apps/discord-bot`. Do not put production secrets in the
runner checkout or GitHub repository.

Install this user service as
`/home/github-runner/.config/systemd/user/cleo-discord.service`:

```ini
[Unit]
Description=Cleo Discord bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/cleo/discord/current
EnvironmentFile=/opt/cleo/discord/shared/.env.production
ExecStart=/usr/bin/env node node_modules/tsx/dist/cli.mjs src/index.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Enable lingering and the service once during VPS setup:

```bash
loginctl enable-linger github-runner
systemctl --user daemon-reload
systemctl --user enable cleo-discord.service
```

Before the first production merge, dispatch **Discord Production Runner Smoke**
from `main`. It verifies the runner identity, release toolchain, filesystem and
environment-file metadata, user-systemd access, and a harmless temporary
write-delete without deploying or reading secret values.

## Release and rollback

The `discord-production` GitHub environment stores the production
`CONVEX_DEPLOY_KEY` and permits deployments only from `main`. The workflow
uses immutable action SHAs. A GitHub-hosted classifier runs for every `main`
push, while only relevant Discord dependency changes schedule the production
runner. The workflow validates the exact commit before touching production,
deploys the Convex backend, stages a standalone pnpm package into
`releases/<sha>`, atomically switches the `current` symlink, restarts the user
service, and requires it to remain active for 30 seconds. The deployment script
holds an exclusive lock, cleans retry symlinks, and restores the previous
release if restart or health verification fails. Deployment state records the
application SHA, previous SHA, and command-registration SHA. Manual rollback
does not redeploy the Convex backend.

Command registration runs only when command definitions, the registry, command
metadata, or registration tooling changed since the recorded command SHA.

For rollback, dispatch **Deploy Discord Production** with `operation=rollback`.
The script switches to the recorded previous release, restores its command
registration when needed, restarts the service, verifies health, and swaps the
application/previous SHAs so the operation is reversible.
