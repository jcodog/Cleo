# JCN-227 web application split

`apps/landing` owns the existing public homepage on `cleoai.cloud`. Its product,
feature, platform and safety sections retain the original design. The marketing
screenshot moved with it. No unfinished public pages were added.

`apps/dashboard` owns authentication, onboarding, Discord server management,
Twitch, Kick and staff tools on `app.cleoai.cloud`. Clerk and Convex remain its
identity and backend authorities. The landing app has no Clerk or Convex dependency
and receives no authenticated-app secrets.

Both apps consume `packages/ui`, `packages/env` and `packages/shared`. The new
`@workspace/env/landing` contract exposes only the public origins and Vercel build
context. `@workspace/env/origins` selects configured origins, the current project's
Vercel URL where appropriate, or explicit local origins. Shared route classification
lives in `@workspace/shared/appRoutes`. No landing-to-dashboard source dependency.

The landing cannot inspect the dashboard session without adding Clerk to the public
site. Its existing Sign in/Get started buttons now link to the authenticated app.
An existing session continues through that app's entry/onboarding checks. This is
the only session-dependent marketing behavior changed by the split.

## Routing and SEO

Dashboard `/` calls Clerk on the server. Signed-out visitors reach `/sign-in` without
a return path. Signed-in visitors use the existing Convex onboarding query and
version/provenance rules to reach `/onboarding` or `/dashboard`. Account sync and
unresolved provenance go through the existing onboarding hydration flow.

The dashboard proxy sends signed-out product routes to the existing Discord auth UI
with a validated `returnTo`. SSR checks onboarding before mounting the application
shell, and preserves the requested path/query through onboarding completion.
The rendered Clerk SignIn/SignUp routes validate `returnTo` and pass it through
Clerk's [forceRedirectUrl and alternate-flow redirect props](https://clerk.com/docs/guides/development/customize-redirect-urls). Their alternate auth
links carry the same validated destination. Missing or rejected paths use app `/`
for sign-in and `/onboarding` for sign-up, overriding untrusted Clerk redirect
query values. The unused custom DiscordAuthPage retains its previous behavior.
Return paths reject external/protocol-relative URLs, encoded slash/backslash
redirects, control characters and auth/onboarding loops. Existing authorization
checks still govern the final destination.

The landing proxy redirects legacy product/auth paths with HTTP 308 and preserves
the complete query. It covers dashboard, onboarding, Twitch, Kick, staff,
account/settings, billing/subscription, sign-in/up, SSO and session-task roots.
Classification uses segment boundaries, so public paths such as `/dashboard-guide`
stay public. `/`, product, pricing, legal and other public paths stay on the site.

Landing owns canonical metadata, robots and sitemap. Its sitemap lists only the
existing homepage. Vercel landing previews are noindex/nofollow. Dashboard root
metadata and page response headers are noindex/nofollow. Robots allows crawling
so search engines can read those directives; it does not expose protected content.
Landing previews also allow crawling to make their noindex directives visible.
The app root no longer emits the apex canonical.

## Environment and development

| Setting                  | Existing production            | Target production                           |
| ------------------------ | ------------------------------ | ------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`   | `https://cleoai.cloud` on cleo | `https://cleoai.cloud` on both projects     |
| `NEXT_PUBLIC_APP_URL`    | `https://cleoai.cloud`         | `https://app.cleoai.cloud` on both projects |
| Clerk sign-in/up         | `/sign-in`, `/sign-up`         | unchanged, dashboard only                   |
| Clerk fallback redirects | `/dashboard`, `/onboarding`    | unchanged, dashboard only                   |

The sole previous application URL use was dashboard metadataBase. It now remains
an app origin. Public-site links use SITE_URL; landing auth CTAs and compatibility
redirects use APP_URL. Turbo declares the new site URL and Vercel context variables.

