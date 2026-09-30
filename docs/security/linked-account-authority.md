# JCN-212 linked-account authority

Base: `97f655e74c14682abe8e3ad59ab59f6deff3c718`.

## Verified identity chain

Clerk supplies external account ownership through either a Svix-verified
`/clerk-users-webhook` request or a server-side Clerk API read authenticated with
`CLERK_SECRET_KEY`. The API reads use the authenticated Clerk subject, or the
stored Clerk ID of that current user.

Both routes call the internal
`mutations/integrations/clerk/users:upsertFromWebhook` mutation. That mutation
creates or updates `linkedAccounts`. Discord identity queries, installation
context, onboarding, guild selection, audit actor attribution, and the
`requireDiscordGuildManager` fallback consume those records.

The trusted mutation's callers are:

- `convex/http.ts`, after raw-body webhook signature verification.
- `actions/dashboard/account/syncLinkedAccounts:sync`, after fetching the
  authenticated subject's Clerk user.
- `actions/dashboard/account/syncDiscordIdentity:sync`, after the same fetch.
- `actions/dashboard/discord/lib/dashboardGuildSync.ts`, after fetching the
  current user's Clerk record for guild discovery.
- Backend tests that invoke the internal mutation directly.

Dashboard `DashboardDiscordHydrator` already calls the zero-argument
`syncLinkedAccounts:sync` action. Discord sign-in uses Clerk `oauth_discord`.
Neither requires a client-supplied provider identity write.

## Removed authority path

`mutations/dashboard/account/linkedAccounts/upsert:upsertForCurrentUser` was
public. It authenticated the Cleo user but accepted a provider account ID,
profile fields, scopes, token-secret references, and expiration from the caller.
An identity not already linked to another Cleo user could be inserted without
provider ownership evidence. Existing rows owned by the caller could also be
updated with unverified data.

A complete repository search found no application or trusted server callers.
The only references were its definition and generated API declaration. The
mutation is removed, without a replacement `linkAccount(provider, id)` API.
Future providers must establish ownership through verified provider evidence
and an internal write, following the Clerk boundary above.

## Executable reproduction

`convex/linkedAccountAuthority.test.ts` uses actual Convex handlers and the
protected guild-config query. The fixture has an authenticated active Cleo user
with no linked Discord identity or direct manager membership. A Discord ID has
no linked-account row, but has a stored manager membership with `canManage`,
`managementVerifiedAt`, and no `revokedAt`. Bot verification supports storing
such a membership without a Cleo `userId`.

Before the fix, the security expectation failed with `writeAccepted: true`,
`linkedDiscordId: "123456789012345678"`, and `protectedReadAllowed: true`.
After removal, an old client's runtime function reference is rejected, no
identity is created, and the protected query remains forbidden. This is a
repository-level reproduction under those preconditions. Production data was
not inspected.

## Existing data and JCN-213

The schema and write history contain no reliable source/provenance marker.
Both the public writer and Clerk synchronization could populate the same
fields. `externalProvider`, scopes, and timestamps cannot prove origin because
the public writer accepted them or set timestamps itself. Trusted and
historically client-written rows cannot reliably be distinguished from stored
rows alone.

No destructive migration is needed to close new unverified writes. Blanket
deletion or relinking could break legitimate users and discard historical
information. This change preserves the schema, existing rows, audit records,
and existing trusted Clerk conflict handling. Verified Clerk evidence can
update ownership of an existing identity without duplicating its row.

Historical linked identities still feed the unchanged authorization fallback.
Removing the writer does not retrospectively verify those identities.
JCN-213 must address existing authority freshness and revocation, including
how historical identity authority is revalidated without destroying audit
information. No guild-manager policy or identity lifecycle changes are included
in JCN-212.
