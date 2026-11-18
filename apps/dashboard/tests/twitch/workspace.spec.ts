import { test, expect } from "@playwright/test"

for (const platform of ["discord", "twitch"] as const) {
  test(`${platform}-only releases control the rendered selector on desktop and mobile`, async ({
    page,
  }) => {
    const own = platform === "discord" ? "Discord" : "Twitch",
      other = platform === "discord" ? "Twitch" : "Discord"
    const route =
      platform === "discord" ? "/dashboard/123456789012345678" : "/twitch"
    await page.goto(`${route}?release=${platform}`)
    await expect(
      page
        .getByRole("group", { name: "Select platform" })
        .getByRole("button", { name: own, exact: true })
    ).toBeVisible()
    await expect(
      page
        .getByRole("group", { name: "Select platform" })
        .getByRole("button", { name: other, exact: true })
    ).toHaveCount(0)
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(
      page.getByRole("link", { name: /Open (Discord|Twitch) workspace/ })
    ).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(
      page
        .getByRole("group", { name: "Select platform" })
        .getByRole("button", { name: own, exact: true })
    ).toBeVisible()
    await expect(
      page
        .getByRole("group", { name: "Select platform" })
        .getByRole("button", { name: other, exact: true })
    ).toHaveCount(0)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(
      `${platform === "discord" ? "/twitch" : "/dashboard/123456789012345678"}?release=${platform}`
    )
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(
      page.getByRole("link", { name: `Open ${own} workspace` })
    ).toHaveAttribute("href", route)
  })
}

test("group switching warns accurately when draft storage fails and recovers after a successful write", async ({
  page,
}) => {
  await page.goto("/twitch/timers?locked")
  await page.getByRole("button", { name: /Community links/ }).click()
  await page.evaluate(() => {
    Reflect.set(
      window,
      "timerStorageDescriptor",
      Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")
    )
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: () => {
        throw new DOMException("Storage blocked", "QuotaExceededError")
      },
    })
  })
  await page.getByLabel("Group name").fill("Unsaved private draft")
  await expect(
    page.getByText(/This browser could not preserve the draft/)
  ).toBeVisible()
  const warning = page.waitForEvent("dialog")
  const switching = page
    .getByRole("button", { name: /Subscriber reminders/ })
    .click()
  const dialog = await warning
  expect(dialog.message()).toBe(
    "Leave this group? Your unsaved changes will be lost."
  )
  await dialog.dismiss()
  await switching
  await expect(page.getByLabel("Group name")).toHaveValue(
    "Unsaved private draft"
  )
  await page.evaluate(() =>
    Object.defineProperty(
      Storage.prototype,
      "setItem",
      Reflect.get(window, "timerStorageDescriptor")
    )
  )
  await page.getByLabel("Group name").fill("Preserved private draft")
  await expect(
    page.getByText(/This browser could not preserve the draft/)
  ).toHaveCount(0)
  const recovered = page.waitForEvent("dialog")
  const leaving = page
    .getByRole("button", { name: /Subscriber reminders/ })
    .click()
  const confirmation = await recovered
  expect(confirmation.message()).toContain("Your draft will remain available")
  await confirmation.accept()
  await leaving
  await page.getByRole("button", { name: /Community links/ }).click()
  await page.getByRole("button", { name: "Restore draft", exact: true }).click()
  await expect(page.getByLabel("Group name")).toHaveValue(
    "Preserved private draft"
  )
})

test("long invalid and valid Unicode messages remain recoverable drafts", async ({
  page,
}) => {
  await page.goto("/twitch/timers")
  await page.getByRole("button", { name: /Community links/ }).click()
  for (const message of ["a".repeat(501), "😀".repeat(251)]) {
    await page
      .getByRole("textbox", { name: /^Message 1(?: ·|$)/ })
      .fill(message)
    await expect(
      page.getByText(/This browser could not preserve the draft/)
    ).toHaveCount(0)
    await page.getByRole("link", { name: "Overview", exact: true }).click()
    await page
      .getByRole("link", { name: "Chatbot timers", exact: true })
      .click()
    await page
      .getByRole("button", { name: "Open draft: Community links", exact: true })
      .click()
    await page
      .getByRole("button", { name: "Restore draft", exact: true })
      .click()
    await expect(
      page.getByRole("textbox", { name: /^Message 1(?: ·|$)/ })
    ).toHaveValue(message)
  }
  await page.getByRole("button", { name: "Save group", exact: true }).click()
  await expect(page.getByText("Group saved.", { exact: true })).toBeVisible()
})

