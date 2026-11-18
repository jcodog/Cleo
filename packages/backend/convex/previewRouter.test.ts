import assert from "node:assert/strict"
import { test } from "node:test"
import { createWebhookRouter } from "./http"

test("stamped previews expose no provider webhook consumers; regular deployments retain all three", () => {
  assert.deepEqual(createWebhookRouter(true).getRoutes(), [])
  const routes = createWebhookRouter(false).getRoutes()
  assert.deepEqual(
    routes.map(([path, method]) => [path, method]),
    [
      ["/clerk-users-webhook", "POST"],
      ["/discord-application-webhook", "POST"],
      ["/stripe-community-webhook", "POST"],
    ]
  )
})
