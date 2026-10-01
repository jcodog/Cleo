import assert from "node:assert/strict"
import { test } from "node:test"
import { ConvexService } from "./ConvexService"
import { httpFake, json } from "../../tests/fixtures"
test("focused event actions authenticate once and return durable dedupe plus template in one round trip", async () => {
  const requests: { path: string; args: Record<string, unknown> }[] = []
  const service = new ConvexService(
    "https://test.convex.cloud",
    "worker-secret",
    httpFake((url, init) => {
      assert.equal(url.pathname, "/api/action")
      assert.equal(init.method, "POST")
      const body = JSON.parse(String(init.body))
      requests.push(body)
      return json({
        status: "success",
        value: body.path.endsWith("reserveEvent")
          ? { duplicate: false, template: "Hello {user}" }
          : null,
      })
    })
  )
  assert.deepEqual(await service.reserve("id", "follow", "222"), {
    duplicate: false,
    template: "Hello {user}",
  })
  await service.streamOnline("stream-id", { id: "9001" })
  await service.subscriptionState("sub-id", true)
  assert.equal(requests.length, 3)
  assert.ok(
    requests.every((request) => request.args.secret === "worker-secret")
  )
  for (const response of [
    json({}, 503),
    json({ status: "error" }),
    json({ status: "success", value: {} }),
  ]) {
    await assert.rejects(
      new ConvexService(
        "https://test.convex.cloud",
        "secret",
        httpFake(() => response)
      ).reserve("id", "follow", "222")
    )
  }
})
