import { expect, test } from "@playwright/test"
import { FREE_WELCOME_STYLE } from "@workspace/shared/welcomeCard"

test("non-Premium guilds keep free welcome settings and never see the studio", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("button", { name: "Save free settings" })
  ).toBeVisible()
  await expect(page.getByRole("radio")).toHaveCount(0)
  await expect(page.locator("canvas")).toHaveCount(0)
  await expect(page.getByText(/Premium/)).toHaveCount(0)
  await page.getByLabel("Card subtext").fill("Free hello 👋🏽")
  await page.getByRole("button", { name: "Save free settings" }).click()
  await expect(page.getByRole("status")).toHaveText(
    "Free welcome settings saved."
  )
  expect(await page.evaluate(() => window.welcomeTestSaves)).toEqual([
    {
      discordGuildId: "123456789012345678",
      modules: { welcomeEnabled: true },
      channels: { welcomeChannelId: "234567890123456789" },
      welcome: { subtext: "Free hello 👋🏽", style: FREE_WELCOME_STYLE },
    },
  ])
})

test("Premium fixture supports keyboard designs, palettes, validation and free-only saves", async ({
  page,
}, testInfo) => {
  await page.goto("/?guild=premium")
  const preview = page.getByRole("complementary", {
    name: "Live welcome-card preview",
  })
  await expect(preview.getByRole("status")).toHaveText(
    "Preview updated. No message will be sent."
  )
  await page.getByRole("radio", { name: "Cleo Classic", exact: true }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(
    page.getByRole("radio", { name: "Aurora", exact: true })
  ).toBeChecked()
  const orchid = page.getByRole("radio", { name: "Orchid palette" })
  await orchid.locator("..").click()
  await expect(orchid).toBeChecked()
  await page
    .getByLabel("Greeting", { exact: true })
    .fill("Hi {member} in {server} 👋🏽")
  const centre = page.getByRole("radio", { name: "Align centre" })
  await centre.locator("..").click()
  await expect(centre).toBeChecked()
  await preview.getByLabel("Try a member name").fill("🇬🇧 Family 👨‍👩‍👧‍👦")
  await expect(preview.getByRole("img")).toHaveAttribute(
    "aria-label",
    /Hi 🇬🇧 Family 👨‍👩‍👧‍👦 in Cleo HQ 🇬🇧 👋🏽/
  )
  expect(
    await page.evaluate(() =>
      window.welcomeImageDraws.some(
        (draw) =>
          draw.source.endsWith("/emoji/1f44b-1f3fd.svg") && draw.width > 0
      )
    )
  ).toBe(true)
  expect(await page.locator("pre").count()).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath("studio-desktop.png"),
    fullPage: true,
  })
  await page.getByLabel("Greeting", { exact: true }).fill("Hi {unknown}")
  await expect(page.getByLabel("Greeting", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true"
  )
  await expect(preview.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Welcome card preview unavailable"
  )
  await page.getByRole("button", { name: "Save free settings" }).click()
  await expect(
    page.getByText(
      "Free welcome settings saved. Preview styling has not been saved."
    )
  ).toBeVisible()
  const saves = await page.evaluate(() => window.welcomeTestSaves)
  expect(saves).toHaveLength(1)
  expect(saves[0]).toEqual({
    discordGuildId: "123456789012345678",
    modules: { welcomeEnabled: true },
    channels: { welcomeChannelId: "234567890123456789" },
    welcome: { subtext: "Hello 👩🏾‍💻 🇬🇧", style: FREE_WELCOME_STYLE },
  })
  await page.getByRole("button", { name: "Reset to free design" }).click()
  await expect(
    page.getByRole("radio", { name: "Cleo Classic", exact: true })
  ).toBeChecked()
  await expect(page.getByLabel("Greeting", { exact: true })).toHaveValue(
    "Welcome, {member}"
  )
  await expect(preview.getByRole("status")).toHaveText(
    "Preview updated. No message will be sent."
  )
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await preview.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath("studio-mobile.png"),
    fullPage: true,
  })
})

test("missing local artwork reports unavailable and a later edit can recover", async ({
  page,
}) => {
  await page.route("**/emoji/1f44b-1f3fd.svg", (route) => route.abort())
  await page.goto("/?guild=premium")
  const preview = page.getByRole("complementary", {
    name: "Live welcome-card preview",
  })
  await expect(preview.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Welcome card preview unavailable"
  )
  await expect(preview.getByRole("status")).toContainText("Preview unavailable")
  await page.unroute("**/emoji/1f44b-1f3fd.svg")
  await preview.getByLabel("Try a member name").fill("Recovered 👋🏽")
  await expect(preview.getByRole("img")).toHaveAttribute(
    "aria-label",
    /Recovered 👋🏽/
  )
})

test("rapid member edits abort stale image work and unavailable custom emoji remain readable", async ({
  page,
}) => {
  await page.route("https://cdn.discordapp.com/emojis/**", (route) =>
    route.abort()
  )
  await page.goto("/?guild=premium")
  const preview = page.getByRole("complementary", {
    name: "Live welcome-card preview",
  })
  await expect(preview.getByRole("status")).toHaveText(
    "Preview updated. No message will be sent."
  )
  await page
    .getByLabel("Card subtext")
    .fill("Hello <:wave:123456789012345678> friend")
  await preview.getByLabel("Try a member name").fill("First 👩🏾‍💻")
  await preview.getByLabel("Try a member name").fill("Final 🇬🇧")
  await expect(preview.getByRole("img")).toHaveAttribute(
    "aria-label",
    /Final 🇬🇧.*Hello/
  )
  await expect(preview.getByRole("status")).toHaveText(
    "Preview updated. No message will be sent."
  )
  await page.goto("/")
  await expect(page.locator("canvas")).toHaveCount(0)
})
