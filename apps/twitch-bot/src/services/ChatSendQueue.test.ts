import assert from "node:assert/strict"
import { test } from "node:test"
import { ChatBackpressure, ChatSendQueue } from "./ChatSendQueue"

test("default queue clock and deadline wait execute an ordinary second send", async () => {
  const queue = new ChatSendQueue()
  await queue.run("a", async (mark) => {
    mark()
    return "first"
  })
  assert.equal(await queue.run("b", async () => "second"), "second")
})

test("shared queue spaces channels and global attempts, fairly rotates and propagates failures", async () => {
  let now = 1000
  const queue = new ChatSendQueue(
    undefined,
    () => now,
    async (ms) => {
      now += ms
    }
  )
  const sent: [string, number][] = []
  const send = (channel: string) =>
    queue.run(channel, async (mark) => {
      mark()
      sent.push([channel, now])
      return channel
    })
  assert.deepEqual(await Promise.all([send("a"), send("a"), send("b")]), [
    "a",
    "a",
    "b",
  ])
  assert.deepEqual(
    sent.map(([channel]) => channel),
    ["a", "b", "a"]
  )
  assert.ok(sent[1]![1] - sent[0]![1] >= 1700)
  assert.ok(sent[2]![1] - sent[0]![1] >= 2000)
  await assert.rejects(
    queue.run("error", async () => {
      throw new Error("failure")
    }),
    /failure/
  )
  await assert.rejects(
    queue.run("error", async () => {
      throw "invalid"
    }),
    /Chat send failed/
  )
  queue.defer(now + 10000)
  await assert.rejects(send("a"), ChatBackpressure)
})

test("suppressed gates consume no global or channel HTTP pacing", async () => {
  let now = 1000
  const queue = new ChatSendQueue(
    undefined,
    () => now,
    async (ms) => {
      now += ms
    }
  )
  await queue.run("a", async () => "")
  await queue.run("a", async (mark) => {
    assert.equal(now, 1000)
    mark()
  })
  await queue.run("b", async (mark) => {
    assert.equal(now, 2700)
    mark()
  })
})
test("queue bounds global and per-channel pending work and cancels on shutdown", async () => {
  const controller = new AbortController()
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const queue = new ChatSendQueue(controller.signal)
  const first = queue.run("a", () => held)
  const work = Array.from({ length: 70 }, (_, i) =>
    queue.run(String(i), async () => {})
  )
  const results = Promise.allSettled(work)
  controller.abort()
  release()
  await first
  assert.equal(
    (await results).filter((r) => r.status === "rejected").length,
    70
  )
  await assert.rejects(
    queue.run("a", async () => {}),
    ChatBackpressure
  )
  const queue2 = new ChatSendQueue(controller.signal)
  await assert.rejects(
    queue2.run("a", async () => {}),
    ChatBackpressure
  )
  const queue3 = new ChatSendQueue(
    undefined,
    () => 0,
    async () => {
      controller.abort()
    }
  )
  const third = queue3.run("a", () => held)
  const entries = Array.from({ length: 5 }, () =>
    queue3.run("a", async () => {})
  )
  // Expire the four accepted entries without waiting on wall-clock time.
  queue3.defer(10000)
  const captured = Promise.allSettled(entries)
  Object.defineProperty(queue3, "now", { value: () => 10000 })
  await third
  assert.equal(
    (await captured).filter((r) => r.status === "rejected").length,
    5
  )
})

test("durable recovery survives initial defer while best-effort timers expire", async () => {
  let now = 1000
  const queue = new ChatSendQueue(
    undefined,
    () => now,
    async (ms) => {
      now += ms
    }
  )
  queue.defer(now + 30000)
  const timer = queue.run("timer", async () => "timer")
  const alert = queue.run(
    "alert",
    async (mark) => {
      mark()
      return "alert"
    },
    true
  )
  await assert.rejects(timer, ChatBackpressure)
  assert.equal(await alert, "alert")
  assert.ok(now >= 31000)
})

test("pacing follows the POST boundary after slow preparation for same and different channels", async () => {
  for (const channel of ["a", "b"]) {
    let now = 1000
    const queue = new ChatSendQueue(
      undefined,
      () => now,
      async (ms) => {
        now += ms
      }
    )
    const attempts: number[] = []
    await Promise.all([
      queue.run("a", async (mark) => {
        now += 10000
        mark()
        attempts.push(now)
      }),
      queue.run(
        channel,
        async (mark) => {
          mark()
          attempts.push(now)
        },
        true
      ),
    ])
    assert.ok(attempts[1]! - attempts[0]! >= (channel === "a" ? 2000 : 1700))
  }
})
