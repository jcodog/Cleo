# Contributing to Cleo

Thanks for helping improve Cleo.

## Product boundaries

Cleo does not contain stats tracking.

Do not add ranked stats, stat sessions, game logging, stat cards, BO6/BO7 analytics, stats dashboards, stats commands, or stats AI tools.

Stats are a separate product/project called [CoD Stats](https://codstats.tech) with the following [repo](https://github.com/jcodog/CoD-Stats-Tracker).

## Architecture rules

- Use the pinned Bun version from `package.json`.
- Use package scripts for repo commands: `bun run <script>` or `bun run --filter <workspace> <script>`.
- Use `bunx --no-install <command>` for locally installed CLIs, and plain `bunx <package>` only for deliberate one-off tools.
- Do not use another package manager for scripts, validation, codegen, package installs, or local CLIs.
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
bun run --filter <workspace> lint
bun run --filter <workspace> typecheck
bun run --filter <workspace> build
```

## Licensing

Cleo is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`).

By submitting a contribution to this repository, you agree that your contribution may be distributed as part of Cleo under that licence.

See [LICENSE](LICENSE) for the full licence terms.

## Friday dependency updates

Keep routine dependency updates current without accepting unsupported release toolchains:

1. Run `bun update --interactive --recursive` and select only the intended updates.
2. Update shared catalog ranges in the root `package.json`; update workspace-only ranges in that workspace's manifest.
3. Run `bun install` and review both manifest and `bun.lock` changes.
4. Run the repository supply-chain policy checks and review Bun's peer warnings. Do not suppress unsupported peers.
5. Keep compiler changes on the official TypeScript release pinned in the workspace catalog. Do not add preview or duplicate compiler packages.
6. Run the affected workspace typecheck, lint, tests, coverage, and build commands.
7. Accept `bun.lock` only after compatibility and validation pass.

On Windows, an optional machine-local cache can be configured with the user-level `BUN_INSTALL_CACHE_DIR` environment variable. Do not add a developer-specific cache path to `bunfig.toml`.