Run the existing dashboard HTTPS development server on port 3000 and landing HTTP
on port 3001 using their workspace `dev` scripts. Default cross-app local origins
match those protocols. Local `next start` metadata defaults to HTTP. When overriding
ports,
set both public URL variables to the actual origins in local env files. Do not run
duplicate development servers.

Use Vercel's generated branch aliases as a paired preview environment. Set landing
APP_URL to the matching dashboard alias and dashboard SITE_URL to the matching
landing alias. Set each project's own URL explicitly to its matching alias, or
leave it unset so VERCEL_URL supplies its own metadata origin. Never infer the other
project's alias from the current project's VERCEL_URL. Missing cross-app origins
on Vercel fail explicitly, rather than publishing localhost links or redirects.
Production also requires the app's own configured origin; only Preview may use
its own VERCEL_URL fallback. VERCEL_URL passes through Turbo globally but is hashed
only by each web app's build task, since those artifacts may embed metadata URLs.

The existing cleo Preview APP_URL remains `https://dev.cleoai.cloud` until an
operator changes it. Override it for JCN-227 only, using a branch-scoped Preview
environment setting. Keep `dev.cleoai.cloud` bound to
`fix/primary-dashboard-cutover`; do not delete or silently repurpose it. Prefer
paired generated branch aliases over introducing more permanent development
domains during this migration.

## Clerk, Discord, Twitch and Kick

Clerk production authority stays `clerk.cleoai.cloud`. Convex continues to validate
the existing issuer and `convex` audience. SSR requests use the current Clerk token
directly when it has that audience, otherwise the existing Convex JWT template.
Sign-out still returns to app `/`, which now resolves to sign-in. Session refresh
and account switching retain the existing Clerk/Convex provider integration.

Discord identity and provider tokens remain Clerk `oauth_discord`. The audited
guild-install URL requests `bot applications.commands`, fixes the guild and
integration type, and contains no `redirect_uri`. The popup clears `opener`, while
the application watches/reloads a user-scoped Convex install session and checks
actual guild access. Recovery is backend-backed, not tied to the old web origin.
No Discord Developer Portal change is required by this code. No old/new portal
redirect value is proposed.

Twitch customer linking remains Clerk `oauth_twitch`. The return URL is built from
`window.location.origin`; on the target app this becomes
`https://app.cleoai.cloud/twitch/link-callback?returnTo=%2Ftwitch`. Clerk finishes
provider verification before this page reloads the external account and syncs it
to Convex. The existing local bot OAuth callback and VPS EventSub callback remain
unchanged. Kick currently has an authenticated product page, with no customer
OAuth flow to migrate in this branch.

## Vercel and deployment safety

Keep project `cleo`, ID `prj_8mnlqWlXCBoyekRFprvHII02OYw0`, rooted at
`apps/dashboard`. Keep its existing auth/backend credentials and attached domains
until reviewed cutover. Both checked-in `vercel.json` files use Bun's frozen
workspace install and a targeted app build; neither deploys Convex or bots.

