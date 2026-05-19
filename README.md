# Cleo Monorepo

Cleo is JCoNet LTD's AI assistant platform for Discord, Kick, dashboard, automation, moderation, user protection, account management, billing, and real-time tools.

## Product boundary

Stats tracking is not part of this repository.

Do not add ranked stats, stat sessions, game logging, stat cards, BO6/BO7 analytics, stats dashboards, stats bot commands, or stats AI tools to Cleo. Stats are a separate product/project.

## Apps

- `apps/dashboard`  
  Canonical Cleo dashboard app for auth, account settings, linked accounts, and management UI.

- `apps/web`  
  May be added later for a non-dashboard web app.

- `apps/discord-bot`  
  Cleo Discord bot, AI assistant features, moderation, automation, server management, and user protection.

- `apps/kick-bot`  
  Cleo Kick bot, webhook handling, chat automation, and creator/live tooling where relevant.

- `apps/ws-relay`  
  Real-time relay service for overlays and live features.

## Packages

- `packages/backend`  
  Convex backend and source of truth.

- `packages/ui`  
  Shared shadcn UI components.

- `packages/shared`  
  Shared constants, types, schemas, and helpers.

- `packages/env`  
  Typed environment configuration.

- `packages/logger`  
  Shared logging utilities.

## Core stack

- pnpm
- Turborepo
- Next.js
- shadcn/ui
- Tailwind CSS
- Convex
- Clerk
- TypeScript

## Rules

- Use the pinned pnpm version from `package.json`.
- Use pnpm scripts for repo commands: `pnpm run <script>` or `pnpm --filter <workspace> run <script>`.
- Use `pnpm exec <command>` for locally installed CLIs, and `pnpm dlx <package>` only for one-off CLIs that are not installed.
- Do not use `bun`, `bunx`, `npm`, `npx`, or `yarn` for scripts, validation, codegen, package installs, or local CLIs.
- Do not introduce Prisma.
- Use Convex for backend data and business logic.
- Use Clerk as the primary auth provider.
- Treat Discord as the primary Clerk auth identity.
- Treat Twitch and Kick as secondary linked accounts.
- Do not add Prisma, Next API routes, or server actions for backend logic.
- Keep app UI dark-first, clean, and consistent with the Cleo design system.
- Do not add stats support to Cleo.

## Development

Install dependencies:

```bash
pnpm install
```

Run development:

```bash
pnpm run dev
```

Run checks:

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
```

## License

Copyright (c) 2026 JCoNet LTD. All rights reserved.
