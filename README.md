# Cleo Monorepo

Cleo is JCoNet LTD's AI assistant platform for Discord-first account management, dashboard tooling, automation foundations, moderation foundations, billing surfaces, and real-time product infrastructure.

## Product boundary

Stats tracking is not part of this repository.

Do not add ranked stats, stat sessions, game logging, stat cards, BO6/BO7 analytics, stats dashboards, stats bot commands, stats AI tools, or stats migration scripts to Cleo. Stats are a separate product/project.

## Current apps

- `apps/dashboard`
  Canonical Next.js dashboard for Clerk auth, Discord-first account management, linked accounts, Discord server install flows, and Discord server workspace settings.

- `apps/discord-bot`
  Discord bot runtime for slash commands, typed event registration, Convex-backed guild synchronization, and runtime guild configuration reads.

## Planned app surfaces

These product areas are represented in shared constants and environment entrypoints but are not standalone app workspaces in this checkout yet:

- `apps/web`
  Future non-dashboard web app.

- `apps/kick-bot`
  Future Kick bot and webhook handling.

- `apps/ws-relay`
  Future real-time relay for overlays and live features.

## Packages

- `packages/backend`
  Convex schema, functions, dashboard and bot backend operations, validators, and server-side helpers.

- `packages/env`
  Typed server and client-safe environment entrypoints.

- `packages/logger`
  Shared structured logging and redaction helpers.

- `packages/shared`
  Convex-safe and app-safe constants, provider lists, schemas, and types.

- `packages/ui`
  Shared shadcn UI primitives and design-system components.

- `packages/eslint-config`
  Shared ESLint configuration.

- `packages/typescript-config`
  Shared TypeScript configuration.

## Core stack

- pnpm
- Turborepo
- TypeScript
- Next.js
- shadcn/ui
- Tailwind CSS
- Convex
- Clerk
- Discord.js

## Development rules

- Use the pinned pnpm version from `package.json`.
- Use pnpm scripts for repo commands: `pnpm run <script>` or `pnpm --filter <workspace> run <script>`.
- Use `pnpm exec <command>` for locally installed CLIs, and `pnpm dlx <package>` only for one-off CLIs that are not installed.
- Do not use `bun`, `bunx`, `npm`, `npx`, or `yarn` for scripts, validation, codegen, package installs, or local CLIs.
- Do not introduce Prisma.
- Use Convex for backend data and business logic.
- Use Clerk as the primary auth provider.
- Treat Discord as the primary Clerk auth identity.
- Treat Twitch and Kick as secondary linked accounts.
- Do not add Next API routes or server actions for backend logic.
- Keep shared logic in packages and app-specific code inside apps.
- Keep app UI dark-first, clean, and consistent with the Cleo design system.
- Do not add stats support to Cleo.

## Development

Install dependencies:

```bash
pnpm install
```

Run all development tasks through Turbo:

```bash
pnpm run dev
```

Run targeted workspace checks:

```bash
pnpm --filter <workspace> run lint
pnpm --filter <workspace> run typecheck
pnpm --filter <workspace> run test
```

Run Discord bot commands locally:

```bash
pnpm --filter @workspace/discord-bot run test
pnpm --filter @workspace/discord-bot run typecheck
pnpm --filter @workspace/discord-bot run lint
pnpm --filter @workspace/discord-bot run commands:register:guild
```

## Regression coverage

The regression workflow runs typecheck, lint, and tests under c8 coverage. Coverage floors are measured per participating workspace and documented in `.github/coverage-baseline.md`.

## License

Copyright (c) 2026 JCoNet LTD. All rights reserved.