for (const destination of ["Overview", "Chat alerts", "Discord"] as const) {
  test(`session drafts survive navigation to ${destination} and explicit restore/save`, async ({
    page,
  }) => {
    page.on("dialog", (dialog) => dialog.accept())
    await page.goto("/twitch/timers")
    await page.getByRole("button", { name: /Community links/ }).click()
    await page.getByLabel("Group name").fill(`Draft via ${destination}`)
    if (destination === "Discord")
      await page.getByRole("button", { name: "Discord", exact: true }).click()
    else
      await page.getByRole("link", { name: destination, exact: true }).click()
    await page
      .getByRole("link", { name: "Chatbot timers", exact: true })
      .click()
    await page
      .getByRole("button", { name: "Open draft: Community links", exact: true })
      .click()
    await expect(page.getByLabel("Group name")).toHaveValue("Community links")
    await page
      .getByRole("button", { name: "Restore draft", exact: true })
      .click()
    await expect(page.getByLabel("Group name")).toHaveValue(
      `Draft via ${destination}`
    )
    await page.getByRole("button", { name: "Save group", exact: true }).click()
    await expect(page.getByText("Group saved.", { exact: true })).toBeVisible()
    await page.getByRole("link", { name: "Overview", exact: true }).click()
    await page
      .getByRole("link", { name: "Chatbot timers", exact: true })
      .click()
    await expect(
      page.getByText("Unsaved drafts in this browser session:")
    ).toHaveCount(0)
  })
}

test("new drafts survive history and refresh, preserve invalid edits, and clear on explicit discard", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept())
  await page.goto("/twitch/timers")
  await page.getByRole("button", { name: "New group", exact: true }).click()
  await page.getByLabel("Group name").fill("Private session draft")
  await page
    .getByLabel("Message 1", { exact: true })
    .fill("Private rotation text")
  await page.getByLabel("Interval in minutes").fill("4")
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await page.goBack()
  await page
    .getByRole("button", { name: "Open draft: New timer group", exact: true })
    .click()
  await page.getByRole("button", { name: "Restore draft", exact: true }).click()
  await expect(page.getByLabel("Interval in minutes")).toHaveValue("4")
  await page.goForward()
  await page.goBack()
  await page.reload()
  await page
    .getByRole("button", { name: "Open draft: New timer group", exact: true })
    .click()
  await page.getByRole("button", { name: "Discard draft", exact: true }).click()
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await page.getByRole("link", { name: "Chatbot timers", exact: true }).click()
  await expect(
    page.getByText("Unsaved drafts in this browser session:")
  ).toHaveCount(0)
  expect(page.url()).not.toContain("Private")
})

