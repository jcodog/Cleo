# AGENTS.md

## Project

This is the Cleo monorepo by JCoNet LTD.

Cleo is an AI assistant platform for dashboard, Discord, Kick, automation, moderation, billing, account management, and real-time tools.

## Hard product boundary

Stats tracking is not part of Cleo.

Do not add or port:

- Ranked stats
- Stat sessions
- Game logging
- Stat cards
- BO6/BO7 analytics
- Stats dashboards
- Stats bot commands
- Stats AI tools
- Stats migration scripts

Stats are a separate product/project.

## Stack

- Bun
- Turborepo
- TypeScript
- Next.js
- shadcn/ui
- Tailwind CSS
- Convex
- Clerk

## Design system

Use the Cleo shadcn settings:

```txt
Style: Nova
Base Color: Neutral
Theme: Cyan
Chart Color: Cyan
Heading Font: Outfit
Font: Geist
Icon Library: Tabler Icons
Radius: Default
Menu Color: Default
Menu Appearance: Translucent
Menu Accent: Subtle
```

General UI direction:

- Dark-first
- Neutral base
- Cyan primary actions
- Fuchsia and indigo ambient accents where appropriate
- Emerald for success and live states
- Amber for warnings
- Clean layouts over card spam
- Shared UI primitives over one-off local components

## Rules

- Do not add Prisma.
- Use Convex as the backend source of truth.
- Use Clerk as the primary auth provider.
- Treat Discord as the primary Clerk auth identity.
- Treat Twitch and Kick as secondary linked accounts.
- Do not use Next API routes or server actions for backend logic.
- Keep shared logic in packages.
- Keep app-specific code inside apps.
- Keep changes small and focused.
- Prefer explicit types over clever inference.
- Conserve tokens in reasoning, replies, and comments while preserving code quality.
- Do not add route aliases unless necessary.
- Do not create fake data fallbacks that can mislead users.
- Do not port legacy dashboard UI blindly.
- Do not redesign major dashboard pages until the backend and auth foundations are stable.
- Use relevant skills and MCPs selectively when they improve accuracy; do not invoke every available tool blindly.

## Package manager and command runner

- This repo uses the pinned Bun version from `package.json`.
- Use package scripts for project commands.
- From the repository root, use `bun run --filter <workspace> <script>` when working on one app or package.
- From inside a workspace, `bun run <script>` is equivalent and is also supported.
- Root scripts such as `bun run dev`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:coverage`, and `bun run build` are allowed when intentionally operating across the monorepo.
- Prefer workspace-targeted commands while iterating on a focused change. This keeps feedback fast and avoids running unrelated workspaces unnecessarily.
- Use root-wide commands when the work genuinely spans multiple workspaces, when cross-workspace behavior needs to be exercised, or during final pre-PR validation.
- Only run a workspace script when that workspace defines it.
- Use `bunx --no-install <command>` for locally installed CLIs such as Convex, Next.js, Oxlint, Prettier, and shadcn.
- Use plain `bunx <package>` only when a deliberate one-off CLI is not already installed in the workspace.
- Do not use another package manager for repo scripts, validation, codegen, package installs, or local CLIs.
- Do not add or update dependencies with another package manager. Keep `bun.lock` as the only package-manager lockfile.
- Do not start duplicate dev servers, watchers, workers, bots, tunnels, or other long-running processes when an equivalent process is already running.

### Common development commands

Prefer targeted commands for the surface being changed:

```bash
bun run --filter @workspace/dashboard dev
bun run --filter @workspace/dashboard typecheck
bun run --filter @workspace/dashboard lint
bun run --filter @workspace/dashboard test

bun run --filter @workspace/backend dev
bun run --filter @workspace/backend codegen
bun run --filter @workspace/backend typecheck
bun run --filter @workspace/backend lint
bun run --filter @workspace/backend test
bun run --filter @workspace/backend test:coverage

bun run --filter @workspace/discord-bot dev
bun run --filter @workspace/discord-bot typecheck
bun run --filter @workspace/discord-bot lint
bun run --filter @workspace/discord-bot test
bun run --filter @workspace/discord-bot test:coverage
```

When intentionally running the whole development stack from the repository root:

```bash
bun run dev
```

This uses the root Turborepo development script and may start multiple workspace development processes. Use it when that is actually useful rather than as the default for every focused change.

## Apps

- `apps/dashboard`: canonical dashboard, auth, account management, and future dashboard billing surfaces
- `apps/web`: may be added later for a non-dashboard web app
- `apps/discord-bot`: Discord bot and assistant features
- `apps/kick-bot`: Kick bot and webhook handling
- `apps/ws-relay`: real-time relay

## Packages

- `packages/backend`: Convex schema, functions, and server-side backend helpers
- `packages/shared`: Convex-safe and app-safe constants, schemas, and types
- `packages/logger`: shared typed logging and redaction helpers
- `packages/env`: typed server and client-safe env entrypoints
- `packages/ui`: shared shadcn UI primitives using Tabler Icons by default

## Validation and finishing work

During development, run the checks that cover the workspace or workspaces you changed. Do not repeatedly run the entire monorepo for a small isolated edit unless broad validation is useful.

Before opening or finalising a pull request, strongly prefer the full repository validation suite from the root:

```bash
bun run typecheck
bun run lint
bun run test
bun run test:coverage
bun run build
```

These root commands intentionally exercise the Turborepo workspace graph and are the best final check for cross-workspace regressions.

If a full-root command is impractical because of an environment limitation, run all relevant workspace checks instead and clearly report what was not run and why. Do not claim validation that did not actually execute.

Report:

- What changed
- What was tested
- Any follow-up work
