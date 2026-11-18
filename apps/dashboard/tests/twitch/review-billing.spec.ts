import { test, expect } from "@playwright/test"

test("unfinished setup recovery clears a terminal attempt rather than retaining a permanent retry", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "cleo:billing-setup:fixture-clerk:fixture-session",
      "seti_fixture"
    )
  )
  await page.goto(
    "/billing?community&navigation&accountUI&emptyBilling&setupFailed"
  )
  await expect(
    page.getByText("Payment setup was not completed. Please try again.")
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Check payment setup status" })
  ).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("cleo:billing-setup:fixture-clerk:fixture-session")
    )
  ).toBeNull()
})

test("uncertain catalogue writes retain the same request and key through dismissal, changed forms and reload", async ({
  page,
}) => {
  await page.goto(
    "/staff/billing/products?community&navigation&accountUI&uncertainCatalogue"
  )
  await page.getByLabel("Name", { exact: true }).fill("Retry fixture product")
  await page
    .getByLabel("Description", { exact: true })
    .fill("No real provider call")
  await page.getByRole("button", { name: "Review product change" }).click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByLabel("Type CONFIRM SANDBOX CHANGE")
    .fill("CONFIRM SANDBOX CHANGE")
  await dialog.getByRole("button", { name: "Confirm change" }).click()
  await expect(dialog.getByRole("alert")).toContainText(
    "Uncertain catalogue response"
  )
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (name) =>
        name.startsWith("cleo:catalogue-operation:") &&
        name.endsWith(":fixture-clerk")
    )
    return key ? localStorage.getItem(key) : null
  })
  expect(stored).toBeTruthy()
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await page.getByLabel("Name", { exact: true }).fill("A different request")
  await page.getByRole("button", { name: "Review product change" }).click()
  await expect(dialog).toContainText("Retry fixture product")
  await expect(dialog).not.toContainText("A different request")
  await page.reload()
  await page.getByRole("button", { name: "Resume recorded change" }).click()
  await dialog
    .getByLabel("Type CONFIRM SANDBOX CHANGE")
    .fill("CONFIRM SANDBOX CHANGE")
  await dialog.getByRole("button", { name: "Confirm change" }).click()
  await expect(dialog.getByRole("alert")).toContainText(
    "Uncertain catalogue response"
  )
  const retry = JSON.parse(
    (await page.evaluate(() =>
      sessionStorage.getItem("catalogue-fixture-attempt")
    )) ?? "null"
  )
  const original = JSON.parse(stored!)
  expect(retry.key).toBe(original.key)
  expect(retry.request).toBe(original.request)
})

test("an invalid yearly price never enters catalogue recovery", async ({
  page,
}) => {
  await page.goto(
    "/staff/billing/products/prod_fixture?community&navigation&accountUI&ineligiblePrice"
  )
  const prices = page.getByRole("table", { name: "Stripe prices" })
  const oneTime = prices.getByRole("row").filter({ hasText: "One time" })
  await expect(oneTime).toBeVisible()
  await expect(
    oneTime.getByRole("button", { name: "Map Premium" })
  ).toHaveCount(0)
  await expect(
    prices
      .getByRole("row")
      .filter({ hasText: "Every 1 year" })
      .getByRole("button", { name: "Map Premium" })
  ).toBeVisible()
  await page.getByLabel("Amount in minor units").fill("499")
  await page
    .getByRole("combobox", { name: /Billing period/ })
    .selectOption("year")
  await page.getByLabel("Interval count").fill("4")
  await page.getByRole("button", { name: "Review new price" }).click()
  await expect(page.getByRole("alert")).toContainText(
    "Recurring periods cannot exceed three years"
  )
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        key.startsWith("cleo:catalogue-operation:")
      )
    )
  ).toBe(false)
})