test("drafts stay isolated by user and broadcaster and stale revisions cannot overwrite server changes", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept())
  await page.goto("/twitch/timers?locked")
  await page.getByRole("button", { name: /Community links/ }).click()
  await page.getByLabel("Group name").fill("Account A draft")
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("timer-fixture", {
        detail: { account: "fixture-user-b" },
      })
    )
  )
  await expect(page.getByLabel("Group name")).toHaveValue("Community links")
  await expect(
    page.getByRole("button", { name: "Restore draft", exact: true })
  ).toHaveCount(0)
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("timer-fixture", {
        detail: { account: "fixture-user-a", broadcaster: "333" },
      })
    )
  )
  await expect(
    page.getByRole("button", { name: "Restore draft", exact: true })
  ).toHaveCount(0)
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("timer-fixture", {
        detail: { broadcaster: "222", revision: 2 },
      })
    )
  )
  await page.getByRole("button", { name: "Restore draft", exact: true }).click()
  await expect(page.getByLabel("Group name")).toHaveValue("Account A draft")
  await expect(
    page.getByRole("button", { name: "Save group", exact: true })
  ).toBeDisabled()
  await expect(page.getByText(/This group changed elsewhere/)).toBeVisible()
  await page
    .getByRole("button", { name: "Reload configuration", exact: true })
    .click()
  await expect(page.getByLabel("Group name")).toHaveValue("Community links")
  await page.getByLabel("Group name").fill("Group-one draft")
  await page.getByRole("button", { name: /Subscriber reminders/ }).click()
  await expect(
    page.getByRole("button", { name: "Restore draft", exact: true })
  ).toHaveCount(0)
  await page.getByRole("button", { name: /Community links/ }).click()
  await page.getByRole("button", { name: "Restore draft", exact: true }).click()
  await expect(page.getByLabel("Group name")).toHaveValue("Group-one draft")
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click()
})

for (const operation of ["create", "edit", "delete"] as const) {
  test(`rejected ${operation} preserves configuration and permits a retry`, async ({
    page,
  }) => {
    page.on("dialog", (dialog) => dialog.accept())
    await page.goto(`/twitch/timers?fail=${operation}`)
    if (operation === "create") {
      await page.getByRole("button", { name: "New group", exact: true }).click()
      await page.getByLabel("Group name").fill("New rotation")
      await page.getByLabel("Message 1", { exact: true }).fill("Hello 世界")
    } else {
      await page.getByRole("button", { name: /Community links/ }).click()
      if (operation === "edit")
        await page.getByLabel("Group name").fill("Edited rotation")
    }
    const button = page.getByRole("button", {
      name: operation === "delete" ? "Delete group" : "Save group",
      exact: true,
    })
    await button.click()
    await expect(
      page.getByText(
        operation === "delete"
          ? "Could not delete this group."
          : /Could not save this group/
      )
    ).toBeVisible()
    await expect(page.getByLabel("Group name")).toHaveValue(
      operation === "create"
        ? "New rotation"
        : operation === "edit"
          ? "Edited rotation"
          : "Community links"
    )
    await expect(button).toBeEnabled()
    await button.click()
    if (operation === "delete")
      await expect(
        page.getByRole("button", { name: /Community links/ })
      ).toHaveCount(0)
    else
      await expect(
        page.getByText("Group saved.", { exact: true })
      ).toBeVisible()
    if (operation === "create") {
      await expect(page.getByText("2 / 3 timer groups")).toBeVisible()
      await page.getByRole("button", { name: /Community links/ }).click()
      await expect(page.getByText("Group saved.", { exact: true })).toHaveCount(
        0
      )
    }
  })
}

test("revision conflicts preserve the draft until an explicit reload and retry", async ({
  page,
}) => {
  await page.goto("/twitch/timers?fail=conflict")
  await page.getByRole("button", { name: /Community links/ }).click()
  await page.getByLabel("Group name").fill("My draft")
  await page.getByRole("button", { name: "Save group", exact: true }).click()
  await expect(page.getByLabel("Group name")).toHaveValue("My draft")
  await expect(page.getByText(/This group changed elsewhere/)).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Save group", exact: true })
  ).toBeDisabled()
  await page.getByRole("button", { name: "Reload configuration" }).click()
  await page.getByLabel("Group name").fill("Reviewed edit")
  await page.getByRole("button", { name: "Save group", exact: true }).click()
  await expect(page.getByText("Group saved.", { exact: true })).toBeVisible()
})

