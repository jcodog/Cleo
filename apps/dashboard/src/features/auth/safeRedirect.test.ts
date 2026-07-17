import assert from "node:assert/strict"
import test from "node:test"

import { getSafeInternalPath, withReturnTo } from "./safeRedirect"

test("keeps internal paths with query strings and fragments", () => {
  assert.equal(
    getSafeInternalPath("/dashboard/server-1?tab=logs#latest"),
    "/dashboard/server-1?tab=logs#latest"
  )
})

test("rejects absolute, protocol-relative, and backslash redirects", () => {
  assert.equal(getSafeInternalPath("https://example.com/dashboard"), null)
  assert.equal(getSafeInternalPath("//example.com/dashboard"), null)
  assert.equal(getSafeInternalPath("/\\example.com/dashboard"), null)
  assert.equal(getSafeInternalPath("/%5cexample.com/dashboard"), null)
  assert.equal(getSafeInternalPath("/%2f%2fevil.example/dashboard"), null)
  assert.equal(getSafeInternalPath("/dashboard\u0000/elsewhere"), null)
})

test("builds encoded return destinations", () => {
  assert.equal(
    withReturnTo("/sign-in", "/dashboard/server-1?tab=logs"),
    "/sign-in?returnTo=%2Fdashboard%2Fserver-1%3Ftab%3Dlogs"
  )
})
