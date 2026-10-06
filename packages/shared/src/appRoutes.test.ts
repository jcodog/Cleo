import assert from "node:assert/strict"
import { test } from "node:test"
import {
  isProtectedAppPath,
  isLegacyAppPath,
  legacyAppRedirect,
} from "./appRoutes"

test("legacy app classification respects route segment boundaries and leaves public pages on the site", () => {
  for (const path of [
    "/dashboard",
    "/dashboard/123/logs",
    "/onboarding",
    "/twitch/link-callback",
    "/kick",
    "/staff/support-tickets",
    "/account",
    "/settings",
    "/billing",
    "/subscription",
  ]) {
    assert.equal(isProtectedAppPath(path), true, path)
    assert.equal(isLegacyAppPath(path), true, path)
  }
  for (const path of [
    "/sign-in",
    "/sign-up/continue",
    "/sso-callback",
    "/session-tasks/setup-mfa",
  ]) {
    assert.equal(isProtectedAppPath(path), false, path)
    assert.equal(isLegacyAppPath(path), true, path)
  }
  for (const path of [
    "/",
    "/product",
    "/features",
    "/pricing",
    "/privacy",
    "/legal",
    "/cookies",
    "/refunds",
    "/trust",
    "/releases",
    "/dashboard-guide",
    "/staffing",
    "/sign-in-help",
  ]) {
    assert.equal(isLegacyAppPath(path), false, path)
    assert.equal(
      legacyAppRedirect(
        `https://cleoai.cloud${path}`,
        "https://app.cleoai.cloud"
      ),
      null,
      path
    )
  }
})

test("legacy redirects preserve full paths and queries without allowing query-controlled destinations", () => {
  const path =
    "/dashboard/123/logs?tag=a&tag=b&returnTo=https%3A%2F%2Fevil.example&value=%2F%26+space"
  assert.equal(
    legacyAppRedirect(`https://cleoai.cloud${path}`, "https://app.cleoai.cloud")
      ?.href,
    `https://app.cleoai.cloud${path}`
  )
  assert.equal(
    legacyAppRedirect(
      "http://localhost:3001/twitch?tab=bot",
      "http://localhost:3000"
    )?.href,
    "http://localhost:3000/twitch?tab=bot"
  )
  assert.equal(
    legacyAppRedirect(
      "https://landing-preview.vercel.app/sign-in?returnTo=%2Fstaff",
      "https://dashboard-preview.vercel.app"
    )?.href,
    "https://dashboard-preview.vercel.app/sign-in?returnTo=%2Fstaff"
  )
})
