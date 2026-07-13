# Security policy

Cleo handles Discord identities, guild configuration, moderation records, support requests, operational incidents, and future billing and assistant data. Security reports must therefore be handled privately and with the minimum sensitive information required to reproduce the issue.

## Supported versions

| Version or surface | Support status |
| --- | --- |
| Discord bot v3.0.x | Supported for security and production fixes |
| Active v3.1 development branches | Reviewed when the issue is reproducible on the branch |
| Dashboard public beta | Supported, with beta limitations considered during triage |
| Legacy standalone Cleo repositories | Unsupported except when needed to understand a migration risk |
| Pre-v3 production services | Unsupported and scheduled for retirement or archival |

## Reporting a vulnerability

Use one of these private routes:

1. Open a private GitHub security advisory for this repository when private vulnerability reporting is available.
2. Email `customer_support@jconet.co.uk` with the subject `Cleo security report`.

Do not open a public issue with exploit details.

Include:

- the affected app, package, route, command, event, or deployment component;
- the revision or version tested;
- clear reproduction steps;
- the security impact and realistic attack conditions;
- logs or screenshots with tokens, cookies, IDs, private messages, and personal data removed;
- a minimal proof of concept when it is safe to provide one;
- whether the issue is already being exploited or is publicly known.

Never send production credentials, private keys, complete environment files, raw user conversations, payment data, or unnecessary personal information.

## Response process

JCoNet LTD will aim to:

- acknowledge a valid report through the private reporting channel;
- reproduce and classify the issue;
- identify affected versions and containment steps;
- prepare a focused fix and regression test;
- coordinate disclosure after affected production services are protected;
- credit the reporter when requested and appropriate.

Response time depends on severity, reproducibility, and operational impact. A report is not considered accepted until JCoNet LTD confirms it.

## Disclosure expectations

Please allow a reasonable remediation window before public disclosure. Immediate public disclosure may put Cleo users, Discord communities, and connected services at risk.

Do not access, alter, retain, or disclose data belonging to other users. Stop testing and report immediately if a test exposes credentials, private content, or access to production data.

## Scope priorities

High-priority reports include:

- authentication or authorisation bypass;
- cross-guild or cross-account data access;
- Discord bot token, Convex secret, Clerk secret, or deployment credential exposure;
- command permission or role-hierarchy bypass;
- unsafe support-ticket or moderation data disclosure;
- stored or reflected injection affecting dashboard users;
- webhook, entitlement, or billing forgery;
- production deployment or GitHub Actions privilege escalation;
- log redaction failures that expose secrets or private content;
- remote code execution, arbitrary file access, or supply-chain compromise.

General bugs, feature requests, expected beta limitations, and reports without a security impact belong in the normal issue tracker.

## Safe harbour

JCoNet LTD supports good-faith security research that follows this policy, avoids privacy violations and service disruption, and reports findings privately. This policy does not grant permission to test third-party systems, Discord infrastructure, Clerk, Convex, Stripe, hosting providers, or accounts you do not own.
