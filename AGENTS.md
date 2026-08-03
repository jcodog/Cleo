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

## Terminal rules

Development may already be running in WezTerm.

Before starting any dev server, watcher, tunnel, broad validation command, or log tail, inspect existing WezTerm panes first:

```bash
wezterm cli list --format json
```

If a Cleo dev pane is already running, read its recent output instead of starting another process:

```bash
wezterm cli get-text --pane-id <PANE_ID> --start-line -300
```

Do not start duplicate `bun run dev`, `turbo dev`, `next dev`, `convex dev`, workers, websocket, bot, or tunnel processes.

Use existing WezTerm output as the first source of truth for dev server errors, route errors, compile errors, runtime errors, and browser-triggered logs.

Do not use `wezterm cli send-text`, `spawn`, `split-pane`, `kill-pane`, or `activate-pane` unless Jason explicitly asks.

If the correct pane is unclear, ask Jason which pane ID to inspect.

## Package manager and command runner

- This repo uses the pinned Bun version from `package.json`.
- Use package scripts for project commands: `bun run <script>` from a workspace, or `bun run --filter <workspace> <script>` from the repo root.
- Use `bunx --no-install <command>` for locally installed CLIs such as Convex, Next.js, ESLint, Prettier, and shadcn.
- Use plain `bunx <package>` only when a one-off CLI is not already installed in the workspace.
- Do not use another package manager for repo scripts, validation, codegen, package installs, or local CLIs.
- Do not add or update dependencies with another package manager. Keep `bun.lock` as the only package-manager lockfile.

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

## Before finishing work

Do not run repo-root validation commands:

```bash
bun run lint
bun run typecheck
bun run build
turbo lint
turbo typecheck
turbo build
```

Run only targeted package/app checks from the relevant workspace when they exist:

- `packages/backend`
- `packages/shared`
- `packages/logger`
- `packages/env`
- `apps/dashboard`

Use Bun scripts for workspace commands. For example:

```bash
bun run --filter @workspace/dashboard lint
bun run --filter @workspace/dashboard typecheck
bun run --filter @workspace/backend typecheck
bun run --filter @workspace/backend codegen
```

Report:

- What changed
- What was tested
- Any follow-up work
