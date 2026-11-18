import { test, expect } from "@playwright/test"

const fixture = "?community&navigation&accountUI"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"))
})

for (const width of [1440, 375]) {
  test(`billing portal shows masked default method, details and invoices at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/billing/payment-details${fixture}`)
    await expect(
      page.getByRole("img", { name: /visa card ending 4242/ })
    ).toBeVisible()
    await expect(
      page.getByText("billing@example.com", { exact: true })
    ).toBeVisible()
    await expect(page.getByText("1 Test Street", { exact: true })).toBeVisible()
    await expect(
      page.getByRole("table", { name: "Billing invoices" })
    ).toHaveCount(0)
    await expect(page.getByText("Billing connection details")).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`billing-portal-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: /1 other payment method/ }).click()
    const dialog = page.getByRole("dialog", { name: "Saved payment methods" })
    await expect(dialog).toContainText("mastercard card •••• 4444")
    await dialog.getByRole("button", { name: "Make default" }).click()
    await expect(dialog.getByRole("status")).toContainText(
      "Default payment method updated"
    )
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("img", { name: /mastercard card ending 4444/ })
    ).toBeVisible()
    await page.getByRole("button", { name: /1 other payment method/ }).click()
    await dialog
      .getByRole("button", { name: "Remove", exact: true })
      .first()
      .click()
    await expect(
      dialog.getByRole("button", { name: "Continue in Stripe" })
    ).toBeEnabled()
    await expect(
      dialog.getByText(/protect|subscription defaults/)
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Confirm removal" })
    ).toHaveCount(0)
    await page.goto(`/billing/invoices${fixture}`)
    await expect(
      page.getByRole("table", { name: "Billing invoices" })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Download invoice CLEO-001" })
    ).toHaveAttribute("href", "https://pay.stripe.com/invoice/fixture/pdf")
    await expect(
      page.getByRole("img", { name: /visa card ending/ })
    ).toHaveCount(0)
    await page.screenshot({
      path: info.outputPath(`billing-invoices-${width}.png`),
      fullPage: true,
    })
  })
}

test("Elements saves a method without granting subscriptions and handles cancellation", async ({
  page,
}) => {
  await page.goto(`/billing/payment-details${fixture}&emptyBilling`)
  await page
    .getByRole("button", { name: "Add payment method", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Update payment method" })
  await expect(dialog.getByLabel("Stripe payment collection")).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText("No payment method saved")).toBeVisible()
  await page
    .getByRole("button", { name: "Add payment method", exact: true })
    .click()
  await dialog.getByRole("button", { name: "Save payment method" }).click()
  await expect(
    page.getByRole("img", { name: /visa card ending 1111/ })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "No subscriptions yet" })
  ).toHaveCount(0)
})

test("declined setup and method changes stay recoverable inside their dialogs", async ({
  page,
}) => {
  await page.goto(
    `/billing/payment-details${fixture}&denySetup&failMethodChange`
  )
  await page.getByRole("button", { name: "Update", exact: true }).click()
  const setup = page.getByRole("dialog", { name: "Update payment method" })
  await setup.getByRole("button", { name: "Save payment method" }).click()
  await expect(setup.getByRole("alert")).toContainText(
    "could not be authorised"
  )
  await expect(
    setup.getByRole("button", { name: "Save payment method" })
  ).toBeEnabled()
  await setup.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.getByRole("button", { name: /1 other payment method/ }).click()
  const methods = page.getByRole("dialog", { name: "Saved payment methods" })
  await methods.getByRole("button", { name: "Make default" }).click()
  await expect(methods.getByRole("status")).toContainText(
    "could not be updated"
  )
  await expect(
    methods.getByRole("button", { name: "Make default" })
  ).toBeEnabled()
})

test("async return strips its secret and checks server status without granting Premium", async ({
  page,
}) => {
  await page.goto(
    `/billing/payment-details${fixture}&emptyBilling&setupProcessing&setup_intent=seti_fixture&setup_intent_client_secret=never-retain-this&redirect_status=succeeded`
  )
  await expect(
    page.getByText("Your bank is still confirming the payment method.", {
      exact: true,
    })
  ).toBeVisible()
  expect(page.url()).not.toContain("setup_intent_client_secret")
  expect(page.url()).not.toContain("redirect_status")
  await page.getByRole("button", { name: "Check payment setup status" }).click()
  await expect(page.getByRole("img", { name: /card ending/ })).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "No subscriptions yet" })
  ).toHaveCount(0)
})

test("Stripe failure preserves verified subscription history and retry controls", async ({
  page,
}) => {
  await page.goto(`/billing/payment-details${fixture}&failBillingProfile`)
  await expect(page.getByRole("alert")).toContainText(
    "Payment details could not be loaded from Stripe"
  )
  await expect(
    page.getByRole("button", { name: "Retry payment details" })
  ).toBeVisible()
  await page.goto(`/billing${fixture}&failBillingProfile`)
  await expect(page.getByRole("heading", { name: "Piano Club" })).toBeVisible()
  await expect(page.getByText("No payment method saved")).toHaveCount(0)
})

test("invoices recover after a failed profile request", async ({ page }) => {
  await page.goto(`/billing/invoices${fixture}&failBillingProfile`)
  await expect(
    page.getByText("Invoices could not be loaded. Please try again.")
  ).toBeVisible()
  await page.evaluate(() => {
    const url = new URL(location.href)
    url.searchParams.delete("failBillingProfile")
    history.replaceState(null, "", url)
  })
  await page.getByRole("button", { name: "Retry invoices" }).click()
  await expect(
    page.getByRole("table", { name: "Billing invoices" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Retry invoices" })
  ).toHaveCount(0)
})

test("a failed refresh clears stale payment details before retry", async ({
  page,
}) => {
  await page.goto(`/billing/payment-details${fixture}&failBillingRefresh`)
  await page.getByRole("button", { name: /1 other payment method/ }).click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Make default" })
    .click()
  await expect(page.getByRole("alert")).toContainText(
    "Payment details could not be loaded"
  )
  await expect(page.getByRole("img", { name: /card ending/ })).toHaveCount(0)
  await page.getByRole("button", { name: "Retry payment details" }).click()
  await expect(
    page.getByRole("dialog", { name: "Saved payment methods" })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("img", { name: /mastercard card ending 4444/ })
  ).toBeVisible()
})

test("billing identity is edited through Stripe Address Element without changing subscriptions", async ({
  page,
}) => {
  await page.goto(`/billing/payment-details${fixture}`)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Billing details" })
  await expect(
    dialog.getByLabel("Stripe billing address collection")
  ).toBeVisible()
  await dialog
    .getByRole("textbox", { name: "Billing email" })
    .fill("updated@example.com")
  await dialog.getByRole("button", { name: "Save billing details" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByText("updated@example.com", { exact: true })
  ).toBeVisible()
  await expect(page.getByText("Test Billing", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Piano Club" })).toHaveCount(0)
})

test("SDK unavailability leaves an accessible cancellable form rather than an indefinite disabled form", async ({
  page,
}) => {
  await page.goto(`/billing/payment-details${fixture}&stripeUnavailable`)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Billing details" })
  await expect(dialog.getByRole("alert")).toContainText(
    "Secure address collection is unavailable"
  )
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Payment details" })
  ).toBeVisible()
})
