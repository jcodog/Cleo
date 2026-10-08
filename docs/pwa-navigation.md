# Cleo installed-app navigation

The confirmed defects repaired here are manifest discovery, incomplete manifest
identity and scope, missing Apple capability metadata in Next 16's output, and
sign-out leaving the app origin. The complete cause of the reported iPhone
`/` to `/dashboard` escape is still unverified. Do not close the issue or approve
the PR for merge based only on these corrections.

The audit started from fetched `main` at
`970caede4bf235e4c70ab92aa6d23054ce03eb7d` on 8 October 2026.
Read-only production inspection of `https://app.cleoai.cloud/sign-in` confirmed
no manifest link, an unprefixed `mobile-web-app-capable` tag, no Apple-prefixed
capability tag, and an existing Apple touch icon. `/site.webmanifest` returned
`application/manifest+json; charset=utf-8` but lacked `id`, `start_url` and `scope`.

Before JCN-227, dashboard root rendered the landing page. The split changed it to
SSR Clerk/Convex entry routing. The pre-split layout and manifest already lacked
manifest discovery and explicit identity/start/scope. The split therefore exposed
existing configuration gaps, rather than creating those gaps. The later
`d16c7c7` sign-out handoff deliberately redirected to the marketing site.

Root SSR redirects to `/sign-in`, `/onboarding` or `/dashboard` remain intact.
Protected-route proxy redirects preserve path/query on the request origin. The
SSR onboarding guard and client completion retain validated deep links. Sidebar
links use Next Link without new-window targets; platform and guild selectors use
the Next router. No ordinary feature navigation needed replacement.
`/account`, `/settings`, `/billing` and `/subscription` are protected reserved
route roots, not implemented pages. This fix covers their scope and auth redirect
classification and does not add pages or aliases.

Both Vercel project configs contain build commands, with no hostname rewrites or
redirects. The landing proxy intentionally transfers legacy app/auth paths to the
configured app origin. Marketing links in the auth shell intentionally leave the
app. Actual Vercel domain configuration and Clerk dashboard settings were not
changed or independently audited through their control planes.

The dashboard now links `/site.webmanifest` through Next metadata. Its `id`,
`start_url` and `scope` are `/`, resolved against the app's own origin, with name
`Cleo`, standalone display and `#0a0a0a` launch colors. The existing 192 and 512 PNGs
are declared for purpose `any`; HTTP tests check their real dimensions. The
portrait extends outside the maskable safe circle, so it is not relabelled as
maskable. Apple touch icon, title and status-bar metadata remain. Next 16 emits
the standard capability tag from `appleWebApp.capable`; `metadata.other` adds the
Apple-prefixed compatibility tag. Landing metadata and assets remain unchanged.

Clerk SignIn/SignUp keep their default `auto` OAuth flow and validated relative
return URLs. The unused custom DiscordAuthPage does not control these entry
pages. The existing `/sso-callback` handles legacy continuations and Clerk-decorated
session URLs. Twitch linking uses the current browser origin for its callback;
its full-page navigation is to external provider authorization. Discord guild
installation intentionally opens a provider window. These external flows are
distinct from ordinary feature navigation and have not been rewritten.

