# CI maintenance

Regression Tests and Coverage runs four independent Ubuntu 24.04 jobs:

| Job                  | Responsibility                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code quality         | Zero-warning lint, workspace types, CI contracts and operations tests                                                                                  |
| Web verification     | Landing/dashboard builds, PWA build/runtime tests, Chromium/Firefox Welcome and Live Notifications checks                                              |
| Tests and coverage   | All workspace tests once under existing coverage thresholds, report validation and HTML/Cobertura artifacts                                            |
| Release verification | Linux Discord/Twitch builds, immutable packaging, checksums, contents, command parity, native canvas, fonts and Welcome PNGs, negative packaging tests |

The fifth job retains `Tests, lint, typecheck, and coverage`. It has no checkout
or dependency installation. Its `always()` condition lets it inspect failures,
skips and cancellations. It succeeds only when all four results are `success`.
Run `bun run test:ci` to exercise the actual gate shell with each failure state
and validate workflow/publishing contracts.

## Trust and publication

Each substantive job checks out the exact PR head or event SHA without persisted
credentials, reads Bun from `packageManager`, reads Node from `.nvmrc`, and runs
`bun ci` once. Actions remain pinned to commit SHAs. Regression has only
`contents: read`, no protected environment and no production secrets.

Superseded runs of the same PR share a concurrency group and may cancel each
other. Different PRs have different groups. Push and manual-dispatch groups use
the event name and unique run ID, including repeated dispatches of the same SHA.
They do not coalesce pending main runs or cancel each other. Runner availability
still controls queuing, and manual cancellation, timeouts or failures can prevent
completion. No dependency/build/browser cache is restored from other runs.

`Publish Coverage` is unchanged. Its separate `workflow_run` publisher requires
a successful push/manual run from this repository's main regression workflow.
It downloads `html-coverage-reports` from the exact source run with digest
mismatches rejected, executes no source-run code, and deploys through the
protected `github-pages` environment. Pages failures cannot change regression's
conclusion. Its existing publishing concurrency and minimal permissions remain.
Independent main runs can finish out of order. The publisher handles successful
runs in completion order; this change does not add source-SHA ordering to Pages.

Production workflows remain unchanged, including exact revisions, protected
environments, deployment gates, self-hosted activation and rollback. They retain
their own validation because they are independent production trust boundaries.
Discord's extra frozen runtime-only install is necessary for portable releases;
it does not reuse the development dependency layout.

## Baseline and runner tradeoffs

Successful runs observed before restructuring on 14 October 2026:

| Source run                                                                                        | Workflow elapsed | Regression runner elapsed |
| ------------------------------------------------------------------------------------------------- | ---------------: | ------------------------: |
| [main before hotfix](https://github.com/jcodog/Cleo/actions/runs/38602539256)                     |      257 seconds |               253 seconds |
| [main after dependency/validator hotfix](https://github.com/jcodog/Cleo/actions/runs/38604950263) |      184 seconds |               181 seconds |
| [latest earlier PR](https://github.com/jcodog/Cleo/actions/runs/38597657259)                      |      249 seconds |               246 seconds |

The first main baseline spent 19 seconds on operations tests, 7 each on types
and lint, 28 on web/PWA builds, 50 installing browsers, 18 on browser checks,
2 on PWA runtime tests, 47 on coverage and 30 on bot packaging. Setup/install
took 30 seconds. The previous workflow had one job and 22 named steps.

The new split repeats setup/install across four runners to isolate responsibilities.
It should shorten the critical path while increasing total runner seconds and
possibly rounded billable minutes. Browser installation stays in one job and
coverage runs tests once. Compare observed jobs, not just wall time, before
adding more parallelism. No new paid service or remote cache is introduced.

The [first split run](https://github.com/jcodog/Cleo/actions/runs/38609462817)
at `771ecb09b0e0e8424018c849183be045328a8534` passed all five jobs in
137 seconds and used 332 runner-seconds. Job elapsed times were 50 seconds for
quality, 92 for web, 128 for coverage, 59 for releases and 3 for the gate.
Compared with the post-hotfix main baseline, this reduced elapsed time by
47 seconds and increased runner time by 151 seconds. These are observed runs,
not a controlled benchmark. The added runners are a real cost of failure isolation.

Baseline compressed artifacts were 44.6 KiB Cobertura, 467.7 KiB HTML,
1.04 MiB browser evidence and 3.08 MiB rendering evidence, retained for 90 days.
Coverage now retains 14 days and diagnostic/rendering artifacts 7 days. Release
evidence includes logs, inventories, checksums and manifests without uploading
another copy of the large archives.

## Repository settings and issue context

GitHub returned no main branch protection and no repository rulesets during the
inspection. No required-check migration is needed because the original check
name is retained. To implement JCN-206, require that aggregate check in a main
ruleset through a separately approved repository-settings change.

Linear tools were unavailable in this session. GitHub mirrors supplied context:
[JCN-93](https://github.com/jcodog/Cleo/issues/69),
[JCN-95](https://github.com/jcodog/Cleo/issues/71),
[JCN-196](https://github.com/jcodog/Cleo/issues/175) and
[JCN-206](https://github.com/jcodog/Cleo/issues/193). No active issue titled for
CI simplification was found, and no duplicate issue was created. Mobile remains
shelved under [JCN-234](https://github.com/jcodog/Cleo/issues/249).

## Verification

Local checks include actionlint 1.7.12, YAML contract parsing, changed-file
Prettier checks, Bash syntax, gate outcomes, trusted publisher guards, report
validation and the unchanged strict workspace coverage suite. Final root builds
passed with the public compile-only workflow fixtures. Windows cannot
prove Linux POSIX permission or native release packaging behavior. The normal
browser harness also hit a Windows asset rename lock, so local Chromium/Firefox
tests used a disposable config that reused existing assets. Hosted validation
must run the unmodified Linux operations, packaging, browser and PWA checks.
The first split run executed those checks successfully and uploaded browser,
rendering, release, HTML and Cobertura evidence. Review remediation adds
concurrency-isolation fixtures, a real stalled-response readiness test,
coverage-site preservation checks, and native Welcome heading/region assertions.

Readiness uses a two-second curl transfer deadline with up to 30 attempts and
one-second retry delays, bounding that phase to roughly 90 seconds. Server
diagnostics remain available on readiness/test failure, and the EXIT trap
releases the background server. `bun run test:ci` exercises a response that
stalls until curl times out, then verifies that the next request succeeds.
Coverage HTML metadata records the exact checkout SHA. On PR runs this is the
PR head, rather than GitHub's temporary merge SHA.
