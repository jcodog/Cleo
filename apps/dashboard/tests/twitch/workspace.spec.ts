import { test, expect } from "@playwright/test"

test("platform selection preserves a valid guild, collapses to the opposite platform and rejects stale guilds", async ({
  page,
}) => {
  await page.goto("/twitch/timers")
  await expect(
    page.getByRole("button", { name: "Twitch", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Discord", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/123456789012345678$/)
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await expect(
    page.getByRole("link", { name: "Open Twitch workspace" })
  ).toHaveCount(1)
  await expect(
    page.getByRole("link", { name: "Open Discord workspace" })
  ).toHaveCount(0)
  await page.getByRole("link", { name: "Open Twitch workspace" }).press("Enter")
  await expect(page).toHaveURL(/\/twitch$/)
  await expect(
    page.getByRole("link", { name: "Open Discord workspace" })
  ).toHaveAttribute("href", "/dashboard/123456789012345678")
  await page.screenshot({
    path: "test-results/twitch/collapsed-dark.png",
    fullPage: true,
  })
  await page.goto("/twitch?staleGuild")
  await page.getByRole("button", { name: "Discord", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})
test("timer messages validate, reorder with keyboard controls, save and retain locked configuration", async ({
  page,
}) => {
  await page.goto("/twitch/timers")
  await page.getByRole("button", { name: /Community links/ }).click()
  await expect(page.getByLabel("Group name")).toHaveValue("Community links")
  await page.getByRole("button", { name: "Move message 1 down" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByLabel("Message 1", { exact: true })).toHaveValue(
    "Follow the channel for the next stream"
  )
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible()
  await page.getByLabel("Interval in minutes").fill("4")
  await expect(
    page.getByRole("button", { name: "Save group", exact: true })
  ).toBeDisabled()
  await page.getByLabel("Interval in minutes").fill("15")
  await page.getByRole("button", { name: "Save group", exact: true }).click()
  await expect(page.getByText("Group saved.")).toBeVisible()
  await page.screenshot({
    path: "test-results/twitch/timers-desktop-dark.png",
    fullPage: true,
  })
  await page.goto("/twitch/timers?locked&theme=light")
  await page.getByRole("button", { name: /Community links/ }).click()
  await expect(page.getByText(/saved enablement are preserved/)).toBeVisible()
  await expect(page.getByRole("button", { name: "New group" })).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Save group", exact: true })
  ).toBeDisabled()
  await page.screenshot({
    path: "test-results/twitch/timers-locked-light.png",
    fullPage: true,
  })
})
test("mobile sidebar, dedicated editor and nine expandable alerts fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/twitch/timers")
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await expect(
    page.getByRole("button", { name: "Twitch", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Discord", exact: true }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await page.goto("/twitch/timers")
  await page.getByRole("button", { name: /Community links/ }).click()
  await expect(
    page.getByRole("navigation", { name: "Timer groups" })
  ).toBeHidden()
  await expect(
    page.getByRole("button", { name: "Back to groups" })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/twitch/timers-mobile-dark.png",
    fullPage: true,
  })
  await page.goto("/twitch/alerts?theme=light")
  await expect(page.locator("main details")).toHaveCount(9)
  await page.locator("main summary").first().click()
  await expect(
    page.getByLabel("Message", { exact: false }).first()
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/twitch/alerts-mobile-light.png",
    fullPage: true,
  })
})