[Clerk documents](https://clerk.com/docs/nextjs/reference/components/authentication/sign-in)
`auto`, `redirect` and `popup`, but does not promise installed-PWA context recovery
for both mobile platforms. [Apple describes](https://developer.apple.com/videos/play/wwdc2023/10120/)
scope-dependent browser views, OAuth heuristics, and separate storage after
installation. An in-scope destination can remain inside a browser view if the
authorization chain already opened that context. This is a hypothesis for the
reported auth escape, not a confirmed diagnosis. A local browser attempt reached
Clerk handshake failure because Node did not initially trust the local network CA;
it did not complete Discord authentication. Do not force popup flow without
installed Android and iOS success, cancellation and popup-blocking checks.

[Manifest scope rules](https://www.w3.org/TR/appmanifest/) support explicit scope
independent of the installation page. [Chrome's installability update](https://developer.chrome.com/blog/update-install-criteria)
removes the fetch-handler requirement for menu installation. Existing icons and
manifest fields meet the checked metadata prerequisites. Install UI, secure
context, engagement requirements and browser-specific promotion still require
browser verification. No service worker, offline cache or push feature was added.

| Platform                 | Evidence obtained                                                                                                                                        | Outstanding checks                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Desktop Chromium         | Built app renders sign-in; CDP parses manifest without errors, standalone display and origin-local identity/start/scope; protected Twitch query retained | Genuine installed desktop window, authenticated navigation, complete OAuth, refresh and sign-out                                |
| Desktop Firefox / Safari | Standards and routing compatibility review                                                                                                               | Browser login and normal navigation; Safari available only on a separate host                                                   |
| Android Chrome           | Configuration and routing tests only                                                                                                                     | Physical device or emulator installation and every flow below                                                                   |
| Android alternatives     | Standards-based manifest retained                                                                                                                        | Installed behavior in supported Samsung Internet, Edge or Firefox versions; distinguish app installation from shortcut behavior |
| iOS Safari               | User-confirmed pre-fix escape; configuration and Apple compatibility review                                                                              | Physical installed-app testing on the reproduced version and another supported version                                          |

No physical Android or iOS tests ran. No installed desktop PWA, Android emulator,
Firefox engine or Safari/WebKit engine test ran. The Chromium browser tab is not
an installed PWA. Neither viewport emulation nor changing `display-mode` media
queries establishes standalone navigation correctness.

Automated checks cover actual server root routing, token failures, SSR onboarding,
protected deep-link retention through both Clerk entry components, generated
dashboard sidebar Next Link targets and in-scope sign-out configuration. CI runs
`test:pwa:build` after the dashboard build to inspect Next's generated static HTML,
including the SSO callback. Production HTTP tests verify generated route HTML,
served MIME type, manifest identity/scope/display, actual icon bytes and dimensions,
all expected signed-out route destinations, and the obsolete sign-out marker.
Existing coverage thresholds are unchanged.

To repeat HTTP validation, build and start the dashboard with valid development or
preview Clerk configuration and a reachable Convex deployment. For example, start
the server with `bun run --filter @workspace/dashboard start --hostname localhost --port 3100`.
Set `PWA_TEST_ORIGIN` to that server's exact origin, `http://localhost:3100` in this
example, then run
`bun run --filter @workspace/dashboard test:pwa`. This suite requires a signed-out
server request context and does not simulate a real user session. The build-only
suite runs with `bun run --filter @workspace/dashboard test:pwa:build` and requires
the dashboard `.next` output, without auth secrets.

Manual verification on an approved preview or after an operator-controlled release:

1. Record OS/browser version, installed URL, build SHA and the resolved manifest
   identity/start/scope. Test the existing failing iPhone installation first.
   Then separately test a fresh installation from `/sign-in` and from an
   authenticated deep link. Keep upgrade and fresh-install outcomes distinct.
2. Install from the authenticated app origin, with Open as Web App enabled on
   iOS. Launch from the Home Screen or application launcher. Confirm real
   standalone mode and absence of browser toolbars. Do not use a normal browser
   tab or an emulated display-mode override as evidence.
3. Test completed, incomplete and signed-out accounts through root entry. Move
   `/dashboard` to `/twitch` and back through available controls, then test Kick,
   guild features and staff with the required permission. Confirm any browser
   view is absent during internal navigation.
4. Open `/twitch?tab=chat` signed out and with incomplete onboarding. Verify the
   query survives Discord sign-in and onboarding. Record every origin/window
   transition, including Clerk callbacks, without logging tokens or auth codes.
5. Complete Discord login from inside the installed app. External authorization
   UI is allowed; final authenticated Cleo must return to its installed context.
   Repeat with cancellation, denied consent, and blocked popups where supported.
   Test returning with an existing Discord session as well as a logged-out one.
6. Complete onboarding, reload, background/relaunch, allow a normal session
   refresh, and switch accounts. Then sign out and confirm in-app `/sign-in`
   remains usable for another sign-in. Repeat on Android Chrome and an installed
   supported alternative, plus normal Firefox/Safari tabs.

Merge remains gated on CI, review and real installed-device navigation/auth results.
If the original iPhone escape persists, capture the first context/origin transition
and effective installed scope before choosing a Clerk flow change or routing fix.
