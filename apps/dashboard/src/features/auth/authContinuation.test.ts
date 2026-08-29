import assert from "node:assert/strict"
import test from "node:test"

import {
  SIGN_IN_DEFAULT_RETURN_TO,
  SIGN_UP_DEFAULT_RETURN_TO,
  createMissingRequirementFormState,
  getSessionTaskPath,
  getSessionTaskReturnTo,
  keepMissingRequirementValidationError,
  partitionMissingRequirements,
} from "./authContinuation"
import { getClerkOperationError, resetClerkAttempts } from "./clerkOperations"

test("returning sign-ins and new sign-ups use different default destinations", () => {
  assert.equal(SIGN_IN_DEFAULT_RETURN_TO, "/dashboard")
  assert.equal(SIGN_UP_DEFAULT_RETURN_TO, "/onboarding")
})

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

test("configured profile requirements continue without restarting OAuth", () => {
  assert.deepEqual(
    partitionMissingRequirements(["first_name", "last_name", "username"]),
    {
      supported: ["first_name", "last_name", "username"],
      unsupported: [],
    }
  )
})

test("legal acceptance stays unsupported until reviewed policy surfaces exist", () => {
  assert.deepEqual(partitionMissingRequirements(["legal_accepted"]), {
    supported: [],
    unsupported: ["legal_accepted"],
  })
})

test("requirement validation errors preserve fields and entered values", () => {
  const form = createMissingRequirementFormState(["first_name", "username"], {
    firstName: "Jason",
    lastName: "",
    username: "existing-name",
  })

  assert.deepEqual(
    keepMissingRequirementValidationError(
      form,
      "That username is unavailable."
    ),
    {
      errorMessage: "That username is unavailable.",
      fields: ["first_name", "username"],
      unsupportedFields: [],
      values: {
        firstName: "Jason",
        lastName: "",
        username: "existing-name",
      },
    }
  )
})

test("Clerk retry navigates only after both resets succeed", async () => {
  assert.equal(
    await resetClerkAttempts(
      async () => ({ error: null }),
      async () => ({ error: null })
    ),
    null
  )
})

test("Clerk retry retains a sign-in reset error", async () => {
  assert.equal(
    await resetClerkAttempts(
      async () => ({ error: { message: "Sign-in reset failed." } }),
      async () => ({ error: null })
    ),
    "Sign-in reset failed."
  )
})

test("Clerk retry retains a sign-up reset error", async () => {
  assert.equal(
    await resetClerkAttempts(
      async () => ({ error: null }),
      async () => ({ error: { message: "Sign-up reset failed." } })
    ),
    "Sign-up reset failed."
  )
})

test("Clerk retry retains rejected reset operations", async () => {
  for (const rejectSignIn of [true, false]) {
    assert.equal(
      await resetClerkAttempts(
        rejectSignIn
          ? () => Promise.reject(new Error("Reset rejected."))
          : async () => ({ error: null }),
        rejectSignIn
          ? async () => ({ error: null })
          : () => Promise.reject(new Error("Reset rejected."))
      ),
      "Reset rejected."
    )
  }
})

test("pending Clerk session tasks use dedicated continuation routes", () => {
  assert.equal(
    getSessionTaskPath("setup-mfa", "/dashboard/123"),
    "/session-tasks/setup-mfa?returnTo=%2Fdashboard%2F123"
  )
  assert.equal(getSessionTaskPath("unknown-task", "/dashboard"), null)
  assert.equal(getSessionTaskReturnTo("/dashboard/123"), "/dashboard/123")
  assert.equal(getSessionTaskReturnTo("https://evil.example"), "/onboarding")
})
