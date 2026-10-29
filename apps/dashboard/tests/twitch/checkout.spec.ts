import { test, expect } from "@playwright/test"

const premium = "/dashboard/333333333333333333/premium?community"
test("a reloaded checkout resumes its saved consent and can be cancelled before changing it", async ({
  page,
}) => {
  await page.goto(`${premium}&pendingCheckout`)
  const consent = page.getByRole("switch", {
    name: "Announce support",
    exact: true,
  })
  await expect(consent).toBeChecked()
  await expect(consent).toBeDisabled()
  await page
    .getByRole("button", { name: "Resume checkout", exact: true })
    .click()
  await expect(
    page.getByText(/announcements on, Supporter role off/)
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Cancel checkout", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Continue to checkout" })
  ).toBeVisible()
  await expect(consent).toBeEnabled()
  await page.goto(`${premium}&pendingCheckout`)
  await page.getByRole("button", { name: "Cancel existing checkout" }).click()
  await expect(consent).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Continue to checkout" })
  ).toBeVisible()
})
for (const width of [1440, 375])
  test(`branded checkout displays the selected community, recurring terms and order at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(premium)
    await page.getByRole("button", { name: "Continue to checkout" }).click()
    const summary = page.getByRole("complementary", { name: "Order summary" })
    await expect(
      summary.getByText("Premium Guild", { exact: true })
    ).toBeVisible()
    await expect(
      summary.getByText("Cleo Server Premium", { exact: true })
    ).toBeVisible()
    await expect(summary.getByText("£4.99", { exact: true })).toBeVisible()
    await expect(
      page.getByText(/authorise recurring payments every month/)
    ).toBeVisible()
    await expect(
      page.getByText(/announcements off, Supporter role off/)
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`premium-checkout-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: "Subscribe · £4.99" }).click()
    await expect(
      page.getByRole("heading", { name: "Payment confirmed" })
    ).toBeVisible()
    await expect(page.getByRole("status")).toContainText(
      "after verified billing reconciliation"
    )
    await expect(page.getByRole("button", { name: /Subscribe/ })).toHaveCount(0)
  })

test("eligible wallet confirmation uses the same checkout confirmation and authenticated receipt", async ({
  page,
}) => {
  await page.goto(premium)
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await page.evaluate(() =>
    window.addEventListener("stripe-confirm-fixture", (event) => {
      if (event instanceof CustomEvent)
        document.body.dataset.confirm = JSON.stringify(event.detail)
    })
  )
  await page.getByRole("button", { name: "Pay with eligible wallet" }).click()
  await expect(
    page.getByRole("heading", { name: "Payment confirmed" })
  ).toBeVisible()
  await expect(page.locator("body")).toHaveAttribute(
    "data-confirm",
    JSON.stringify({
      redirect: "if_required",
      email: "alice@example.com",
      expressCheckoutConfirmEvent: {},
    })
  )
})

for (const [query, message] of [
  ["denyPayment", "Your payment was declined"],
  ["interruptPayment", "Payment confirmation was interrupted"],
  ["expiredCheckout", "This checkout has expired"],
] as const)
  test(`checkout ${query} is recoverable and does not report success`, async ({
    page,
  }) => {
    await page.goto(`${premium}&${query}`)
    await page.getByRole("button", { name: "Continue to checkout" }).click()
    const subscribe = page.getByRole("button", { name: "Subscribe · £4.99" })
    if (query === "expiredCheckout") await expect(subscribe).toBeDisabled()
    else await subscribe.click()
    await expect(page.getByRole("alert")).toContainText(message)
    await expect(
      page.getByRole("heading", { name: "Payment confirmed" })
    ).toHaveCount(0)
    await page.getByRole("button", { name: "Cancel checkout" }).click()
    await expect(
      page.getByRole("button", { name: "Continue to checkout" })
    ).toBeVisible()
  })

test("uncertain cancellation keeps the checkout open and a completion race checks the receipt", async ({
  page,
}) => {
  await page.goto(`${premium}&cancelError`)
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await page.getByRole("button", { name: "Cancel checkout" }).click()
  await expect(page.getByRole("alert")).toContainText("could not cancel")
  await expect(
    page.getByRole("button", { name: "Continue to checkout" })
  ).toHaveCount(0)
  await page.goto(`${premium}&completeRace`)
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await page.getByRole("button", { name: "Cancel checkout" }).click()
  await expect(
    page.getByRole("heading", { name: "Payment confirmed" })
  ).toBeVisible()
})

test("Stripe form initialization failures offer reload and cancellation", async ({
  page,
}) => {
  await page.goto(`${premium}&formError`)
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await expect(page.getByRole("alert")).toHaveText("Payment form unavailable")
  await page.getByRole("button", { name: "Reload payment form" }).click()
  await page.getByRole("button", { name: "Cancel checkout" }).click()
  await expect(
    page.getByRole("button", { name: "Continue to checkout" })
  ).toBeVisible()
})

for (const [query, message] of [
  ["asyncPayment", "Your payment is processing"],
  ["expiredCheckout", "No new payment can be made"],
  ["statusError", "We could not verify this checkout"],
] as const)
  test(`redirect return handles ${query} without granting access`, async ({
    page,
  }) => {
    await page.goto(`/dashboard/333333333333333333/checkout?community&${query}`)
    await expect(page.getByText(new RegExp(message))).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Payment confirmed" })
    ).toHaveCount(0)
    await expect(page.getByRole("link", { name: "My billing" })).toBeVisible()
    await page.getByRole("button", { name: "Refresh payment status" }).click()
    await expect(page.getByText(new RegExp(message))).toBeVisible()
  })
