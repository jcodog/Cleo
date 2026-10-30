import { test, expect } from "@playwright/test"

const fixture = "?community&navigation&accountUI"
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"))
})
for (const width of [1440, 375]) {
  test(`hosted purchaser billing and connections remain independent of guild navigation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/account/billing${fixture}`)
    await expect(
      page.getByRole("heading", { name: "Billing and subscriptions" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Piano Club" })
    ).toBeVisible()
    await expect(page.getByText(/Cleo Server Premium · £4.99/)).toBeVisible()
    await expect(page.getByRole("combobox", { name: /server/i })).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`account-billing-${width}.png`),
      fullPage: true,
    })
    await page.goto(`/account/connections${fixture}`)
    await expect(
      page.getByRole("heading", { name: "Connected accounts" })
    ).toBeVisible()
    await expect(page.getByText("Cleo tester", { exact: true })).toBeVisible()
    await expect(page.getByText("cleo_channel", { exact: true })).toBeVisible()
    await page
      .getByRole("button", { name: "Disconnect Twitch", exact: true })
      .click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText("verified Discord sign-in will remain")
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("cleo_channel", { exact: true })).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`account-connections-${width}.png`),
      fullPage: true,
    })
  })
  test(`staff product and price tables and confirmation work at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/staff/billing/products${fixture}`)
    await expect(
      page.getByRole("table", { name: "Stripe products" })
    ).toBeVisible()
    await page
      .getByRole("textbox", { name: "Search this page" })
      .fill("missing")
    await expect(
      page.getByText("No matching entries on this page.")
    ).toBeVisible()
    await page.getByRole("textbox", { name: "Search this page" }).fill("cleo")
    await expect(
      page.getByRole("link", { name: "Cleo Server Premium" })
    ).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`staff-products-${width}.png`),
      fullPage: true,
    })
    await page.goto(`/staff/billing/products/prod_fixture${fixture}`)
    await expect(
      page.getByRole("table", { name: "Stripe prices" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Make default" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(
      "does not change the configured checkout Price"
    )
    await expect(
      dialog.getByRole("button", { name: "Confirm change" })
    ).toBeDisabled()
    await dialog
      .getByLabel("Type CONFIRM SANDBOX CHANGE")
      .fill("CONFIRM SANDBOX CHANGE")
    await expect(
      dialog.getByRole("button", { name: "Confirm change" })
    ).toBeEnabled()
    await dialog.getByRole("button", { name: "Confirm change" }).click()
    await expect(dialog).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`staff-prices-${width}.png`),
      fullPage: true,
    })
  })
  test(`Premium overview has trusted plan hierarchy and prevents duplicate purchase at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(
      `/dashboard/333333333333333333/premium?community&navigation`
    )
    await expect(
      page.getByRole("heading", { name: "Premium Guild" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Cleo Server Premium" })
    ).toBeVisible()
    await expect(page.getByText("£4.99 / month", { exact: true })).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`premium-overview-${width}.png`),
      fullPage: true,
    })
    await page.goto(
      `/dashboard/333333333333333333/premium?community&navigation&premiumActive`
    )
    await expect(
      page.getByRole("button", { name: "Continue to checkout" })
    ).toBeDisabled()
    await expect(page.getByText(/This server is already covered/)).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`premium-covered-${width}.png`),
      fullPage: true,
    })
  })
}
test("empty purchaser billing and restricted staff catalogue have intentional states", async ({
  page,
}) => {
  await page.goto(`/account/billing${fixture}&emptyBilling`)
  await expect(
    page.getByRole("heading", { name: "No subscriptions yet" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Manage billing" })
  ).toHaveCount(0)
  await page.goto(`/staff/billing/products${fixture}&nonStaff`)
  await expect(page.getByRole("alert")).toContainText("staff only")
  await expect(page.getByRole("table")).toHaveCount(0)
  await page.goto(`/staff/billing/products${fixture}&readOnly`)
  await expect(page.getByRole("table")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Review product change" })
  ).toHaveCount(0)
})
