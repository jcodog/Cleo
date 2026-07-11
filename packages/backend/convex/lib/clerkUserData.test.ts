import assert from "node:assert/strict"
import { test } from "node:test"

import { normalizeClerkUserData } from "./clerkUserData"

test("normalizeClerkUserData accepts snake_case Clerk payloads", () => {
  assert.deepEqual(
    normalizeClerkUserData({
      id: "user_123",
      primary_email_address_id: "email_123",
      email_addresses: [
        {
          id: "email_123",
          email_address: "user@example.com",
        },
      ],
      external_accounts: [
        {
          id: "account_123",
          provider: "oauth_discord",
          provider_user_id: "111111111111111111",
          external_account_id: "external_123",
          username: "cleo",
          email_address: "discord@example.com",
          first_name: "Cleo",
          last_name: "Bot",
          image_url: "https://cdn.example.com/avatar.png",
          avatar_url: "https://cdn.example.com/provider-avatar.png",
          approved_scopes: ["identify", "email"],
        },
      ],
      first_name: "Cleo",
      last_name: "User",
      username: "cleo-user",
      image_url: "https://cdn.example.com/user.png",
    }),
    {
      id: "user_123",
      primary_email_address_id: "email_123",
      email_addresses: [
        {
          id: "email_123",
          email_address: "user@example.com",
        },
      ],
      external_accounts: [
        {
          id: "account_123",
          provider: "oauth_discord",
          provider_user_id: "111111111111111111",
          external_account_id: "external_123",
          username: "cleo",
          email_address: "discord@example.com",
          first_name: "Cleo",
          last_name: "Bot",
          image_url: "https://cdn.example.com/avatar.png",
          avatar_url: "https://cdn.example.com/provider-avatar.png",
          approved_scopes: ["identify", "email"],
        },
      ],
      first_name: "Cleo",
      last_name: "User",
      username: "cleo-user",
      image_url: "https://cdn.example.com/user.png",
    }
  )
})

test("normalizeClerkUserData accepts camelCase Clerk payloads", () => {
  assert.deepEqual(
    normalizeClerkUserData({
      id: "user_123",
      primaryEmailAddressId: "email_123",
      emailAddresses: [
        {
          id: "email_123",
          emailAddress: "user@example.com",
        },
      ],
      externalAccounts: [
        {
          id: "account_123",
          provider: "oauth_discord",
          providerUserId: "111111111111111111",
          externalAccountId: "external_123",
          username: "cleo",
          emailAddress: "discord@example.com",
          firstName: "Cleo",
          lastName: "Bot",
          imageUrl: "https://cdn.example.com/avatar.png",
          avatarUrl: "https://cdn.example.com/provider-avatar.png",
          approvedScopes: "identify email",
        },
      ],
      firstName: "Cleo",
      lastName: "User",
      username: "cleo-user",
      imageUrl: "https://cdn.example.com/user.png",
    }),
    {
      id: "user_123",
      primaryEmailAddressId: "email_123",
      emailAddresses: [
        {
          id: "email_123",
          emailAddress: "user@example.com",
        },
      ],
      externalAccounts: [
        {
          id: "account_123",
          provider: "oauth_discord",
          providerUserId: "111111111111111111",
          externalAccountId: "external_123",
          username: "cleo",
          emailAddress: "discord@example.com",
          firstName: "Cleo",
          lastName: "Bot",
          imageUrl: "https://cdn.example.com/avatar.png",
          avatarUrl: "https://cdn.example.com/provider-avatar.png",
          approvedScopes: "identify email",
        },
      ],
      firstName: "Cleo",
      lastName: "User",
      username: "cleo-user",
      imageUrl: "https://cdn.example.com/user.png",
    }
  )
})

test("normalizeClerkUserData rejects invalid array fields", () => {
  assert.equal(
    normalizeClerkUserData({
      id: "user_123",
      email_addresses: {},
    }),
    null
  )
  assert.equal(
    normalizeClerkUserData({
      id: "user_123",
      external_accounts: [null],
    }),
    null
  )
})

test("normalizeClerkUserData rejects invalid approved scopes", () => {
  assert.equal(
    normalizeClerkUserData({
      id: "user_123",
      external_accounts: [
        {
          approved_scopes: ["identify", 123],
        },
      ],
    }),
    null
  )
  assert.equal(
    normalizeClerkUserData({
      id: "user_123",
      externalAccounts: [
        {
          approvedScopes: { scope: "identify" },
        },
      ],
    }),
    null
  )
})
