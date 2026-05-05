# Contributing to Cleo

Thanks for helping improve Cleo.

## Product boundaries

Cleo does not contain stats tracking.

Do not add ranked stats, stat sessions, game logging, stat cards, BO6/BO7 analytics, stats dashboards, stats commands, or stats AI tools.

Stats are a separate product/project.

## Architecture rules

- Use Convex for backend data and business logic.
- Do not add Prisma.
- Use WorkOS as the primary auth identity.
- Treat Discord, Kick, Twitch, and GitHub as linked accounts.
- Keep shared logic in packages, not duplicated inside apps.
- Keep UI consistent with the Cleo design system.
- Prefer small, focused changes.

## Branch names

Use:

```txt
feat/name
fix/name
chore/name
docs/name
refactor/name
```

## Commit messages

Use:

```txt
type(scope): imperative summary
```

Examples:

```txt
feat(auth): add WorkOS callback shell
fix(discord): handle missing guild config
chore(repo): add GitHub health files
```

Include a body when the change is not obvious.

## Pull requests

Every PR should include:

- What changed
- Why it changed
- What was tested
- Any follow-up work

Before opening a PR, run the relevant checks when they exist:

```bash
bun run lint
bun run typecheck
bun run build
```