Create Git project `cleo-landing` from `jcodog/Cleo`, root `apps/landing`, framework
Next.js. Enable access to sources outside the root directory and Vercel's Skip
unaffected projects setting for both projects. The package graph allows changes
inside one app to avoid rebuilding the other; shared-package changes may rebuild
both. See [Vercel monorepo documentation](https://vercel.com/docs/monorepos).

Landing Production needs only the two public URL variables. Landing Preview needs
the paired public URL variables. Do not copy Clerk keys, Clerk issuer/secret,
Convex URLs/deploy keys, provider secrets or runtime credentials into landing.

Regression CI now builds both apps with clearly labelled compile-only public
fixtures and checks both coverage reports. Bot deployment classification ignores
web-only files and config additions only when existing runtime inputs match.
Lockfile changes that alter existing packages, backend imports, bot env, runtime
source and operations changes retain conservative deployment behavior. Twitch
activation now additionally requires a runtime-affecting change. Manual deploy
operations retain the existing operator gate.

No external Vercel/Clerk settings or domain ownership were changed during local
implementation. Project creation and paired preview/auth validation require
authenticated Vercel access. Keep this change in draft until those checks pass.

## Remaining operator sequence

1. Create `cleo-landing` on the feature branch without attaching apex/www domains.
   If the Git import starts at main before the folder exists there, select/deploy
   `feat/jcn-227-app-split` explicitly. Keep the production branch on main after
   merge. Keep `cleo` rooted at `apps/dashboard`.
2. Configure branch-scoped Preview URL pairs. Redeploy both apps so the public
   build-time variables are current. Preserve the existing Preview Clerk/Convex
   settings and legacy dev alias.
3. Verify landing design, canonical/robots/sitemap, every CTA, public routes and
   legacy redirects including duplicate/encoded query parameters on real previews.
4. Verify dashboard signed-out root and deep links, Discord sign-in and sign-up,
   onboarding, completed-account entry, refresh, authenticated SSR, sign-out,
   account switching, Clerk session tasks and Convex handoff. Verify Discord install
   popup and reload recovery, Twitch link/relink callback and provider-token reads.
   Verify these with the intended Clerk environment and approved origins.
5. Validate the dashboard implementation on `app.cleoai.cloud` using a deployment
   built with the production Clerk/Convex authority. Do not route production users
   to a Preview deployment using a different Clerk instance. Preserve apex serving
   the working combined deployment while this is checked.
6. Record the current production deployment URL/ID, domain bindings, environment
   values and legacy dev binding as the rollback reference. Obtain cutover review.
7. Before merging or promoting any dashboard-only build on cleo, create and
   validate the landing Production deployment with
   `NEXT_PUBLIC_SITE_URL=https://cleoai.cloud` and
   `NEXT_PUBLIC_APP_URL=https://app.cleoai.cloud`. Use the reviewed feature commit
   while main lacks apps/landing. Keep apex/www on the working combined deployment
   throughout preparation. Also prepare the reviewed dashboard deployment with
   production Clerk/Convex authority and the target origins, without replacing
   the deployment serving apex. Both production deployments must be proven first.
8. At the reviewed coordinated cutover, move apex and www to the proven landing
   Production deployment first; configure www as a 308 redirect to apex. Then
   merge/promote the dashboard-only build on cleo. Set cleo Production
   `NEXT_PUBLIC_APP_URL` from `https://cleoai.cloud` to `https://app.cleoai.cloud`
   for that build; keep `NEXT_PUBLIC_SITE_URL=https://cleoai.cloud`. Leave app on
   cleo and dev on its existing branch. Do not let an automatic main deployment
   promote dashboard-only cleo before the apex/www handoff is complete.
9. Verify production canonical/SEO, root routing, auth/linking and bookmarked app
   paths immediately. If validation fails, restore apex/www to cleo and restore
   the recorded combined deployment and old APP_URL, without changing Clerk
   authority or runtime OAuth endpoints.

Production cutover remains a separately reviewed action. A passing local build is
not evidence that live OAuth, production session refresh or cross-domain auth has
been verified.

## Repository validation

Local root `typecheck`, `lint`, `test`, `test:coverage` and `build` passed. The test
run contains 703 cases across nine workspaces; every configured coverage include
set achieved 100% in all four measures. Thresholds were preserved and the dashboard
include set expanded to cover application entry decisions. Tests and coverage used
Turbo's loose environment mode only to pass a process-scoped Git safe.directory
setting for the sandbox-owned test subprocess. No global Git configuration changed.

Built-server HTTP checks verified landing CTAs, legacy redirects and query
preservation, public-route boundaries, the signed-out dashboard root, protected
deep-link returns, auth metadata noindex and dashboard robots. The landing design
was inspected in the running production build. Live provider sign-in, account
switching and production-domain verification remain pending authenticated previews.
