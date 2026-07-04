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
boundary. Re-run `pnpm test:coverage` and update this document whenever the
enforced policy changes.

JCN-115 adds these stable Discord support and guild-event release boundaries to
the enforced include sets:

- `apps/discord-bot/src/services/guildEventLogging.ts`
- `apps/discord-bot/src/services/supportTickets.ts`
- `packages/backend/convex/lib/supportTickets.ts`

The Convex support-ticket action/mutation and dashboard guild-support-config
mutation are not included yet. Their current tests exercise pure helpers or the
Discord service boundary, not the registered Convex handlers and database
effects. Add them when a mutation test harness provides meaningful branch and
persistence coverage; declaring them 100% covered through registration-time
imports would not enforce their release behavior.

GitHub Code Quality upload requires GitHub Team or GitHub Enterprise Cloud, Code Quality enabled for the repository, and `actions/upload-code-coverage@v1` running with `code-quality: write`. If upload fails because Code Quality is unavailable or disabled, the external blocker is repository-side GitHub Code Quality availability/configuration rather than this workflow. Local GitHub Actions schema extensions may flag `code-quality` until they update for the public preview permission, but GitHub's workflow syntax docs list it as valid.
