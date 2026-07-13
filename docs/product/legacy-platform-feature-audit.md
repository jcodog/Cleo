# Legacy platform feature audit

This audit covers the uploaded `Cleo-Dashboard-main`, `Cleo-Kick-main`, `Cleo-Websockets-main`, older `Cleo-main`, and `codex.zip` snapshots.

The snapshots are research inputs only. The current monorepo and Linear project remain the source of truth.

## Legacy dashboard

| Legacy surface | Decision | Current tracking |
| --- | --- | --- |
| Discord primary identity and linked Kick account | Rebuild through Clerk and Convex | JCN-17, JCN-49, JCN-50, JCN-52 |
| Guild selection and add-server flow | Rebuilt for Discord | JCN-18, JCN-34 |
| Guild channel and server configuration | Rebuilt as the focused Discord workspace | JCN-35 |
| AI daily usage meter and UTC reset countdown | Rebuild only after current usage and entitlement rules are defined | JCN-199, JCN-203 |
| One-time AI message bundle drawer | Rebuild with trusted Stripe metadata and Convex reconciliation; reject inferred quantities based on price order | JCN-53 through JCN-58, JCN-203 |
| Stripe product seeding scripts | Replace with reviewed product configuration and hosted Checkout or Portal flows | JCN-54, JCN-55, JCN-58 |
| Terms, privacy, cookies, refunds, and essential-cookie notice | Restore after legal and production-behaviour review | JCN-204 |
| Generate a Discord invite from the dashboard | Defer until a clear onboarding or support use case justifies the permission and lifecycle complexity | No implementation issue until accepted |
| Delete guild configuration | Reassess as an uninstall, retention, and account-control workflow rather than copying a destructive legacy form | JCN-32, JCN-204 |
| Overlay API routes inside the dashboard | Replace with the dedicated typed real-time relay | JCN-10, JCN-72, JCN-73 |
| Better Auth and app-owned OAuth token refresh | Reject for the current direction where Clerk and approved linked-account flows own identity | JCN-17, JCN-49 through JCN-52 |
| Prisma and custom JStack backend routers | Reject | JCN-15, JCN-16, JCN-31 |

## Legacy Kick service

The Kick snapshot contains more concrete product behaviour than the original Linear issue descriptions recorded:

- webhook handlers for chat messages, follows, gifted Kicks, livestream status changes, new subscriptions, renewals, and gifted subscriptions;
- chat command response behaviour, including a basic ping path;
- forwarding chat payloads to an overlay room named `overlay-chat-<broadcaster-id>`;
- broadcaster authentication middleware and Kick API message sending;
- health, dashboard redirect, debug email, webhook, and test-overlay routes;
- Cloudflare Worker and Node runtime paths;
- persisted errors, Logtail forwarding, MailChannels notifications, Prisma, and Socket.IO relay coupling.

### Migration decisions

| Legacy behaviour | Decision | Current tracking |
| --- | --- | --- |
| Follow, gifted Kicks, subscription, renewal, gifted subscription, and livestream event handlers | Rebuild as typed, idempotent webhook event families | JCN-65 |
| Chat commands and automatic thank-you messages | Rebuild behind per-channel Convex settings | JCN-66, JCN-67 |
| Kick account and broadcaster token lifecycle | Rebuild through the approved linked-account model | JCN-52, JCN-64 |
| Overlay forwarding | Rebuild through shared authenticated relay contracts | JCN-72, JCN-73 |
| Health and readiness | Rebuild with liveness and readiness separation | JCN-68, JCN-79 |
| Debug email and synthetic production routes | Keep development-only or replace with authenticated operational tooling | JCN-68, JCN-79 |
| Prisma, Bun-only scripts, Logtail-specific coupling, and direct Socket.IO client use | Reject as migration architecture | JCN-9, JCN-16, JCN-72 |

## Legacy WebSocket relay

The relay snapshot is a small Hono and Socket.IO service with:

- unauthenticated room joins from a `roomId` query parameter;
- `chat:send` and `chat:message` events;
- in-memory socket-to-room state;
- an unauthenticated `/test-message` HTTP endpoint;
- wildcard CORS by default;
- no payload versioning, publisher identity, consumer authorisation, backpressure, durable delivery, or production readiness distinction.

The useful product idea is room-scoped overlay chat delivery. The implementation must not be migrated directly.

| Requirement | Current tracking |
| --- | --- |
| Inventory publishers, consumers, room naming, and payloads | JCN-69 |
| Create the supported monorepo relay app | JCN-70 |
| Define typed versioned schemas and authentication | JCN-72 |
| Reconnect Kick and future platform publishers and overlays | JCN-73 |
| Add heartbeat, cleanup, bounded queues, observability, and failure handling | JCN-74 |
| Validate production and retire the legacy endpoint | JCN-75, JCN-76 |

## Older monorepo snapshot

The older `Cleo-main` archive primarily captures an earlier monorepo foundation. Its useful schema, identity, guild membership, audit, shared package, and UI work has either moved into the current repository or is already represented in the existing migration issues.

It does not override the current branch, current package versions, current deployment model, or current Linear state.

## `codex.zip`

This archive contains screenshots of apps, MCP, plugins, and skills rather than Cleo source code. It provides workflow context but no product feature implementation to migrate.

## New gaps added to Linear from this audit

- JCN-203 defines current AI usage accounting and optional message bundles.
- JCN-204 restores the SaaS legal and trust surfaces.
- JCN-205 splits the growing Discord Convex client before new domains increase coupling.
- JCN-206 improves main-branch and release-trigger discipline.

The existing Kick and relay issues remain the correct work items, with concrete snapshot findings added as implementation context rather than duplicated into parallel tickets.
