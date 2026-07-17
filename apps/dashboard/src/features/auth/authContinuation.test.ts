import assert from "node:assert/strict"
import test from "node:test"

import {
  getSessionTaskPath,
  partitionMissingRequirements,
} from "./authContinuation"
import { getClerkOperationError } from "./clerkOperations"

test("Clerk promise rejection becomes a readable retry error", async () => {
  assert.equal(
    await getClerkOperationError(() =>
      Promise.reject(new Error("Discord is temporarily unavailable."))
    ),
    "Discord is temporarily unavailable."
  )
})

test("Clerk returned errors and successful operations are distinguished", async () => {
  assert.equal(
    await getClerkOperationError(async () => ({
      error: { longMessage: "The Discord request expired." },
    })),
    "The Discord request expired."
  )
  assert.equal(
    await getClerkOperationError(async () => ({ error: null })),
    null
  )
})

test("configured missing requirements continue without restarting OAuth", () => {
  assert.deepEqual(
    partitionMissingRequirements(["first_name", "last_name", "legal_accepted"]),
    {
      supported: ["first_name", "last_name", "legal_accepted"],
      unsupported: [],
    }
  )
})

test("pending Clerk session tasks use dedicated continuation routes", () => {
  assert.equal(
    getSessionTaskPath("setup-mfa", "/dashboard/123"),
    "/session-tasks/setup-mfa?returnTo=%2Fdashboard%2F123"
  )
  assert.equal(getSessionTaskPath("unknown-task", "/dashboard"), null)
})
