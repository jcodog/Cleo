# Coverage Policy

JCN-95 enforces complete coverage over an explicit, high-value include set in each
workspace rather than a low percentage over every source file. The include sets
are defined by each workspace's `test:coverage` script and expand as meaningful
regression tests are added.

| Workspace          | Enforced lines | Enforced statements | Enforced functions | Enforced branches |
| ------------------ | -------------: | ------------------: | -----------------: | ----------------: |
| `apps/dashboard`   |            100 |                 100 |                100 |               100 |
| `apps/discord-bot` |            100 |                 100 |                100 |               100 |
| `packages/backend` |            100 |                 100 |                100 |               100 |
| `packages/env`     |            100 |                 100 |                100 |                95 |
| `packages/logger`  |            100 |                 100 |                100 |               100 |
| `packages/shared`  |            100 |                 100 |                100 |               100 |
| `packages/ui`      |            100 |                 100 |                100 |               100 |

Do not lower these thresholds to absorb uncovered changes. Add focused tests and
expand the scoped include sets when a new module becomes a stable regression
boundary. Re-run `bun run test:coverage` and update this document whenever the
enforced policy changes.

The reliability hardening pass adds two backend security and transport
boundaries to the enforced include set:

- `packages/backend/convex/lib/auth.ts`
- `packages/backend/convex/lib/discordRestTransport.ts`

The authorization coverage exercises authenticated identity resolution, disabled
accounts, staff and admin role hierarchy, direct verified guild membership, and
linked Discord account fallback. The Discord transport coverage exercises bounded
response-driven rate-limit retries, malformed metadata, exhausted wait budgets,
HTTP denial and not-installed responses, successful JSON responses, and network
failure.

JCN-115 adds these stable Discord support and guild-event release boundaries to
the enforced include sets:

- `apps/discord-bot/src/services/guildEventLogging.ts`
- `apps/discord-bot/src/services/supportTickets.ts`
- `packages/backend/convex/lib/supportTickets.ts`
- `packages/backend/convex/actions/bot/discord/supportTickets/openOrResume.ts`
- `packages/backend/convex/mutations/bot/discord/supportTickets/openOrResume.ts`
- `packages/backend/convex/mutations/dashboard/discord/guildSupportConfigs/update.ts`

JCN-194 adds the compiled Discord production runtime and release artifact
contract to the enforced include set:

- `apps/discord-bot/src/runtime/startup.ts`
- `apps/discord-bot/src/deployment/validateReleaseArtifact.ts`

These tests enforce single-process and sharded startup dispatch, compiled worker
entrypoints without a production `tsx` hook, startup failure and shutdown
behavior, required compiled files and source maps, exact release metadata,
command-registration compatibility, native canvas packaging, and archive path
safety.

The root-owned Discord release launcher is covered by regression shell tests
that prove legacy-to-compiled activation and compiled-to-legacy rollback for
both the runtime and command-registration entrypoints.

The Convex handlers run through `convex-test` against its in-memory database.
The enforced tests cover authorization, insert/replace behavior, audit writes,
ticket persistence and resume behavior, linked requester resolution, transcript
policy, bot-left handling, unavailable guild routing, and the bot action secret.

Every regression run retains Cobertura XML and a complete browsable HTML artifact.
Trusted successful runs from `main` also publish the HTML reports to GitHub Pages
through JCN-196. Enable **Settings → Pages → Source: GitHub Actions** once for the
repository. The latest report is then available at:

`https://jcodog.github.io/Cleo/`

GitHub Code Quality coverage ingestion requires a plan and repository feature that
are not assumed by this public repository. Cobertura remains available for machine
consumers, while GitHub Pages provides the maintainer-facing report.
