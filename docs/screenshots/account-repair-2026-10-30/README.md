# Real authenticated account and billing verification

Captured on 30 October 2026 from the running local Next.js app after the approved
`compassionate-goose-199` development backend sync. These use the maintainer's
actual Clerk session, Convex data and Cleo Dev Sandbox catalogue, without provider
fixtures. No payment, identity change or catalogue mutation was submitted.

- [Native Clerk Profile](profile-desktop.jpg)
- [Purchaser billing, desktop](billing-desktop.jpg)
- [Purchaser billing, mobile](billing-mobile.jpg)
- [Application connections, desktop](connections-desktop.jpg)
- [Application connections, mobile](connections-mobile.jpg)
- [Real Premium offer with checkout disabled](premium-desktop.jpg)
- [Real sandbox products](staff-catalogue-desktop.jpg)
- [Real recurring Price and read-only controls, desktop](staff-prices-desktop.jpg)
- [Real recurring Price, mobile with table scrolling](staff-prices-mobile.jpg)

Native Security and the Linked Roles FAQ were navigated without changing security
settings or consent. Mobile account navigation and direct Billing links worked.
The real purchaser ledger is empty. Existing-subscription/Portal and actual
Elements/wallet/redirect payment acceptance remain separate JCN-241 checks.
