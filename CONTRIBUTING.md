# Contributing to Cleo

Thanks for helping improve Cleo.

## Product boundaries

Cleo does not contain stats tracking.

Do not add ranked stats, stat sessions, game logging, stat cards, BO6/BO7 analytics, stats dashboards, stats commands, or stats AI tools.

Stats are a separate product/project called [CoD Stats](https://codstats.tech) with the following [repo](https://github.com/jcodog/CoD-Stats-Tracker).

## Architecture rules

- Use the pinned Bun version from `package.json`.
- Use package scripts for project commands.
- Prefer `bun run --filter <workspace> <script>` from the repository root, or `bun run <script>` from inside the target workspace, while working on a focused change.
- Root-wide scripts are supported when you intentionally need to operate across the monorepo and are strongly recommended for final pre-PR validation.
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

## Development commands

Cleo is a Bun/Turborepo monorepo. During normal development, validate and run the app or package you are actively changing rather than repeatedly running every workspace.

From the repository root:

```bash
bun run --filter @workspace/dashboard dev
bun run --filter @workspace/backend dev
bun run --filter @workspace/discord-bot dev
```

The same scripts may be run from inside a workspace with `bun run <script>`.

For focused validation, use the scripts exposed by the affected workspace. For example:

```bash
bun run --filter @workspace/dashboard typecheck
bun run --filter @workspace/dashboard lint
bun run --filter @workspace/dashboard test

bun run --filter @workspace/backend typecheck
bun run --filter @workspace/backend lint
bun run --filter @workspace/backend test
bun run --filter @workspace/backend test:coverage

bun run --filter @workspace/discord-bot typecheck
bun run --filter @workspace/discord-bot lint
bun run --filter @workspace/discord-bot test
bun run --filter @workspace/discord-bot test:coverage
```

Only run a script for a workspace that actually defines it.

If you intentionally need the complete development stack, the root development command is supported:

```bash
bun run dev
```

This starts the Turborepo development graph and may run multiple workspace processes. Prefer targeted development for focused work and root development when exercising integration across the monorepo.

Avoid starting duplicate long-running dev servers, watchers, bots, workers, or tunnels when an equivalent process is already running.

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

During implementation, targeted workspace validation is preferred.

Before opening or finalising a PR, strongly prefer the full repository validation suite from the repository root:

```bash
bun run typecheck
bun run lint
bun run test
bun run test:coverage
bun run build
```

These commands intentionally validate the workspace graph and catch integration regressions that targeted checks may miss.

If an environment prevents a full-root check from running, run every relevant workspace check instead and document exactly what was not run and why. Do not claim tests, coverage, linting, typechecking, or builds that did not actually execute.

## Commits and production troubleshooting

Use meaningful conventional commit subjects, for example
`fix(release): reject stale promotion attempts`, and GPG-sign commits with the
configured identity. Explain the problem, change and validation in the commit
body. Include an issue or release reference for production-troubleshooting work.
Normal main changes go through a pull request and the required regression checks.

Use workflow reruns or the documented manual dispatch controls to retry checks,
validate packages or perform authorised recovery. Never add placeholder files or
low-signal commits to trigger deployment. An empty commit is acceptable only when
an approved process requires a new revision that rerun/dispatch cannot provide;
record the reason, approval and issue/release reference, and retain normal signed
PR/check requirements. It is not a release-gate bypass.

See [release troubleshooting discipline](docs/production-release-gating.md#commit-and-troubleshooting-discipline).
Issue #193 remains partially addressed; its emergency administrator exception is
not implemented. The existing Protect main ruleset and zero bypass actors must
remain intact pending a separately approved policy decision.

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
7. Before finalising the dependency PR, run the full root validation suite.
8. Accept `bun.lock` only after compatibility and validation pass.

On Windows, an optional machine-local cache can be configured with the user-level `BUN_INSTALL_CACHE_DIR` environment variable. Do not add a developer-specific cache path to `bunfig.toml`.
