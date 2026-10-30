import { createEnv } from "@t3-oss/env-core"

import { nodeEnv, optionalString, optionalUrl } from "./shared"
import { twitchEventSubSecret } from "./twitch"

export const backendEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,

    CONVEX_DEPLOYMENT: optionalString,
    CONVEX_URL: optionalUrl,

    CLERK_JWT_ISSUER_DOMAIN: optionalUrl,
    CLERK_SECRET_KEY: optionalString,
    CLERK_WEBHOOK_SECRET: optionalString,

    STRIPE_SECRET_KEY: optionalString,
    STRIPE_EXPECTED_ACCOUNT_ID: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_GUILD_PREMIUM_PRICE_ID: optionalString,
    STRIPE_TEST_CHECKOUT_ENABLED: optionalString,
    STRIPE_CATALOGUE_MANAGER_IDS: optionalString,
    STRIPE_CATALOGUE_WRITES_ENABLED: optionalString,
    CLEO_DASHBOARD_ORIGIN: optionalUrl,
    CLEO_OFFICIAL_GUILD_ID: optionalString,
    CLEO_MANAGED_ROLE_IDS: optionalString,
    CLEO_COMMUNITY_UPGRADES_CHANNEL_ID: optionalString,
    CLEO_LINKED_ROLES_FAQ_CHANNEL_ID: optionalString,
    CLEO_COMMUNITY_ROLES_ENABLED: optionalString,
    CLEO_RECOGNITION_ENABLED: optionalString,
    DISCORD_APPLICATION_ID: optionalString,
    DISCORD_CLIENT_SECRET: optionalString,
    DISCORD_APPLICATION_PUBLIC_KEY: optionalString,
    DISCORD_ROLE_CONNECTION_REDIRECT_URL: optionalUrl,
    DISCORD_TOKEN_ENCRYPTION_KEY: optionalString,
    TWITCH_MODERATION_ENFORCEMENT_ENABLED: optionalString,
    DISCORD_BOT_CONVEX_SECRET: optionalString,
    DISCORD_BOT_TOKEN: optionalString,
    TWITCH_EVENTSUB_SECRET: twitchEventSubSecret.optional(),
    TWITCH_WORKER_SECRET: optionalString,
    TWITCH_CLIENT_ID: optionalString,
    TWITCH_CLIENT_SECRET: optionalString,
    TWITCH_BOT_USER_ID: optionalString,
    TWITCH_EVENTSUB_CALLBACK_URL: optionalUrl,
    TWITCH_CHAT_PRESENCE_ENABLED: optionalString,
    TWITCH_CHAT_OAUTH_REDIRECT_URL: optionalUrl,
  },
  runtimeEnv: process.env,
})