test("two tabs keep the same uncertain catalogue operation", async ({
  page,
  context,
}) => {
  const other = await context.newPage()
  const path =
    "/staff/billing/products?community&navigation&accountUI&uncertainCatalogue"
  await Promise.all([page.goto(path), other.goto(path)])
  for (const [tab, name] of [
    [page, "First tab"],
    [other, "Second tab"],
  ] as const) {
    await tab.getByLabel("Name", { exact: true }).fill(name)
    await tab.getByRole("button", { name: "Review product change" }).click()
    await tab
      .getByRole("dialog")
      .getByLabel("Type CONFIRM SANDBOX CHANGE")
      .fill("CONFIRM SANDBOX CHANGE")
  }
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm change" })
    .click()
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Uncertain catalogue response"
  )
  await expect(other.getByRole("dialog")).toContainText("First tab")
  await expect(
    other.getByRole("dialog").getByRole("button", { name: "Confirm change" })
  ).toBeDisabled()
  await other
    .getByRole("dialog")
    .getByLabel("Type CONFIRM SANDBOX CHANGE")
    .fill("CONFIRM SANDBOX CHANGE")
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm change" })
    .click()
  await expect(other.getByRole("dialog").getByRole("alert")).toContainText(
    "Uncertain catalogue response"
  )
  const attempt = (tab: typeof page) =>
    tab.evaluate(() => {
      const operation = JSON.parse(
        sessionStorage.getItem("catalogue-fixture-attempt") ?? "null"
      )
      return { key: operation?.key, request: operation?.request }
    })
  expect(await attempt(other)).toEqual(await attempt(page))
})

test("a slow older setup status cannot clear the newer processing setup", async ({
  page,
}) => {
  const storageKey = "cleo:billing-setup:fixture-clerk:fixture-session"
  await page.addInitScript(
    (key) => sessionStorage.setItem(key, "seti_previous"),
    storageKey
  )
  await page.goto(
    "/billing?community&navigation&accountUI&emptyBilling&setupRace&setupProcessing"
  )
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("setup-fixture-previous-waiting")
      )
    )
    .toBe("true")
  await page
    .getByRole("button", { name: "Add payment method", exact: true })
    .click()
  const setup = page.getByRole("dialog", { name: "Update payment method" })
  await setup.getByRole("button", { name: "Save payment method" }).click()
  await expect(setup).toHaveCount(0)
  const check = page.getByRole("button", { name: "Check payment setup status" })
  await expect(check).toBeVisible()
  await page.evaluate(async () => {
    window.dispatchEvent(new Event("resolve-previous-setup"))
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
  })
  await expect(check).toBeVisible()
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), storageKey)
  ).toBe("seti_fixture")
})

test("subscriptions show each price and a fallback when plan information is unavailable", async ({
  page,
}) => {
  const billing = "/billing?community&navigation&accountUI"
  await page.goto(billing + "&multiplePlans")
  await expect(
    page.getByText("Cleo Server Premium · £4.99 / month")
  ).toBeVisible()
  await expect(page.getByText("Storage add-on · £5.00 / month")).toBeVisible()
  await page.goto(billing + "&hidePlans")
  await expect(
    page.getByText("Plan information unavailable", { exact: true })
  ).toBeVisible()
})

test("a successful profile reload clears the earlier failure after payment setup recovery", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "cleo:billing-setup:fixture-clerk:fixture-session",
      "seti_fixture"
    )
  )
  await page.goto(
    "/billing?community&navigation&accountUI&emptyBilling&failFirstProfile"
  )
  await expect(
    page.getByText("Payment method saved as your default.")
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "No subscriptions yet" })
  ).toBeVisible()
  await expect(
    page.getByText("Subscription details could not be loaded.", {
      exact: false,
    })
  ).toHaveCount(0)
})

test("rejected catalogue operations show their terminal status without a retry action", async ({
  page,
}) => {
  await page.goto(
    "/staff/billing/products?community&navigation&accountUI&rejectedCatalogueHistory"
  )
  const operation = page
    .getByRole("listitem")
    .filter({ hasText: '"currency":"zzz"' })
  await expect(operation.getByText(/^Rejected ·/)).toBeVisible()
  await expect(
    operation.getByRole("button", { name: "Retry recorded operation" })
  ).toHaveCount(0)
})