test("lost entitlement preserves the draft, allows saved edits and restores eligibility", async ({
  page,
}) => {
  await page.goto("/twitch/timers?fail=entitlement")
  await page.getByRole("button", { name: /Subscriber reminders/ }).click()
  await page.getByLabel("Group name").fill("Preserved draft")
  await page.getByRole("button", { name: "Save group", exact: true }).click()
  await expect(page.getByText(/Could not save this group/)).toBeVisible()
  await expect(page.getByLabel("Group name")).toHaveValue("Preserved draft")
  await expect(
    page.getByRole("button", { name: "Save group", exact: true })
  ).toBeEnabled()
  await page.getByRole("button", { name: "Save group", exact: true }).click()
  await expect(page.getByText("Group saved.", { exact: true })).toBeVisible()
  await expect(page.getByText(/saved enablement are preserved/)).toBeVisible()
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("timer-fixture", { detail: { restore: true } })
    )
  )
  await expect(
    page.getByText(/saved enablement are preserved/)
  ).not.toBeVisible()
})

test("health expires without another query and live lifecycle labels preserve message-zero rotation", async ({
  page,
}) => {
  await page.clock.install()
  await page.goto("/twitch/timers?staleHealth")
  await page.getByRole("button", { name: /Community links/ }).click()
  await page.clock.fastForward(6000)
  await expect(
    page.getByText("Runtime details: Worker unavailable", { exact: true })
  ).toBeVisible()
  await page.goto("/twitch/timers?offline")
  await page.getByRole("button", { name: /Community links/ }).click()
  await expect(
    page.getByText("Runtime details: Waiting for stream", { exact: true })
  ).toBeVisible()
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("timer-fixture", { detail: { live: true, cursor: 1 } })
    )
  )
  await expect(
    page.getByText("Runtime details: Live, waiting for activity", {
      exact: true,
    })
  ).toBeVisible()
  await expect(page.getByText(/Message 2 · Next in rotation/)).toBeVisible()
  await page.evaluate(() =>
    dispatchEvent(new CustomEvent("timer-fixture", { detail: { live: false } }))
  )
  await expect(
    page.getByText("Runtime details: Waiting for stream", { exact: true })
  ).toBeVisible()
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("timer-fixture", { detail: { newStream: true } })
    )
  )
  await expect(page.getByText(/Message 1 · Next in rotation/)).toBeVisible()
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("timer-fixture", {
        detail: { providerUnavailable: true },
      })
    )
  )
  await expect(
    page.getByText("Runtime details: Provider unavailable", { exact: true })
  ).toBeVisible()
})

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
  await expect(page).toHaveURL(/\/dashboard\/servers$/)
})
test("timer messages validate, reorder with keyboard controls, save and retain locked configuration", async ({
  page,
}) => {
  await page.goto("/twitch/timers")
  await page.getByRole("button", { name: /Community links/ }).click()
  await expect(page.getByLabel("Group name")).toHaveValue("Community links")
  await expect(
    page.getByText(
      "Messages are counted since this group's last send or stream start. Chat must have been active within the last five minutes."
    )
  ).toBeVisible()
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
  await page.getByRole("button", { name: /Subscriber reminders/ }).click()
  await expect(page.getByText(/saved enablement are preserved/)).toBeVisible()
  await expect(page.getByRole("button", { name: "New group" })).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Save group", exact: true })
  ).toBeDisabled()
  await page.getByLabel("Group name").fill("Locked saved preference")
  await page.getByRole("button", { name: "Save group", exact: true }).click()
  await expect(page.getByText("Group saved.")).toBeVisible()
  await expect(page.getByText(/saved enablement are preserved/)).toBeVisible()
  await page.screenshot({
    path: "test-results/twitch/timers-locked-light.png",
    fullPage: true,
  })
})

test("an expiring test grant locks extra groups without deleting their messages", async ({
  page,
}) => {
  await page.clock.install()
  await page.goto("/twitch/timers?expiry")
  await page.getByRole("button", { name: /Subscriber reminders/ }).click()
  await expect(page.getByRole("textbox", { name: /^Message 1/ })).toHaveValue(
    "Join our community at example.com"
  )
  await page.clock.fastForward(6000)
  await expect(page.getByText(/saved enablement are preserved/)).toBeVisible()
  await expect(page.getByText("2 / 1 timer groups")).toBeVisible()
  await expect(page.getByRole("textbox", { name: /^Message 1/ })).toHaveValue(
    "Join our community at example.com"
  )
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
