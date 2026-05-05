# AGENTS.md

## Project

This is the Cleo monorepo by JCoNet LTD.

Cleo is an AI assistant platform for web, Discord, Kick, automation, moderation, billing, account management, and real-time tools.

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
- Treat Discord, Kick, Twitch, and GitHub as linked accounts.
- Keep shared logic in packages.
- Keep app-specific code inside apps.
- Keep changes small and focused.
- Prefer explicit types over clever inference.
- Do not add route aliases unless necessary.
- Do not create fake data fallbacks that can mislead users.
- Do not port legacy dashboard UI blindly.
- Do not redesign major dashboard pages until the backend and auth foundations are stable.

## Apps

- `apps/web`: dashboard, marketing, auth, billing, account management
- `apps/discord-bot`: Discord bot and assistant features
- `apps/kick-bot`: Kick bot and webhook handling
- `apps/ws-relay`: real-time relay

## Packages

- `packages/backend`: Convex backend
- `packages/ui`: shared shadcn UI
- `packages/shared`: shared constants, schemas, and types
- `packages/env`: typed env helpers
- `packages/logger`: shared logging

## Before finishing work

Run the relevant local checks when they exist:

```bash
bun run lint
bun run typecheck
bun run build
```

Report:

- What changed
- What was tested
- Any follow-up work
