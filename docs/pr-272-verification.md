# PR 272 repair evidence

Work stays on `fix/dashboard-navigation-premium-guild` against `main`. The audited remote head was `fc0e5ca9016dc1ea2f28c63507cac91f40305186`, with base `45cd3fda0859e3fa39cb9125f1dd555c9bb1a0b9`. It contained eight unsigned original dashboard commits and two later dependency commits already marked Verified by GitHub.

## Root causes and changes

- Noble was upgraded from 1.8 to 2.4 without migrating its export paths. `moderationRuntime.ts` now imports the real `sha2.js` and `utils.js` exports. Runtime hashing stays bundled.
- The root-route test compared an optional number with zero. Its assertion now handles the absent section explicitly. The billing notice also waits for the query to resolve.
- Dashboard hydration depended on the progress object it changed. Pending/complete updates aborted and restarted requests. Stable session/identity inputs now own the attempt, with bounded expiry and explicit retry. A regression fails against the original implementation with two account requests instead of one, and passes after the fix.
- A fresh authorization list doubled as the visible server directory. Its intentional fail-closed behavior removed entries during refresh. A separate directory returns only same-account, last-known display metadata with explicit verification state. Protected lists, configuration queries and mutations retain fresh authorization requirements. Revocations and bot removal remove directory entries. An absent guild deep link does not silently select another server.
- Linked Roles started a separate OAuth grant on every verification visit. The preferred path now reauthorizes the existing Clerk Discord account only after an explicit consent click. The backend retrieves refreshed tokens through Clerk, checks the exact current Clerk Discord identity, and validates Discord's application ID, identity, granted scopes and expiry. Clerk tokens are not stored in Convex. Metadata publication retains revision/lease fences and deduplication. Existing valid direct grants remain usable; explicit application-mismatch fallback retains encrypted tokens and single-use state. Automatic role assignment remains disabled.
- Twitch's management projection can fail when Discord verification expires. Its retry action now requests guild verification rather than retrying only the inaccessible provider projection. Existing backend tests exercise subscription reconciliation, `stream.online`, owner changes, destination permissions, deduplication, bounded preflight retry and ambiguous-send protection. Read-only production inspection on 26 October found one enabled configuration, `streamOnline:ready`, no subscription failures, and the latest 30 event/delivery records processed/sent without recorded failures. The latest delivery was created at 12:36:49 UTC. These are backend delivery receipts, not observation of a newly triggered Discord message. A read with the local bot credential returned 403 and cannot establish production channel permissions.
- Premium has a dedicated sidebar entry and route. Settings retains a direct move link without Server Access or billing controls. Premium shows actual guild entitlement state, deadlines, capabilities and purchase eligibility. Purchaser billing and existing subscription preferences stay at `/account/billing`. Announcement, supporter visibility and community publication consent remain independent. Checkout remains test-only.
- The new native app uses Expo SDK 58, supported Router/Clerk/Convex integrations, SecureStore session persistence, a native directory, loading/error/empty states and pull-to-refresh. Expo Liquid Glass and SF Symbols provide native iOS controls, with runtime and Reduce Transparency fallbacks. It contains no WebView dashboard or write/configuration screens.
- Windows startup preparation replaced thousands of unchanged asset files under file watchers. It now compares source bytes, reuses matching output, and retries transient filesystem rename failures. Two successive dashboard asset preparations passed. The reported local Twitch lock belonged to exited PID 31180; the unchanged stale lock was removed after rechecking process ownership. Grant credentials and rotation recovery files were preserved.
- Upgraded `convex-test` gives transactions a monotonic clock. Clock-sensitive fixtures now compare domain timestamps and transaction timing rather than assuming frozen wall time equals transaction time. Production timeouts and coverage thresholds are unchanged.
- The canvas dependency bump changed Linux pixels through [gradient dithering and text rasterization changes in 1.0.12](https://github.com/Brooooooklyn/canvas/releases/tag/v1.0.12). The retained 1.0.13 renderer is now pinned exactly. All 20 decoded output hashes were checked against the Linux log, and the previous artifact matched every old baseline hash. Visual inspection covered every preset and overflow layout, emoji and Cyrillic text. The mean absolute channel change across all 20 images was 0.661 out of 255. The baseline records these reviewed outputs; pixel, font-isolation, manifest, fitting and emoji assertions remain enabled. Evidence: [previous successful main rendering](https://github.com/jcodog/Cleo/actions/runs/40221388829), [new renderer PNG artifact](https://github.com/jcodog/Cleo/actions/runs/40338655436/artifacts/12657339030).

## Local verification

Passed:

- Root `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:coverage`, and `bun run build`.
- 1,055 workspace tests: backend 385, dashboard 101, Discord bot 317, Twitch bot 124, shared 88, mobile 4, plus environment/logger/UI/landing tests. Existing 100% coverage gates passed.
- Two asset preparation regression tests, plus repeat preparation against the actual dashboard output.
- 40 Chromium dashboard/Twitch/community/navigation tests, including 375px and 1440px layouts and history navigation.
- 12 Chromium/Firefox welcome/live-notification display tests.
- CI contract/PWA contract tests using the installed Git Bash on Windows.
- Expo version compatibility, native typecheck and iOS/Android Hermes export with Liquid Glass and Symbols installed.

The Linux-only bot release packaging verification must run in GitHub Actions. Local builds cover both bots, but Windows is not a substitute for the pinned Linux release environment. GitHub required-check results belong to the final pushed commit, not this local record.

## Reviews and remaining operator work

CodeRabbit's original undefined-comparison and premature-billing-notice findings are fixed and tested. Review threads may be resolved only after commit-specific evidence is posted.

Cubic cloud review is unavailable because the monthly allowance was exceeded, 44,404 reviewed lines against a 40,000-line allowance. The authenticated CLI is also unavailable because its subscription is expired. Neither is a completed independent review.

The Clerk Discord OAuth client must be the application that owns Cleo's Linked Roles metadata for the preferred path. Existing users may need one consent for `role_connections.write`. An application mismatch is rejected with an explicit fallback choice, not treated as working Clerk authorization. Confirm provider configuration in a development environment before production rollout.

The operator builds the iPhone-device IPA remotely in Codemagic, then signs and installs it on Windows through Sideloadly with a free Apple ID. At the operator's request, no remote IPA build or artifact verification is performed here. The native app includes Expo Dev Client for Metro and Fast Refresh. JavaScript export passed locally; no physical device test was performed. An EAS project, paid Apple membership and App Store Connect are not required for this installation workflow. See [mobile setup and installation](../apps/mobile/README.md).

Production notification observation and physical mobile verification remain operator checkpoints. This work does not merge the PR, deploy production, change production variables, enable live Stripe charging or unlock moderation.
