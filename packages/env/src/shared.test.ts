import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createOptionalUrl,
  nodeEnv,
  optionalString,
  optionalUrl,
} from "./shared"

test("optionalString treats empty strings as unset", () => {
  assert.equal(optionalString.parse(""), undefined)
  assert.equal(optionalString.parse(undefined), undefined)
  assert.equal(optionalString.parse("cleo"), "cleo")
})

test("optionalUrl treats empty strings as unset and validates URLs", () => {
  assert.equal(optionalUrl.parse(""), undefined)
  assert.equal(optionalUrl.parse(undefined), undefined)
  assert.equal(
    optionalUrl.parse("https://cleo.example.com"),
    "https://cleo.example.com"
  )
  assert.equal(optionalUrl.safeParse("not-a-url").success, false)
})

test("optionalUrl allows HTTPS URLs", () => {
  assert.equal(
    createOptionalUrl({ nodeEnv: "production" }).parse(
      "https://cleo.example.com"
    ),
    "https://cleo.example.com"
  )
})

test("optionalUrl rejects invalid URLs", () => {
  assert.equal(createOptionalUrl().safeParse("not-a-url").success, false)
})

test("optionalUrl rejects external HTTP URLs", () => {
  assert.equal(
    createOptionalUrl({ nodeEnv: "development" }).safeParse(
      "http://cleo.example.com"
    ).success,
    false
  )
})

test("optionalUrl allows loopback HTTP outside production", () => {
  const previousNodeEnv = process.env.NODE_ENV

  process.env.NODE_ENV = "development"

  try {
    assert.equal(
      createOptionalUrl().parse("http://localhost:3210"),
      "http://localhost:3210"
    )
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }

  assert.equal(
    createOptionalUrl({ nodeEnv: "development" }).parse(
      "http://localhost:3210"
    ),
    "http://localhost:3210"
  )
  assert.equal(
    createOptionalUrl({ nodeEnv: "test" }).parse("http://127.0.0.1:3210"),
    "http://127.0.0.1:3210"
  )
  assert.equal(
    createOptionalUrl({ nodeEnv: "test" }).parse("http://[::1]:3210"),
    "http://[::1]:3210"
  )
})

test("optionalUrl defaults unknown runtime environments to development", () => {
  assert.equal(
    createOptionalUrl({ nodeEnv: () => "preview" }).parse(
      "http://localhost:3210"
    ),
    "http://localhost:3210"
  )
})

test("optionalUrl rejects loopback HTTP in production", () => {
  assert.equal(
    createOptionalUrl({ nodeEnv: "production" }).safeParse(
      "http://localhost:3210"
    ).success,
    false
  )
})

test("nodeEnv defaults to development and accepts known environments", () => {
  assert.equal(nodeEnv.parse(undefined), "development")
  assert.equal(nodeEnv.parse("test"), "test")
  assert.equal(nodeEnv.parse("production"), "production")
  assert.equal(nodeEnv.safeParse("staging").success, false)
})

test("optional server env modules load without credentials", async () => {
  const [
    { backendEnv },
    { discordEnv },
    { kickEnv },
    { dashboardEnv },
    { webEnv },
  ] =
    await Promise.all([
      import("./backend"),
      import("./discord"),
      import("./kick"),
      import("./dashboard"),
      import("./web"),
    ])

  assert.ok("DISCORD_BOT_TOKEN" in backendEnv)
  assert.ok("DISCORD_TEST_GUILD_ID" in discordEnv)
  assert.ok("KICK_CLIENT_SECRET" in kickEnv)
  assert.ok("NEXT_PUBLIC_CONVEX_URL" in dashboardEnv)
  assert.equal(webEnv, dashboardEnv)
})

test("wsEnv defaults the websocket port without credentials", async () => {
  const previousPort = process.env.PORT

  delete process.env.PORT

  try {
    const { wsEnv } = await import("./ws")

    assert.equal(wsEnv.PORT, 3001)
  } finally {
    if (previousPort === undefined) {
      delete process.env.PORT
    } else {
      process.env.PORT = previousPort
    }
  }
})
