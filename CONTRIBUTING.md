# Contributing to Cleo

Thanks for helping improve Cleo.

## Product boundaries

Cleo does not contain stats tracking.

Do not add ranked stats, stat sessions, game logging, stat cards, BO6/BO7 analytics, stats dashboards, stats commands, or stats AI tools.

Stats are a separate product/project called [CoD Stats](https://codstats.tech) with the following [repo](https://github.com/jcodog/CoD-Stats-Tracker).

## Architecture rules

- Use the pinned pnpm version from `package.json`.
- Use pnpm scripts for repo commands: `pnpm run <script>` or `pnpm --filter <workspace> run <script>`.
- Use `pnpm exec <command>` for locally installed CLIs, and `pnpm dlx <package>` only for one-off CLIs that are not installed.
- Do not use `bun`, `bunx`, `npm`, `npx`, or `yarn` for scripts, validation, codegen, package installs, or local CLIs.
- Use Convex for backend data and business logic.
- Do not add Prisma.
- Use Clerk as the primary auth identity.
- Treat Discord as the primary Clerk auth identity.
- Treat Twitch and Kick as secondary linked accounts.
- Do not add Next API routes or server actions for backend logic.
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
feat(auth): add Clerk dashboard auth
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
pnpm --filter <workspace> run lint
pnpm --filter <workspace> run typecheck
pnpm --filter <workspace> run build
```

## Friday dependency updates

Keep routine dependency updates current without accepting unsupported release toolchains:

1. Run `pnpm update --latest --recursive`.
2. Run the repository supply-chain policy checks.
3. Run `pnpm check:peers`.
4. Correct unsupported toolchain majors or remove obsolete peer blockers. Do not suppress unsupported peers.
5. Keep compiler changes on the official TypeScript release pinned in the workspace catalog. Do not add preview or duplicate compiler packages.
6. Run the affected workspace typecheck, lint, tests, coverage, and build commands.
7. Accept the lockfile only after peer compatibility and validation pass.
