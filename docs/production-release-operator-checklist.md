# Coordinated production releases

No production deployment or configuration change is part of this repair. Keep the new coordinator disabled until an operator completes this checklist. Never dispatch a production operation just to test these changes.

## Incident evidence, 29 October 2026

- Protected `main` is `5a8788cd178d3539079efd2114c95c03cbf3dae2`. The existing work branch adds the operator's dependency and generated-type commit `6de4327`.
- [Regression 40871140214](https://github.com/jcodog/Cleo/actions/runs/40871140214) failed in `Verify Expo compatibility and export native bundles`. The other three required jobs passed. The aggregate failed.
- [Production Release 40871430259](https://github.com/jcodog/Cleo/actions/runs/40871430259) was green with only the enablement job successful. Every production job was skipped. A successful enablement job was not deployment evidence.
- GitHub's Vercel deployment `7411849236` records successful dashboard publication at the incident SHA, with environment URL `https://cleo-klzb3nmm3-jconet-ltd.vercel.app`. Landing deployment `7411827096` also records that SHA. Read-only Vercel inspection confirmed dashboard current artifact `dpl_2QYGhbzNHE9XWbMJsot9EtTyLuo7` and landing current artifact `dpl_GpEqwgj1Fdu9QdeQ6HX5HHdCg9Ne`, both READY/PROMOTED at that exact SHA. The dashboard artifact has completed alias assignment, including `app.cleoai.cloud`.
- The latest custom receipts are backend `7317368573`, Discord `7317382290` and Twitch `7317374197`. All have successful statuses at `45cd3fda0859e3fa39cb9125f1dd555c9bb1a0b9`, from coordinator `40221592151`. They attest that historical release, not the manual Convex deployment or today's running bot processes.
- At inspection, repository variables `CLEO_PRODUCTION_AUTO_PROMOTION_ENABLED`, `CLEO_DISCORD_DEPLOY_ENABLED` and `CLEO_TWITCH_DEPLOY_ENABLED` were already `true`. This differs from the incident's held run. This repair changes none of them.
- The manual Convex deployment's SHA remains unknown. There is no coordinator receipt for it. Do not create one from a guess, the current frontend SHA, local HEAD or an older successful build.
- The Vercel connector was unavailable; the authenticated read-only CLI worked. Both projects currently report `autoAssignCustomDomains=true`. Dashboard project `prj_8mnlqWlXCBoyekRFprvHII02OYw0` uses `apps/dashboard`; landing project `prj_QQCjVoG6AooYAgy2gyDVlOdxb591` uses `apps/landing`. Both are linked to `jcodog/Cleo`, branch `main`. No settings were changed. Production VPS runtime state could not be independently inspected here; confirm it using the read-only steps below before enablement.

## Release contract

`Regression Tests and Coverage` retains four required parallel jobs and its aggregate. Its type checks, workspace lint and coverage exclude the mobile workspace, using explicit production scripts. The published production coverage site requires all nine remaining workspace reports. Mobile type checks, lint, tests, coverage, native build configuration, Expo's immutable compatibility check and native JavaScript exports run in `Native mobile validation`, with a separate coverage artifact. That workflow fails normally on incompatibility, has no production credentials and cannot trigger production. Require its check for mobile changes in branch policy if desired. There is no IPA, EAS or Codemagic operation in this release path. Root developer validation scripts still include every workspace.

The coordinator only trusts a complete successful push-to-main regression at the exact current main SHA, from the pinned workflow ID, repository and attempt. It also requires GitHub's commit verification to report `verified: true`. Partial reruns, stale main, missing jobs, forks and manual regression runs cannot authorise production. Re-run all regression jobs when recovering a failed attempt.

Release order:

1. Authenticate required CI, current main and its signature. Classify each backend/runtime against its latest successful durable receipt, using an ancestor-checked diff. Unknown histories select the component conservatively.
2. Package affected bots with frozen Bun dependencies and immutable run/attempt artifacts. Require every selected runtime's protected enablement flag.
3. In `vercel-production`, require web enablement and staging configuration, then stage production builds for both web projects from the exact Git SHA. No production domains move. Existing current or reusable staged artifacts at the same SHA are reused. Both web projects are checked for every release, even when only one changed.
4. Verify the running backend baseline. Deploy Convex only if classification requires it, stamping the authenticated source SHA into the deployed module. The deployed public health query must return that SHA and complete a database read before a successful backend receipt is written. An unchanged backend must also pass live health at its confirmed baseline SHA.
5. Activate affected bots through the existing host controllers. Keep their readiness, command verification and rollback safeguards. Check unchanged bots against their receipt SHA and live service/readiness state without restarting them.
6. Recheck source evidence, latest successful backend/runtime receipts and live backend health. Promote dashboard, then landing, using their exact staged deployment IDs. Wait for alias assignment and verify Vercel's current production target. A successful build or accepted promotion request is insufficient. Write a custom successful web receipt only after this verification; its payload includes the provider deployment ID and project ID.
7. Always run `Production release result`. It reports `held`, `failed`, `partial`, `deployed`, `validated` or `recovered`, with per-component `deployed`, `already-current`, `failed` or `skipped`. Held, failed and partial releases have a failing result job. Validation and explicit rollback are labelled as such.

Promotion is not a cross-provider transaction. A push during an irreversible operation cannot undo it; later actions reject stale evidence. Dashboard promotion can succeed before landing fails. The result then reports partial release and preserves successful component receipts. Recovery inspects provider state and reuses current artifacts. It does not roll back a working dashboard or redeploy Convex blindly.

## One-time configuration

Complete these steps deliberately. The code does not enable flags, create secrets, change GitHub environment policy or modify production settings during development.

### 1. GitHub trust and environments

- Keep `main` protected. Retain required regression, security and review gates and require signed commits. The coordinator checks the selected main commit's GitHub Verified status itself; local signature validity alone is insufficient.
- Keep `discord-production` and `twitch-production` restricted to `main`. Create `vercel-production` with the same main-only deployment branch rule. Verify any environment reviewer, administrator-bypass and protection rules before enabling.
- For the first deployment, use required environment review to inspect the exact SHA and bootstrap. For future unattended merges, a required human environment review will intentionally pause each release. Choose that policy explicitly; automatic promotion does not bypass it. Branch review and required CI remain mandatory either way.
- Keep the dedicated `cleo-prod` runner restricted to trusted repository production jobs. Retain the installed root-owned host controllers, limited sudoers, release locks and current/previous-release state. Do not put general PR jobs on that runner.
- Keep the pinned Actions, workflow ID `310957278` and default-branch policy artifact checksum checks. No PAT or workflow-dispatch token is required. Jobs use their narrowly scoped `github.token`.

### 2. Variables and secrets

| Scope | Name | Required value or action |
| --- | --- | --- |
| Repository variable | `CLEO_COORDINATED_RELEASE_ENABLED` | Absent/false while configuring. Set `true` only after this checklist and the authorised first managed release are ready. This new gate also holds manual forward deploys. Validation and explicit bot rollback remain available. |
| Repository variable | `CLEO_PRODUCTION_AUTO_PROMOTION_ENABLED` | `true` permits trusted push-to-main regressions to request deployment. Leave false until the first controlled release is verified. It was already true at inspection; changing it is an operator action. |
| `discord-production` variable | `CLEO_DISCORD_DEPLOY_ENABLED` | `true` to permit selected Discord activations. An environment override can supersede the repository value. |
| `twitch-production` variable | `CLEO_TWITCH_DEPLOY_ENABLED` | `true` to permit selected Twitch activations. |
| `vercel-production` variable | `CLEO_VERCEL_DEPLOY_ENABLED` | `true` only after staging and both project IDs are checked. Missing/false blocks staging and all later production work. |
| `discord-production` and `vercel-production` variable | `CONVEX_PRODUCTION_URL` | The same exact production `https://<deployment>.convex.cloud` origin used by the production web apps and bots. Never use the local development URL. |
| `discord-production` secret | `CONVEX_DEPLOY_KEY` | Existing production deployment key for that Convex deployment. Confirm its target directly. Never place it in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`. |
| `vercel-production` secret | `VERCEL_TOKEN` | Team-authorised token restricted as narrowly as the plan permits to reading these projects/deployments, creating production builds, promoting deployments and restoring `autoAssignCustomDomains=false`. No token is exposed to local builds or artifact contents. |
| `vercel-production` variable | `VERCEL_TEAM_ID` | `team_AkZDBtEgYu4hPS2SNPfPbZ5l`, confirmed by read-only project inspection for JCoNet LTD. |
| `vercel-production` variable | `VERCEL_DASHBOARD_PROJECT_ID` | `prj_8mnlqWlXCBoyekRFprvHII02OYw0` for `cleo`, linked to `jcodog/Cleo`, root `apps/dashboard`, production branch `main`. |
| `vercel-production` variable | `VERCEL_LANDING_PROJECT_ID` | `prj_QQCjVoG6AooYAgy2gyDVlOdxb591` for `cleo-landing`, root `apps/landing`, same repository and branch. |
| `discord-production` variable | `CLEO_BACKEND_BOOTSTRAP_SHA` | Temporary exact 40-character current main SHA for the separately authorised first manual deployment. See reconciliation below. Remove after success. Never use `true`, an old receipt SHA or a branch name. Automatic runs cannot use this override. |

Existing bot runtime secrets remain in the host's protected environment files. They are not copied into workflow variables, Vercel or artifacts. Existing unrelated secrets need no change.

### 3. Vercel staging

- Inspect both project IDs, owner/team, repository link, root directory, production branch and current deployment before changing anything. Record each current provider deployment ID and commit SHA for incident recovery.
- In each project's Settings, Environments, Production, Branch Tracking, disable **Auto-assign Custom Production Domains**. Verify the API reports `autoAssignCustomDomains: false`. This changes future publication behavior; it does not roll back the current working deployment.
- Disable automatic Git deployments from `main` for both projects before merging the fix. The committed `vercel.json` files also set `git.deploymentEnabled.main=false`; feature-branch previews remain available. This is a second guard against early publication and a promotion API resetting auto-assignment. The coordinator creates production builds explicitly from the authenticated Git SHA using the provider API.
- Keep production environment values, including public Clerk and Convex URLs, on both Vercel projects. Remove any Vercel build command that deploys Convex. Repository build commands only perform frozen installation and web compilation.
- Verify no other workflow, deploy hook or integration independently publishes main to production. Keep any existing security/deployment checks required. Pending or failed deployment checks block the coordinator.
- The coordinator uses the provider promotion API and then reasserts `autoAssignCustomDomains=false`, since promotion can change it. This deliberate staging safeguard is part of the authorised release path. It never enables auto-assignment. If restoring that setting fails, the release fails and requires operator inspection before another merge.
- Verify production aliases and routing after the first controlled promotion. Both APIs must identify the expected provider artifact as current. Preview promotion, rebuilding during promotion, and direct `--prod` publishing are not part of this path.

Vercel documents [staged production promotion](https://vercel.com/docs/deployments/promoting-a-deployment) and [Git deployment controls](https://vercel.com/docs/project-configuration/git-configuration). The coordinator uses staged promotion instead of requiring a separate custom Deployment Checks integration.

### 4. Reconcile the manual Convex deployment

1. Read Convex deployment history and compare the manually deployed source with the intended signed main. Record any known provider deployment identity, time and source evidence. If a SHA cannot be proven, keep it unknown. Existing GitHub receipts remain historical and are not edited into a fabricated attestation.
2. Read the production bots without activation: current release symlink, systemd service state, Discord deployment-state application SHA and Twitch readiness for its current process. Compare those values with the latest successful custom receipts. Resolve unexplained drift before enabling.
3. Do not rerun the incident release expecting it to represent the manual backend. Do not automatically overwrite the working backend to establish a baseline. The new health preflight deliberately holds unknown or mismatching running code.
4. When the reviewed fix reaches signed current main and its complete push regression passes, obtain separate authorisation for the first managed deployment. Review the whole backend diff from the manual source. The first release can affect bots as well as web because their recorded baselines predate this change.
5. Keep automatic promotion false, set the exact approved main SHA in `CLEO_BACKEND_BOOTSTRAP_SHA`, enable the coordinated and component gates, and manually dispatch `Production Release` on main with `operation=deploy`, that SHA, the successful **push** regression run ID and its explicit attempt. Environment reviewers must approve that exact operation if required. The bootstrap permits replacing the unverified baseline; it does not claim the prior deployment had that SHA.
6. Verify the new backend health SHA, successful custom receipt, affected bot running versions/readiness/commands, both Vercel current IDs and final result. Remove the bootstrap variable. Then intentionally set `CLEO_PRODUCTION_AUTO_PROMOTION_ENABLED=true` for future successful current-main push regressions.

## Recovery

- Failed CI or disabled controls: no forward production mutation is eligible. The coordinator's result is failed/held. Fix the cause and obtain a complete current-main regression. Do not mistake a successful package or validation run for a deployment.
- Backend failure or lost confirmation: bots and frontend remain blocked. An unfinished or failed same-SHA backend claim is uncertain and blocks retry. Inspect Convex's actual deployed code and the claim before changing its status. Only a proven pre-mutation rejection may be marked inactive. Do not manually redeploy just to make CI green.
- Bot failure: retain the existing controller rollback and command recovery. Frontend promotion remains blocked. An explicit one-service rollback creates incident intent and holds automatic redeployment of that same revision. It does not change Convex or web.
- Vercel failure or partial release: inspect both current targets and custom receipts. A new coordinator at current main reuses current/staged provider artifacts and a confirmed healthy same-SHA backend, and checks unchanged bots without restarting them. A lost web promotion response may leave an unfinished intent; a later run inspects actual provider state and writes a new confirmed receipt, preserving the original uncertainty.
- A deliberately rolled-back web deployment must not be automatically re-promoted as if it were a new staged artifact. The coordinator rejects a previously promoted non-current artifact. Restore service through an explicitly authorised provider rollback or reviewed newer main, then inspect settings and receipts.

## Local development

`bun run dev` uses the existing Turbo TUI setting. `bun run dev --ui=stream` starts the same stack with readable logs. The launcher adds Node's `--use-system-ca` and Turbo passes through `NODE_OPTIONS` and `NODE_EXTRA_CA_CERTS`, preserving the machine's certificate trust without disabling TLS checks. Metro isolates serialized file-map caches by platform and runtime version. Stop an existing stack before starting another one. Production health verification uses the protected production URL, never the development Convex URL printed by local startup.

## Validation evidence

Local validation on 29 October 2026 passed root type checking, lint, tests, coverage and build. The production-scoped type/lint/coverage commands and CI contracts passed after the mobile split; native compatibility, all eight mobile tests and coverage also passed. The root build exported iOS and Android JavaScript/Hermes bundles and built both web apps and bots. It did not build an IPA or invoke a deployment workflow.

The actual root dev command reached dashboard and landing HTTP 200, Metro `packager-status:running`, development Convex functions ready, development Discord login and Twitch readiness. The verification stack was then stopped to release local ports. The runtime cache was observed on disk after startup.

Disposable production policy/graph/security fixtures passed, including 81 rejected source-evidence cases and the new health, Expo isolation, enablement, stale-main, Vercel failure, artifact reuse, partial release, skipped-component and recovery cases. The full operations shell suite stopped at its POSIX file-permission fixture on Windows, where Unix ownership/mode behavior cannot be validated. Linux packaging and the complete hosted regression still require Linux CI. A simulated release does not prove a live production deployment; none was attempted.

Cubic loaded the authenticated repository context but returned `Subscription expired`, so it submitted no review or approval. The available LM Studio CLI could not start because its configured application executable was missing; no independent local model review ran. These limitations are not passing review results.
