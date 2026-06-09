# Coverage Baseline

JCN-95 establishes measured per-workspace coverage floors for the current Node test runner and c8 harness. These floors are intentionally below the measured baseline by about one to two percentage points where coverage is not already perfect, leaving tolerance for source-map and Node patch-version differences without weakening the existing tests.

| Workspace | Baseline lines | Baseline statements | Baseline functions | Baseline branches | Enforced lines | Enforced statements | Enforced functions | Enforced branches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `apps/dashboard` | 85.28 | 85.28 | 92.30 | 75.00 | 84 | 84 | 91 | 74 |
| `apps/discord-bot` | 50.85 | 50.85 | 53.44 | 85.71 | 49 | 49 | 52 | 84 |
| `packages/backend` | 11.09 | 11.09 | 33.33 | 47.88 | 10 | 10 | 32 | 46 |
| `packages/env` | 99.11 | 99.11 | 50.00 | 80.00 | 98 | 98 | 49 | 79 |
| `packages/logger` | 96.93 | 96.93 | 100.00 | 85.71 | 95 | 95 | 99 | 84 |
| `packages/shared` | 100.00 | 100.00 | 100.00 | 100.00 | 99 | 99 | 99 | 99 |
| `packages/ui` | 100.00 | 100.00 | 100.00 | 100.00 | 99 | 99 | 99 | 99 |

Raise thresholds only after meaningful tests or scoped coverage changes increase the measured baseline. Re-run `pnpm test:coverage`, update the matching workspace script, and update this table in the same change.

GitHub Code Quality upload requires GitHub Team or GitHub Enterprise Cloud, Code Quality enabled for the repository, and `actions/upload-code-coverage@v1` running with `code-quality: write`. If upload fails because Code Quality is unavailable or disabled, the external blocker is repository-side GitHub Code Quality availability/configuration rather than this workflow. Local GitHub Actions schema extensions may flag `code-quality` until they update for the public preview permission, but GitHub's workflow syntax docs list it as valid.
