import { test, expect } from "@playwright/test"

for (const saved of ["333333333333333333", "999999999999999999"])
  test(`dashboard entry resumes authorised saved or recent server: ${saved}`, async ({
    page,
  }) => {
    await page.goto(`/dashboard?community&navigation&savedServer=${saved}`)
    await expect(page).toHaveURL(
      new RegExp(
        `/dashboard/${saved.startsWith("333") ? saved : "444444444444444444"}$`
      )
    )
  })

test("entry waits for verification, empty accounts open the directory, and server search works", async ({
  page,
}) => {
  await page.goto("/dashboard?community&navigation&pendingDirectory")
  await expect(page.getByText("Checking your Discord servers…")).toBeVisible()
  await expect(page).toHaveURL(/pendingDirectory/)
  await page.goto("/dashboard?community&navigation&emptyDirectory")
  await expect(page).toHaveURL(/\/dashboard\/servers$/)
  await page.goto("/dashboard/servers?community&navigation")
  await page.getByRole("searchbox", { name: "Find a server" }).fill("second")
  await expect(
    page.getByRole("link").filter({ hasText: "Second server" })
  ).toBeVisible()
  await expect(
    page.getByRole("link").filter({ hasText: "Cleo community" })
  ).toHaveCount(0)
})

for (const width of [1440, 375])
  test(`guild navigation, Premium and permission gaps stay stable at ${width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem("theme", "dark"))
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/dashboard/servers?community&navigation")
    await expect(
      page.getByRole("heading", { name: "Servers", exact: true })
    ).toBeVisible()
    await page.getByRole("link").filter({ hasText: "Cleo community" }).click()
    await expect(page).toHaveURL(/\/dashboard\/333333333333333333$/)
    if (width < 768)
      await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await page.getByRole("link", { name: "Premium Guild", exact: true }).click()
    if (width < 768) await page.keyboard.press("Escape")
    await expect(
      page.getByRole("heading", { name: "Server subscription" })
    ).toBeVisible()
    await expect(
      page.getByText("No active Premium", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Manage my Stripe billing" })
    ).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: "My billing", exact: true }).last()
    ).toHaveAttribute("href", "/account/billing")
    const premiumUrl = page.url()
    for (const status of ["pending", "unavailable", "expired", "ready"]) {
      await page.evaluate(
        (status) =>
          window.dispatchEvent(
            new CustomEvent("directory-fixture", { detail: { status } })
          ),
        status
      )
      await expect(page).toHaveURL(premiumUrl)
      await expect(
        page.getByRole("heading", { name: "Server subscription" })
      ).toBeVisible()
    }
    if (width < 768)
      await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await page.getByRole("button", { name: "Select Discord guild" }).click()
    await page.getByRole("menuitem", { name: "Second server" }).click()
    if (width < 768) await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/\/dashboard\/444444444444444444\/premium$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard\/333333333333333333\/premium$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/dashboard\/444444444444444444\/premium$/)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`premium-${width}.png`),
      fullPage: true,
    })
    expect(errors).toEqual([])
  })

test("directory survives slow verification, removes revoked servers and keeps absent deep links in place", async ({
  page,
}) => {
  await page.goto("/dashboard/servers?community&navigation")
  const servers = page.getByRole("link").filter({ hasText: "Cleo community" })
  await expect(servers).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("directory-fixture", { detail: { status: "pending" } })
    )
  )
  await expect(servers).toBeVisible()
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Verifying Discord permissions" })
  ).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("directory-fixture", {
        detail: { status: "ready", removed: true },
      })
    )
  )
  await expect(servers).toHaveCount(0)
  await page.goto("/dashboard/999999999999999999?community&navigation")
  await expect(
    page.getByRole("heading", { name: "Server overview" })
  ).toBeVisible()
  await expect(page).toHaveURL(
    /\/dashboard\/999999999999999999\?community&navigation$/
  )
})

test("legacy Settings leads to Premium without a Server Access presentation", async ({
  page,
}) => {
  await page.goto("/dashboard/333333333333333333/settings?community&navigation")
  await expect(page.getByText("Server access", { exact: false })).toHaveCount(0)
  await page.getByRole("link", { name: "Open Premium Guild" }).click()
  await expect(
    page.getByRole("heading", { name: "Server subscription" })
  ).toBeVisible()
})

test("a resolved unavailable account shows an error instead of an indefinite directory skeleton", async ({
  page,
}) => {
  await page.goto("/dashboard/servers?community&navigation")
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("directory-fixture", {
        detail: { status: "unavailable", unavailableAccount: true },
      })
    )
  )
  await expect(page.getByRole("alert")).toHaveText(
    /This account cannot load the server directory/
  )
  await expect(
    page.getByRole("link").filter({ hasText: "Cleo community" })
  ).toHaveCount(0)
})

test("already-consented Linked Roles does not start OAuth again", async ({
  page,
}) => {
  await page.goto("/discord/linked-role?community&consented")
  await expect(page.getByRole("status")).toContainText(
    "Discord permission verified"
  )
  await expect(
    page.getByRole("button", { name: "Allow Discord Linked Roles" })
  ).toHaveCount(0)
  await page.getByRole("button", { name: /Rerender fixture/ }).click()
  const calls = JSON.parse(
    (await page.getByTestId("community-calls").textContent()) ?? "[]"
  ) as { path: string }[]
  expect(
    calls.filter(
      (call) => call.path === "communityActions:connectClerkLinkedRoles"
    )
  ).toHaveLength(1)
  expect(
    calls.filter((call) => call.path === "communityActions:beginLinkedRoles")
  ).toHaveLength(0)
})
