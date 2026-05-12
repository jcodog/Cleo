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

- Bun
- Turborepo
- Next.js
- shadcn/ui
- Tailwind CSS
- Convex
- Clerk
- TypeScript

## Rules

- Use Bun only.
- Do not introduce Prisma.
- Use Convex for backend data and business logic.
- Use Clerk as the primary auth provider.
- Treat Discord, Kick, Twitch, and GitHub as linked accounts.
- Keep app UI dark-first, clean, and consistent with the Cleo design system.
- Do not add stats support to Cleo.

## Development

Install dependencies:

```bash
bun install
```

Run development:

```bash
bun run dev
```

Run checks:

```bash
bun run lint
bun run typecheck
bun run build
```

## License

Copyright (c) 2026 JCoNet LTD. All rights reserved.
