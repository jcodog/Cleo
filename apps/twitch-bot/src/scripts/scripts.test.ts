import assert from "node:assert/strict"
import { test } from "node:test"
import { join } from "node:path"
import { createServer } from "node:http"

import { main as runtimeMain } from "../index"
import { main as authorizeMain } from "./authorizeBot"
import { main as readinessMain } from "./checkReadiness"
import { main as smokeMain, sendSmokeMessage } from "./sendSmokeMessage"
import { createGrant } from "../grantStore"
import { writeReadiness } from "../readiness"
import {
  apiConfig,
  botToken,
  httpFake,
  json,
  runtimeEnv,
  runtimeHttp,
  validBot,
  withGrant,
} from "../../tests/fixtures"

async function withEnvironment<T>(
  env: Record<string, string | number | undefined>,
  operation: () => Promise<T>
): Promise<T> {
  const previous = { ...process.env }
  const previousFetch = globalThis.fetch
  const previousExit = process.exitCode
  const log = console.log
  const error = console.error
  console.log = () => undefined
  console.error = () => undefined
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = String(value)
    }
    process.exitCode = undefined
    return await operation()
  } finally {
    process.env = previous
    globalThis.fetch = previousFetch
    process.exitCode = previousExit
    console.log = log
    console.error = error
  }
}

test("explicit smoke uses tested grants and app token, default/override only send on invocation", async () => {
  await withGrant(async (store, directory) => {
    await store.write(createGrant(botToken, apiConfig))
    const env = runtimeEnv(store.path, join(directory, "state.json"))
    const strings = Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key, String(value)])
    )
    const sent: string[] = []
    const base = runtimeHttp()
    const http = httpFake((url, init) => {
      if (url.pathname.endsWith("messages")) {
        sent.push(JSON.parse(String(init.body)).message)
        return json({ data: [{ is_sent: true, message_id: "test-message" }] })
      }
      return base(url.href, init)
    })
    assert.equal(
      await sendSmokeMessage(strings, undefined, http),
      "test-message"
    )
    await sendSmokeMessage(strings, "custom smoke", http)
    await withEnvironment(env, async () => {
      globalThis.fetch = http
      await smokeMain([])
      assert.equal(process.exitCode, undefined)
      await smokeMain(["one", "two"])
      assert.equal(process.exitCode, 1)
    })
    assert.deepEqual(sent, [
      "dude is online.",
      "custom smoke",
      "dude is online.",
    ])
  })
})

test("readiness CLI gates PID and deployment timestamp and rejects malformed arguments", async () => {
  await withGrant(async (_store, directory) => {
    const path = join(directory, "state.json")
    await writeReadiness(path, {
      version: 1,
      pid: process.pid,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      state: "ready",
      subscriptionId: "test-sub",
    })
    await withEnvironment({}, async () => {
      await readinessMain([path, String(process.pid), "1"])
      assert.equal(process.exitCode, undefined)
      for (const args of [
        [],
        [path, "-1", "1"],
        [path, "1.5", "1"],
        [path, "1", "NaN"],
        [path, "1", "0"],
        [path, "2147483647", "1"],
        ["", "1", "1"],
      ]) {
        await readinessMain(args)
        assert.equal(process.exitCode, 1)
      }
    })
  })
})

test("runtime entry handles actual SIGTERM and SIGINT without sending and removes listeners", async () => {
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    await withGrant(async (store, directory) => {
      await store.write(createGrant(botToken, apiConfig))
      const env = runtimeEnv(store.path, join(directory, "state.json"))
      const before = process.listenerCount(signal)
      const base = runtimeHttp()
      await withEnvironment(env, async () => {
        globalThis.fetch = httpFake(async (url, init) => {
          const response = await base(url.href, init)
          if (url.pathname.endsWith("subscriptions"))
            setTimeout(() => process.emit(signal), 20)
          return response
        })
        await runtimeMain()
        assert.equal(process.exitCode, undefined)
      })
      assert.equal(process.listenerCount(signal), before)
    })
})

test("entrypoints fail closed on invalid env and never dump credentials", async () => {
  await withEnvironment(
    { TWITCH_CLIENT_ID: "", TWITCH_CLIENT_SECRET: undefined },
    async () => {
      await runtimeMain()
      assert.equal(process.exitCode, 1)
      await authorizeMain()
      assert.equal(process.exitCode, 1)
      await smokeMain([])
      assert.equal(process.exitCode, 1)
    }
  )
})

test("operator CLI completes the real local callback and saves only the expected bot", async () => {
  const realFetch = globalThis.fetch
  const listener = createServer()
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve))
  const address = listener.address()
  assert.ok(address && typeof address !== "string")
  await new Promise<void>((resolve) => listener.close(() => resolve()))
  await withGrant(async (store) => {
    await withEnvironment(
      {
        ...apiConfig,
        TWITCH_BOT_GRANT_PATH: store.path,
        TWITCH_BOT_REDIRECT_URI: `http://127.0.0.1:${address.port}/callback`,
      },
      async () => {
        globalThis.fetch = httpFake((url) =>
          json(url.pathname.endsWith("token") ? botToken : validBot)
        )
        let callback: Promise<Response> | undefined
        const originalTTY = Object.getOwnPropertyDescriptor(
          process.stdout,
          "isTTY"
        )
        Object.defineProperty(process.stdout, "isTTY", {
          configurable: true,
          value: true,
        })
        const originalWrite = process.stdout.write
        process.stdout.write = (line: string | Uint8Array) => {
          const output = String(line)
          if (output.startsWith("Open this URL")) {
            const authorization = new URL(output.trim().split("\n")[1]!)
            const url = new URL(authorization.searchParams.get("redirect_uri")!)
            url.searchParams.set(
              "state",
              authorization.searchParams.get("state")!
            )
            url.searchParams.set("code", "test-only-code")
            callback = realFetch(url)
          }
          return true
        }
        try {
          await authorizeMain()
        } finally {
          process.stdout.write = originalWrite
          if (originalTTY)
            Object.defineProperty(process.stdout, "isTTY", originalTTY)
          else Reflect.deleteProperty(process.stdout, "isTTY")
        }
        assert.equal((await callback)?.status, 200)
        assert.equal(process.exitCode, undefined)
        assert.equal((await store.read()).botUserId, "111")
      }
    )
  })
})

test("operator URL is withheld from noninteractive output with useful sanitized diagnostics", async () => {
  await withEnvironment(
    {
      ...apiConfig,
      TWITCH_BOT_REDIRECT_URI: "http://127.0.0.1:34567/callback",
    },
    async () => {
      const previous = Object.getOwnPropertyDescriptor(process.stdout, "isTTY")
      Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: false,
      })
      const lines: string[] = []
      console.error = (line: string) => {
        lines.push(line)
      }
      try {
        await authorizeMain()
        assert.equal(process.exitCode, 1)
        assert.match(lines.join(""), /interactive operator terminal/)
        assert.doesNotMatch(lines.join(""), /state=|test-only-secret/)
      } finally {
        if (previous) Object.defineProperty(process.stdout, "isTTY", previous)
        else Reflect.deleteProperty(process.stdout, "isTTY")
      }
    }
  )
})
