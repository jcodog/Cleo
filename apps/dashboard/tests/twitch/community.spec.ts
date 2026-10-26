import { test, expect, type Page } from "@playwright/test"

test("Linked Roles is a responsive FAQ without account controls or eligibility diagnostics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/account/roles?community")
  await expect(
    page.getByText(
      "Show your connection to Cleo and the communities you support through Discord Linked Roles."
    )
  ).toBeVisible()
  const questions = page.locator('[data-slot="accordion-trigger"]')
  await expect(questions).toHaveCount(6)
  await page
    .getByRole("button", {
      name: "Do these roles give me permissions in Cleo's server?",
    })
    .click()
  await expect(
    page.getByText(/do not grant ownership, staff status or permissions/)
  ).toBeVisible()
  await expect(
    page.getByRole("button", {
      name: /Refresh verification|Connect Discord|Disconnect|Add Cleo/,
    })
  ).toHaveCount(0)
  await expect(page.locator("dl")).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page
    .getByRole("button", {
      name: "Do these roles give me permissions in Cleo's server?",
    })
    .press("Enter")
  await expect(
    page.getByText(/do not grant ownership, staff status or permissions/)
  ).not.toBeVisible()
})

test("a verification link requests Clerk consent only after an explicit click", async ({
  page,
}) => {
  const urls: string[] = []
  await page.route("https://discord.com/oauth2/authorize?**", async (route) => {
    urls.push(route.request().url())
    await route.fulfill({ body: "Discord authorization fixture" })
  })
  await page.goto("/discord/linked-role?community")
  await expect(
    page.getByRole("button", { name: "Allow Discord Linked Roles" })
  ).toBeVisible()
  expect(urls).toHaveLength(0)
  await page.getByRole("button", { name: "Allow Discord Linked Roles" }).click()
  await expect(page).toHaveURL(/https:\/\/discord.com\/oauth2\/authorize/)
  expect(urls).toHaveLength(1)
})

