import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { getFunctionName } from "convex/server"

type Props = {
  children?: React.ReactNode
  disabled?: boolean
  checked?: boolean
  onClick?: () => Promise<void>
  href?: string
}
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!React.isValidElement<Props>(node)) return []
  if (typeof node.type === "function")
    return nodes((node.type as (props: Props) => React.ReactNode)(node.props))
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)]
}
function content(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (!React.isValidElement<Props>(node)) return ""
  return React.Children.toArray(node.props.children).map(content).join(" ")
}
test("moderation stays locked and purchase visibility starts private in actual dashboard components", async (t) => {
  let slots: unknown[] = [],
    index = 0
  let view: unknown = {
    status: "ready",
    policyJSON: "{}",
    revision: 0,
    enforcement: false,
    health: "Release locked",
  }
  const calls: { path: string; args: unknown }[] = []
  const effects: (() => void)[] = []
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        const at = index++
        if (!(at in slots))
          slots[at] = typeof initial === "function" ? initial() : initial
        return [
          slots[at],
          (value: unknown) => {
            slots[at] = typeof value === "function" ? value(slots[at]) : value
          },
        ]
      },
      useRef: (value: unknown) => ({ current: value }),
      useEffect: (effect: () => void) => {
        effects.push(effect)
      },
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useQuery: () => view,
      useMutation:
        (reference: Parameters<typeof getFunctionName>[0]) =>
        async (args: unknown) => {
          calls.push({ path: getFunctionName(reference), args })
          return 1
        },
      useAction:
        (reference: Parameters<typeof getFunctionName>[0]) =>
        async (args: unknown) => {
          if (getFunctionName(reference) === "premiumActions:offer")
            return {
              name: "Cleo Server Premium",
              currency: "gbp",
              unitAmount: 499,
              interval: "month",
              intervalCount: 1,
            }
          calls.push({ path: getFunctionName(reference), args })
          return "https://checkout.stripe.com/fixture"
        },
    },
  })
  t.mock.module("next/link", { defaultExport: "a" })
  t.mock.module("next/image", { defaultExport: "img" })
  t.mock.module("@clerk/nextjs", {
    exports: {
      useAuth: () => ({
        isLoaded: true,
        userId: "fixture-user",
        sessionId: "fixture-session",
      }),
    },
  })
  t.mock.module("@workspace/env/dashboard", {
    exports: {
      dashboardEnv: { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_fixture" },
    },
  })
  t.mock.module("./PremiumCheckout.tsx", {
    exports: { PremiumCheckout: () => null },
  })
  for (const [module, names] of [
    ["button", ["Button"]],
    ["switch", ["Switch"]],
    ["input", ["Input"]],
    ["textarea", ["Textarea"]],
    ["field", ["Field", "FieldLabel", "FieldDescription"]],
  ] satisfies [string, string[]][])
    t.mock.module(`@workspace/ui/components/${module}`, {
      exports: Object.fromEntries(
        names.map((name) => [
          name,
          name === "Button" ? "button" : name === "Switch" ? "switch" : name,
        ])
      ),
    })
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { assign: () => {} } },
  })
  t.after(() => {
    for (const [name, descriptor] of [
      ["React", previous],
      ["window", previousWindow],
    ] as const)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
  })
  const { PolicyEditor } = await import("../moderation/PolicyEditor")
  function policy() {
    index = 0
    return nodes(
      PolicyEditor({ platform: "discord", scopeId: "333333333333333333" })
    )
  }
  const controls = policy()
  assert.equal(
    controls.find((node) => node.type === "fieldset")?.props.disabled,
    true
  )
  assert.ok(
    controls.some((node) => content(node).includes("Moderation is unavailable"))
  )
  assert.equal(calls.length, 0)
  view = {
    status: "ready",
    policyJSON: "{}",
    revision: 1,
    enforcement: false,
    health: "Release locked",
  }
  assert.ok(
    policy().some((node) =>
      content(node).includes("Another configuration revision")
    )
  )

  for (const message of [
    "Cleo must be installed.",
    "Refresh your Discord server permissions before editing moderation.",
  ]) {
    view = { status: "unavailable", message }
    const unavailable = policy()
    assert.ok(unavailable.some((node) => content(node).includes(message)))
    assert.ok(!unavailable.some((node) => node.type === "fieldset"))
    assert.equal(calls.length, 0)
  }

  const { PremiumPurchases } = await import("./PremiumPurchases")
  slots = []
  index = 0
  view = {
    configured: true,
    canManageOwnBilling: true,
    communityPublishIdentity: false,
    guildPremium: {
      state: "expired",
      capabilities: [],
      validUntil: 0,
      canPurchase: true,
    },
    subscriptions: [],
  }
  effects.length = 0
  const initialPurchase = nodes(
    PremiumPurchases({ discordGuildId: "333333333333333333" })
  )
  assert.equal(
    initialPurchase.find(
      (node) =>
        node.type === "button" && content(node).includes("Continue to checkout")
    )?.props.disabled,
    true
  )
  effects.splice(0).forEach((effect) => effect())
  await Promise.resolve()
  index = 0
  const purchase = nodes(
    PremiumPurchases({ discordGuildId: "333333333333333333" })
  )
  assert.ok(
    purchase
      .filter((node) => node.type === "switch")
      .every((node) => node.props.checked === false)
  )
  const checkout = purchase.find(
    (node) =>
      node.type === "button" && content(node).includes("Continue to checkout")
  )
  assert.ok(checkout && !checkout.props.disabled)
  assert.ok(purchase.some((node) => node.props.href === "/billing"))
  assert.ok(
    !purchase.some((node) => content(node) === "Manage my Stripe billing")
  )
  await checkout.props.onClick?.()
  assert.deepEqual(calls.at(-1), {
    path: "premiumActions:checkout",
    args: {
      discordGuildId: "333333333333333333",
      announce: false,
      displayRole: false,
    },
  })
  slots = []
  index = 0
  view = undefined
  const loading = nodes(PremiumPurchases({}))
  assert.ok(
    loading.some((node) => content(node).includes("Loading Premium details"))
  )
  assert.ok(!loading.some((node) => content(node).includes("unavailable")))
  slots = []
  index = 0
  view = {
    configured: false,
    canManageOwnBilling: false,
    communityPublishIdentity: null,
    subscriptions: [],
  }
  assert.equal(
    nodes(PremiumPurchases({ discordGuildId: "333333333333333333" })).find(
      (node) =>
        node.type === "button" && content(node).includes("Continue to checkout")
    )?.props.disabled,
    true
  )
  slots = []
  index = 0
  assert.ok(
    !nodes(PremiumPurchases({})).some(
      (node) =>
        node.type === "button" && content(node).includes("Continue to Stripe")
    )
  )
})
