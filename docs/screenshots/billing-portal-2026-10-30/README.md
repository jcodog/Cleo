# Billing portal visual verification

30 October 2026, PR #284, canonical development branch.

## Real authenticated runtime

The maintainer's existing Clerk session at `https://localhost:3000` connects to
development Convex `compassionate-goose-199`. This purchaser has no associated
Stripe customer or subscription. These screenshots show the honest empty state,
not substituted billing data.

- [Desktop portal, 1440px](authenticated-empty-desktop.jpg)
- [Mobile portal, 375px](authenticated-empty-mobile.jpg)
- [Centred native Clerk UserProfile, 1440px](authenticated-clerk-centered-desktop.jpg)
- [Native Clerk mobile layout, 375px](authenticated-clerk-mobile.jpg)
- [Real Stripe Address Element](authenticated-address-element.jpg)

The desktop Clerk card measured 880px wide with its centre exactly at viewport
centre. Its Billing link navigated to `/billing`; an old `/account/billing`
bookmark redirected there. Address Element loaded its real Stripe iframe. No
address was saved and no payment method, payment or subscription was created.

Real reload testing caught the React provider's asynchronous initialization
stall and the standalone form's missing Elements session. Stripe is now resolved
before mounting the provider, and the address-only session uses setup mode with
GBP currency. This does not set subscription prices or create a payment. SDK
unavailability produces a cancellable error state.

## Controlled provider fixtures

- [Populated desktop portal, 1440px](fixture-populated-desktop.png)
- [Populated mobile portal, 375px](fixture-populated-mobile.png)

These exercise the actual React components with controlled Clerk/Convex/Stripe
providers. They verify layout, masked card display, default/other methods,
subscription pricing and invoice controls. They are **not** evidence of a real
Stripe payment or real populated purchaser history.

Browser regressions cover default changes, confirmed removal, setup cancellation,
setup errors, asynchronous confirmation, redirect-secret removal, billing-address
editing and Stripe failure without hiding verified subscription history.
Backend tests separately check authenticated ownership, mode/account enforcement,
idempotency, active-subscription/default protections and server confirmation.

No-charge saved-method acceptance is pending maintainer approval. JCN-241 still
owns actual subscription, webhook, wallet/redirect and lifecycle acceptance.
