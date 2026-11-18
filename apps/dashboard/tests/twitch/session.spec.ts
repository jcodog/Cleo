import { test, expect } from "@playwright/test"

for (const width of [1440, 375])
  test(`rejected sessions recover without protected content or runtime errors at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("/dashboard?community&sessionRecovery")
    await expect(
      page.getByRole("heading", { name: "Reconnect your session" })
    ).toBeVisible()
    await page.evaluate(() =>
      window.addEventListener("router-refresh-fixture", () => {
        document.body.dataset.refreshed = "true"
      })
    )
    await page.evaluate(() =>
      window.addEventListener("token-fixture", (event) => {
        if (event instanceof CustomEvent)
          document.body.dataset.tokenOptions = JSON.stringify(event.detail)
      })
    )
    await page.getByRole("button", { name: "Retry session" }).click()
    await expect(page.locator("body")).toHaveAttribute(
      "data-token-options",
      JSON.stringify({ skipCache: true, template: "convex" })
    )
    await expect
      .poll(() => page.locator("body").getAttribute("data-refreshed"))
      .toBe("true")
    await expect(page.getByRole("link", { name: "Premium Guild" })).toHaveCount(
      0
    )
    await page.screenshot({
      path: info.outputPath(`session-recovery-${width}.png`),
      fullPage: true,
    })
    expect(errors).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  })

test("failed session refresh is recoverable and sign-in preserves only a safe return path", async ({
  page,
}) => {
  await page.goto("/dashboard?community&sessionRecovery&failSession")
  await page.getByRole("button", { name: "Retry session" }).click()
  await expect(page.getByRole("status")).toHaveText(/could not be refreshed/)
  await page.evaluate(() =>
    window.addEventListener("signout-fixture", (event) => {
      if (event instanceof CustomEvent)
        document.body.dataset.signout = JSON.stringify(event.detail)
    })
  )
  await page.getByRole("button", { name: "Sign in again" }).click()
  await expect
    .poll(async () =>
      JSON.parse(
        (await page.locator("body").getAttribute("data-signout")) ?? "null"
      )
    )
    .toEqual({
      sessionId: "fixture-session",
      redirectUrl:
        "/sign-in?returnTo=%2Fdashboard%2F333333333333333333%2Fwelcome",
    })
})
