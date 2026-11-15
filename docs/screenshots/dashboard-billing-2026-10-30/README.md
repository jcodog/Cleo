# Dashboard, account and billing visual evidence

Captured from the actual React components at 1440px and 375px using the built
Cleo styles and fonts. Clerk, Convex and Stripe transport boundaries are isolated
test fixtures. Names, subscriptions and catalogue entries shown here are test
data. These images are UI evidence, not proof of real OAuth or Stripe payment
acceptance. Authenticated Clerk inspection and JCN-241 remain separate checks.

| View | Desktop | Mobile |
| --- | --- | --- |
| Purchaser billing | [1440px](account-billing-1440.png) | [375px](account-billing-375.png) |
| Connected identities | [1440px](account-connections-1440.png) | [375px](account-connections-375.png) |
| Premium overview | [1440px](premium-overview-1440.png) | [375px](premium-overview-375.png) |
| Staff Prices | [1440px](staff-prices-1440.png) | [375px](staff-prices-375.png) |

The mobile staff table scrolls horizontally within its container. Its screenshot
shows the action columns after exercising a default-price confirmation.

Tests cover search, empty/read-only/forbidden states, typed financial confirmation,
safe disconnect cancellation, billing outside guild permissions, active coverage,
embedded checkout return, redirect failure states and keyboard interactions.
