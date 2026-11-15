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