test("server discovery stays pending then recovers installed and installable servers automatically", async ({
  page,
}) => {
  await page.goto("/dashboard/add-server?community&discovery")
  await expect(
    page
      .getByRole("status", { name: "" })
      .filter({ hasText: "Verifying Discord server access" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Install", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByText("Installed community", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Available community", { exact: true })
  ).toBeVisible()
  const installed = page.getByRole("region", { name: "Already in dashboard" })
  await expect(
    installed.getByRole("button", { name: "Open", exact: true })
  ).toBeVisible()
  await expect(
    installed.getByRole("button", { name: "Install", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Install", exact: true })
  ).toHaveCount(1)
  expect(
    (await calls(page)).filter((call) =>
      call.path.endsWith("listInstallableGuilds:list")
    )
  ).toHaveLength(3)
})

test("discovery failures are unavailable rather than successful empty server lists", async ({
  page,
}) => {
  await page.goto("/dashboard/add-server?community&discovery&discoveryFailure")
  await expect(
    page.getByText("Discord servers could not be loaded")
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Install", exact: true })
  ).toHaveCount(0)
})

test("personal installation remains available in the existing Add flow", async ({
  page,
}) => {
  await page.route("https://discord.com/oauth2/authorize?**", (route) =>
    route.fulfill({ body: "Discord install fixture" })
  )
  await page.goto("/dashboard/add-server?community&discovery")
  await page
    .getByRole("button", { name: "Add to my account", exact: true })
    .click()
  await expect(page).toHaveURL(/integration_type=1/)
})

test("dashboard hydration resumes pending checkpoints, replaces historical ready caches and stops polling on completion", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("cleo:dashboard-discord-sync:fixture-clerk", "ready")
  )
  await page.goto("/dashboard?community&hydration")
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem(
          "cleo:dashboard-discord-sync:fixture-clerk:fixture-session:111111111111111111"
        )
      )
    )
    .toMatch(/^\d+$/)
  const total = (await calls(page)).filter((call) =>
    call.path.endsWith("syncDashboardGuilds:sync")
  ).length
  expect(total).toBeGreaterThanOrEqual(3)
  expect(total).toBeLessThanOrEqual(5)
  await page.getByRole("button", { name: /Rerender fixture/ }).click()
  expect(
    (await calls(page)).filter((call) =>
      call.path.endsWith("syncDashboardGuilds:sync")
    )
  ).toHaveLength(total)
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("admin can select a user, grant all qualifications and remove the test grant", async ({
  page,
}) => {
  await page.goto("/staff/linked-roles?community&adminRoles")
  await page
    .getByRole("combobox", { name: "User", exact: true })
    .selectOption("fixture-user")
  await page.getByRole("button", { name: "Select all qualifications" }).click()
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Verify all Discord roles")
  await page.getByRole("button", { name: "Grant test qualifications" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Test qualifications saved" })
  ).toBeVisible()
  const request = (await calls(page)).find(
    (call) => call.path === "communityRoleTesting:set"
  )
  expect(request?.args.userId).toBe("fixture-user")
  expect(request?.args.roles).toHaveLength(10)
  expect(request?.args.hours).toBe(1)
  await page.getByRole("button", { name: "Remove test qualifications" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Test qualifications removed" })
  ).toBeVisible()
  expect((await calls(page)).at(-1)?.args.roles).toEqual([])
})

test("ordinary staff cannot access admin test qualification controls", async ({
  page,
}) => {
  await page.goto("/staff/linked-roles?community&adminRoles&nonAdmin")
  await expect(
    page.getByText("Admin access is required to test Linked Roles.")
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Grant test qualifications" })
  ).toHaveCount(0)
})

async function calls(page: Page) {
  return JSON.parse(
    (await page.getByTestId("community-calls").textContent()) ?? "[]"
  ) as { path: string; args: Record<string, unknown> }[]
}
for (const result of ["success", "wrongAccount", "denied"] as const)
  test(`Linked Roles callback ${result} runs real effects, cleans the URL and executes once`, async ({
    page,
  }) => {
    await page.goto(
      result === "denied"
        ? "/discord/linked-role?community&error=access_denied"
        : `/discord/linked-role?community&code=fixture-code&state=fixture-state${result === "wrongAccount" ? "&wrongAccount" : ""}`
    )
    await expect(
      page.getByRole("status").filter({
        hasText:
          result === "success"
            ? "Discord Linked Roles verified"
            : "Discord verification failed",
      })
    ).toBeVisible()
    await expect(page).toHaveURL(/\/discord\/linked-role$/)
    const expected = result === "denied" ? 0 : 1
    expect(
      (await calls(page)).filter(
        (call) => call.path === "communityActions:finishLinkedRoles"
      )
    ).toHaveLength(expected)
    await page.getByRole("button", { name: /Rerender fixture/ }).click()
    expect(
      (await calls(page)).filter(
        (call) => call.path === "communityActions:finishLinkedRoles"
      )
    ).toHaveLength(expected)
    if (expected)
      expect((await calls(page))[0]!.args).toEqual({
        code: "fixture-code",
        state: "fixture-state",
      })
  })

test("purchase recognition preferences are independent and default off", async ({
  page,
}) => {
  await page.goto("/dashboard/333333333333333333/premium?community")
  const announce = page.getByRole("switch", {
      name: "Announce support",
      exact: true,
    }),
    role = page.getByRole("switch", {
      name: "Display Supporter role",
      exact: true,
    })
  await expect(announce).not.toBeChecked()
  await expect(role).not.toBeChecked()
  await page
    .getByRole("button", { name: "Continue to Stripe Checkout" })
    .click()
  await expect.poll(async () => (await calls(page)).length).toBe(1)
  expect((await calls(page))[0]!.args).toEqual({
    discordGuildId: "333333333333333333",
    announce: false,
    displayRole: false,
  })
  await announce.click()
  await page
    .getByRole("button", { name: "Continue to Stripe Checkout" })
    .click()
  await expect.poll(async () => (await calls(page)).length).toBe(2)
  expect((await calls(page))[1]!.args).toMatchObject({
    announce: true,
    displayRole: false,
  })
  await announce.click()
  await role.click()
  await page
    .getByRole("button", { name: "Continue to Stripe Checkout" })
    .click()
  await expect.poll(async () => (await calls(page)).length).toBe(3)
  expect((await calls(page))[2]!.args).toMatchObject({
    announce: false,
    displayRole: true,
  })
})

for (const failure of [false, true])
  test(`community identity consent persists only after an accepted save, failure=${failure}`, async ({
    page,
  }) => {
    await page.goto(
      `/dashboard/333333333333333333/premium?community${failure ? "&failConsent" : ""}`
    )
    const consent = page.getByRole("switch", {
      name: "Community identity consent",
      exact: true,
    })
    await expect(consent).not.toBeChecked()
    await consent.click()
    await page
      .getByRole("button", { name: "Save community publication consent" })
      .click()
    await expect(
      page.getByRole("status").filter({
        hasText: failure
          ? "Community consent save failed"
          : "Preferences saved",
      })
    ).toBeVisible()
    expect((await calls(page))[0]!.args).toMatchObject({
      publishIdentity: true,
    })
    const view = JSON.parse(
      (await page.getByTestId("community-view").textContent()) ?? "{}"
    )
    expect(view.communityPublishIdentity).toBe(!failure)
    await expect(
      page.getByRole("switch", { name: "Announce support", exact: true })
    ).not.toBeChecked()
  })

for (const failure of [false, true])
  test(`existing subscription preferences preserve independent consent on failure=${failure}`, async ({
    page,
  }) => {
    await page.goto(
      `/account/billing?community&existing${failure ? "&failPreferences" : ""}`
    )
    const announce = page.getByRole("switch", {
        name: "Purchase announcement consent",
        exact: true,
      }),
      role = page.getByRole("switch", {
        name: "Supporter role visibility",
        exact: true,
      })
    await expect(announce).not.toBeChecked()
    await expect(role).not.toBeChecked()
    await announce.click()
    await expect(
      page.getByRole("status").filter({
        hasText: failure ? "Preference save failed" : "Preferences saved",
      })
    ).toBeVisible()
    expect((await calls(page))[0]!.args).toEqual({
      activationId: "paid-fixture",
      announce: true,
      displayRole: false,
    })
    await expect(announce).toBeChecked({ checked: !failure })
    if (failure) {
      await expect(role).not.toBeChecked()
      return
    }
    await role.click()
    await expect(role).toBeChecked()
    expect((await calls(page))[1]!.args).toEqual({
      activationId: "paid-fixture",
      announce: true,
      displayRole: true,
    })
    await announce.click()
    await expect(announce).not.toBeChecked()
    await expect(role).toBeChecked()
    expect((await calls(page))[2]!.args).toEqual({
      activationId: "paid-fixture",
      announce: false,
      displayRole: true,
    })
  })
