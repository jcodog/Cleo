import assert from "node:assert/strict"
import { test } from "node:test"
import { join } from "node:path"
import { readFile, mkdir } from "node:fs/promises"
import {
  withGrant,
  runtimeEnv,
  runtimeHttp,
  silentLogger,
  botToken,
  apiConfig,
} from "../../tests/fixtures"
import { createGrant } from "../auth/grantStore"

test("client startup, token maintenance, local health, clean shutdown and failures never query desired subscriptions", async (t) => {
  let tick: () => void = () => {}
  t.mock.module("node:timers/promises", {
    exports: {
      setTimeout: async (
        _ms: number,
        _value: unknown,
        options: { signal: AbortSignal }
      ) => {
        tick()
        if (options.signal.aborted) throw new Error("aborted")
      },
    },
  })
  const { TwitchClient } = await import("./TwitchClient")
  await withGrant(async (store, directory) => {
    await store.write(createGrant(botToken, apiConfig))
    const path = join(directory, "state.json")
    const config = { ...runtimeEnv(store.path, path), TWITCH_WEBHOOK_PORT: 0 }
    const calls: string[] = []
    const request: typeof fetch = async (input, init) => {
      calls.push(String(input))
      return runtimeHttp()(input, init)
    }
    const client = new TwitchClient(config, silentLogger, request)
    const controller = new AbortController()
    let ticks = 0
    tick = () => {
      if (++ticks === 2) controller.abort()
    }
    await client.run(controller.signal)
    assert.equal(JSON.parse(await readFile(path, "utf8")).state, "stopped")
    assert.ok(calls.every((url) => !url.includes("subscriptions")))
    assert.equal(calls.filter((url) => url.includes("convex")).length, 1)
    assert.equal(client.webhook.isListening, false)
    const failed = new TwitchClient(config, silentLogger, async () => {
      throw new Error("network")
    })
    await assert.rejects(failed.run(new AbortController().signal))
    assert.equal(JSON.parse(await readFile(path, "utf8")).state, "unhealthy")
    const interrupted = new AbortController()
    interrupted.abort()
    await new TwitchClient(config, silentLogger, request).run(
      interrupted.signal
    )
    const lost = new TwitchClient(config, silentLogger, request)
    t.mock.method(lost.webhook, "start", async () => {})
    tick = () => {}
    await assert.rejects(
      lost.run(new AbortController().signal),
      /listener unavailable/
    )
    const invalidPath = join(directory, "directory-is-not-file")
    await mkdir(invalidPath)
    const original = new Error("primary runtime exception")
    const errors: string[] = []
    const broken = new TwitchClient(
      { ...config, TWITCH_READINESS_PATH: invalidPath },
      {
        ...silentLogger,
        error: (message) => {
          errors.push(message)
        },
      },
      request
    )
    t.mock.method(broken.webhook, "stop", async () => {
      throw new Error("secondary shutdown")
    })
    // Starting readiness itself fails; neither unhealthy nor stop may mask it.
    await assert.rejects(
      broken.run(new AbortController().signal),
      (error) =>
        error instanceof Error && !error.message.includes("secondary shutdown")
    )
    assert.ok(errors.includes("Readiness update failed"))
    assert.ok(errors.includes("Webhook shutdown failed"))
    const preserving = new TwitchClient(config, silentLogger, request)
    t.mock.method(preserving.auth, "maintain", async () => {
      throw original
    })
    t.mock.method(preserving.webhook, "stop", async () => {
      throw new Error("secondary")
    })
    await assert.rejects(
      preserving.run(new AbortController().signal),
      (error) => error === original
    )
    const stoppedFailure = new AbortController()
    stoppedFailure.abort()
    await broken.run(stoppedFailure.signal)
    const aborted = new AbortController()
    let observedAbort = false
    const cancel = new TwitchClient(
      config,
      silentLogger,
      async (_url, init) => {
        aborted.abort()
        observedAbort = init?.signal?.aborted === true
        throw new Error("cancelled")
      }
    )
    await cancel.run(aborted.signal)
    assert.equal(observedAbort, true)
  })
})
