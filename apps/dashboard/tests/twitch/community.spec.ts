import { test, expect, type Page } from "@playwright/test"

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
  await page.goto("/account/billing?community")
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
      `/account/billing?community${failure ? "&failConsent" : ""}`
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
