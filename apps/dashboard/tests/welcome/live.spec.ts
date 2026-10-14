import { expect, test, type Page } from "@playwright/test"

async function verify(
  page: Page,
  status: "ready" | "stale" | "unavailable" = "ready"
) {
  await expect
    .poll(() => page.evaluate(() => window.liveFixture.pending()))
    .toBeGreaterThan(0)
  await page.evaluate((status) => window.liveFixture.verify(status), status)
}

test("Live Notifications refresh is invisible, preserves edits and displays only confirmed reconnect evidence", async ({
  page,
}, testInfo) => {
  await page.goto("/live")
  await expect
    .poll(() => page.evaluate(() => window.liveFixture.pending()))
    .toBeGreaterThan(0)
  await expect(
    page.getByText("Reconnect required", { exact: true })
  ).toHaveCount(0)
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0)
  await verify(page)
  await expect(page.getByText("Ready", { exact: true })).toBeVisible()
  await page.evaluate(() => window.liveFixture.navigate(false))
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0)
  await page.evaluate(() => window.liveFixture.navigate(true))
  await expect(page.getByText("Ready", { exact: true })).toBeVisible()
  await expect(
    page.getByText(/Checking connection|Refreshing|Synchronising/)
  ).toHaveCount(0)
  const before = await page.locator("form").innerText()
  await verify(page)
  await expect.poll(() => page.locator("form").innerText()).toBe(before)
  await page.evaluate(() => window.liveFixture.updateConfig())
  await page.getByLabel("Mention").click()
  await page.getByRole("option", { name: "@everyone" }).click()
  await verify(page)
  await expect(page.getByLabel("Mention")).toContainText("everyone")
  await page.evaluate(() => {
    window.liveFixture.updateConfig()
    window.liveFixture.rejectSaves = true
  })
  await expect(page.getByText("Ready", { exact: true })).toBeVisible()
  await verify(page, "unavailable")
  await expect(page.getByText("Ready", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Save live notifications" }).click()
  await expect(
    page.getByText("Fresh provider verification rejected this save")
  ).toBeVisible()
  expect(await page.evaluate(() => window.liveFixture.saves)).toHaveLength(0)
  await page.evaluate(() => window.liveFixture.updateConfig())
  await verify(page, "stale")
  await expect(
    page.getByText("Reconnect required", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Reconnect Twitch", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("live-confirmed-reconnect.png"),
    fullPage: true,
  })
})

test("Live display survives browser refresh within the session without exposing another user's source", async ({
  page,
}) => {
  await page.goto("/live")
  await expect
    .poll(() => page.evaluate(() => window.liveFixture.pending()))
    .toBeGreaterThan(0)
  await verify(page)
  await expect(page.getByText("Ready", { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText("Ready", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Reconnect required", { exact: true })
  ).toHaveCount(0)
  await page.evaluate(() => window.liveFixture.navigate(false))
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    window.liveIdentity = "another-user"
    window.liveFixture.navigate(true)
  })
  await expect(page.getByText("Server owner", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0)
})
