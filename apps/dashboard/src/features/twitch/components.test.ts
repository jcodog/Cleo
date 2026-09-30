import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { type ReactNode, isValidElement } from "react"

function elements(node: ReactNode): React.ReactElement<{
  children?: ReactNode
  onClick?: () => Promise<void>
  disabled?: boolean
  src?: string
}>[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [
    node,
    ...React.Children.toArray(node.props.children).flatMap(elements),
  ]
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (!isValidElement<{ children?: ReactNode }>(node)) return ""
  return React.Children.toArray(node.props.children).map(text).join(" ")
}

test("actual Twitch callback and workspace handle provider evidence, actions and failure states", async (t) => {
  let slots: unknown[] = []
  let index = 0
  let effects: (() => void)[] = []
  let loaded = true
  let accounts = [
    {
      provider: "twitch",
      providerUserId: "222",
      approvedScopes: "channel:bot",
      verification: { status: "verified" },
    },
  ]
  let hasUser = true
  let params = new URLSearchParams()
  let events: string[] = []
  let reloadFailure = false
  let syncFailure = false
  let linkFailure = false
  let syncStatus = "ready"
  let pendingSync: Promise<void> | undefined
  let connection:
    | {
        providerAccountId: string
        hasBootstrapPermission: boolean
        displayName: string
        avatarUrl: string
      }
    | null
    | undefined
  const authorizationRedirect = () => {
    if (linkFailure) throw new Error("private linking error")
    return {
      verification: {
        externalVerificationRedirectURL: new URL(
          "https://clerk.example/authorize"
        ),
      },
    }
  }
  const user = {
    get externalAccounts() {
      return accounts.map((account) => ({
        ...account,
        reauthorize: async () => authorizationRedirect(),
      }))
    },
    reload: async () => {
      events.push("reload")
      if (reloadFailure) throw new Error("private provider error")
      return user
    },
    createExternalAccount: async () => authorizationRedirect(),
  }
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        const slot = index++
        if (!(slot in slots)) slots[slot] = initial
        return [
          slots[slot],
          (value: unknown) => {
            slots[slot] = value
          },
        ]
      },
      useRef: (initial: unknown) => {
        const slot = index++
        if (!(slot in slots)) slots[slot] = { current: initial }
        return slots[slot]
      },
      useEffect: (effect: () => void) => {
        effects.push(effect)
      },
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: {
      useUser: () => ({ user: hasUser ? user : null, isLoaded: loaded }),
      useReverification: (action: () => Promise<string>) => action,
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useAction: () => async () => {
        events.push("sync")
        await pendingSync
        if (syncFailure) throw new Error("private sync error")
        return { status: syncStatus }
      },
      useQuery: () => connection,
    },
  })
  t.mock.module("next/navigation", {
    exports: {
      useSearchParams: () => params,
      useRouter: () => ({
        replace: (path: string) => {
          events.push(`redirect:${path}`)
        },
      }),
    },
  })
  t.mock.module("next/link", { defaultExport: "a" })
  for (const [module, names] of [
    ["alert", ["Alert", "AlertDescription", "AlertTitle"]],
    ["avatar", ["Avatar", "AvatarFallback", "AvatarImage"]],
    ["badge", ["Badge"]],
    ["button", ["Button"]],
    ["skeleton", ["Skeleton"]],
    ["spinner", ["Spinner"]],
  ] satisfies [string, string[]][])
    t.mock.module(`@workspace/ui/components/${module}`, {
      exports: Object.fromEntries(
        names.map((name) => [name, name === "Button" ? "button" : name])
      ),
    })
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin: "https://cleo.example",
        assign: (url: string) => {
          events.push(`assign:${url}`)
        },
      },
    },
  })
  t.after(() => {
    for (const [name, previous] of [
      ["React", previousReact],
      ["window", previousWindow],
    ] satisfies [string, PropertyDescriptor | undefined][])
      if (previous) Object.defineProperty(globalThis, name, previous)
      else Reflect.deleteProperty(globalThis, name)
  })
  const { TwitchLinkCallback } = await import("./TwitchLinkCallback")
  const { TwitchWorkspace } = await import("./TwitchWorkspace")
  const render = (component: () => ReactNode) => {
    index = 0
    effects = []
    return component()
  }
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
  const reset = () => {
    slots = []
    events = []
    params = new URLSearchParams()
    loaded = true
    hasUser = true
    reloadFailure = false
    syncFailure = false
    linkFailure = false
    syncStatus = "ready"
    pendingSync = undefined
  }

  await t.test(
    "callback only syncs and redirects a connected account",
    async () => {
      for (const provider of ["twitch", "oauth_twitch"]) {
        reset()
        accounts = [
          {
            provider,
            providerUserId: "222",
            approvedScopes: "channel:bot",
            verification: { status: "verified" },
          },
        ]
        params.set("returnTo", "/account")
        assert.match(text(render(TwitchLinkCallback)), /Verifying/)
        effects.forEach((effect) => effect())
        await settle()
        assert.deepEqual(events, ["reload", "sync", "redirect:/account"])
      }
      for (const scope of ["", "channel:bot-other"]) {
        reset()
        accounts[0]!.approvedScopes = scope
        render(TwitchLinkCallback)
        effects.forEach((effect) => effect())
        await settle()
        assert.deepEqual(events, ["reload"])
        assert.match(text(render(TwitchLinkCallback)), /connection incomplete/)
      }
    }
  )
  await t.test(
    "callback shows provider, no-user, verification, sync and exception failures",
    async () => {
      for (const failure of [
        "provider",
        "noUser",
        "verification",
        "sync",
        "exception",
        "syncException",
      ]) {
        reset()
        accounts = [
          {
            provider: "twitch",
            providerUserId: "222",
            approvedScopes: "channel:bot",
            verification: { status: "verified" },
          },
        ]
        if (failure === "provider") params.set("error", "access_denied")
        if (failure === "noUser") hasUser = false
        if (failure === "verification") accounts = []
        if (failure === "sync") syncStatus = "unavailable"
        if (failure === "exception") reloadFailure = true
        if (failure === "syncException") syncFailure = true
        render(TwitchLinkCallback)
        effects.forEach((effect) => effect())
        await settle()
        assert.match(text(render(TwitchLinkCallback)), /connection incomplete/)
        assert.equal(
          events.some((event) => event.startsWith("redirect:")),
          false
        )
        assert.equal(
          text(render(TwitchLinkCallback)).includes("private"),
          false
        )
      }
      reset()
      loaded = false
      hasUser = false
      render(TwitchLinkCallback)
      effects.forEach((effect) => effect())
      await settle()
      assert.match(text(render(TwitchLinkCallback)), /Verifying/)
    }
  )
  await t.test(
    "workspace matches both provider representations and rejects stale projections",
    async () => {
      reset()
      connection = {
        providerAccountId: "222",
        hasBootstrapPermission: true,
        displayName: "Broadcaster",
        avatarUrl: "https://example.test/avatar",
      }
      for (const provider of ["twitch", "oauth_twitch"]) {
        accounts = [
          {
            provider,
            providerUserId: "222",
            approvedScopes: "channel:bot",
            verification: { status: "verified" },
          },
        ]
        const view = render(TwitchWorkspace)
        assert.match(text(view), /Broadcaster/)
        assert.equal(text(view).includes("Sync required"), false)
        assert.ok(
          elements(view).some(
            (element) => element.props.src === connection?.avatarUrl
          )
        )
      }
      connection.providerAccountId = "333"
      assert.match(text(render(TwitchWorkspace)), /Sync required/)
      connection = undefined
      assert.equal(elements(render(TwitchWorkspace))[0]?.type, "Skeleton")
      connection = null
      hasUser = false
      assert.match(text(render(TwitchWorkspace)), /Sign in/)
    }
  )
  await t.test(
    "workspace connect, sync, busy controls and failures execute actual handlers",
    async () => {
      reset()
      accounts = []
      connection = null
      const button = (view: ReactNode, label: string) => {
        const found = elements(view).find(
          (element) =>
            element.type === "button" && text(element).includes(label)
        )
        assert.ok(found?.props.onClick)
        return found
      }
      await button(render(TwitchWorkspace), "Connect Twitch").props.onClick?.()
      assert.deepEqual(events, ["assign:https://clerk.example/authorize"])
      assert.equal(
        button(render(TwitchWorkspace), "Connect Twitch").props.disabled,
        true
      )
      reset()
      accounts = [
        {
          provider: "twitch",
          providerUserId: "222",
          approvedScopes: "channel:bot",
          verification: { status: "verified" },
        },
      ]
      let release: () => void = () => undefined
      pendingSync = new Promise<void>((resolve) => {
        release = resolve
      })
      const action = button(
        render(TwitchWorkspace),
        "Sync connection"
      ).props.onClick?.()
      await settle()
      assert.equal(
        button(render(TwitchWorkspace), "Sync connection").props.disabled,
        true
      )
      release()
      await action
      assert.deepEqual(events, ["reload", "sync"])
      assert.equal(
        button(render(TwitchWorkspace), "Sync connection").props.disabled,
        false
      )
      syncStatus = "unavailable"
      await button(render(TwitchWorkspace), "Sync connection").props.onClick?.()
      assert.match(text(render(TwitchWorkspace)), /provider is unavailable/)
      syncFailure = true
      await button(render(TwitchWorkspace), "Sync connection").props.onClick?.()
      assert.match(text(render(TwitchWorkspace)), /could not verify/)
      linkFailure = true
      await button(
        render(TwitchWorkspace),
        "Reconnect Twitch"
      ).props.onClick?.()
      assert.match(text(render(TwitchWorkspace)), /connection could not start/)
      assert.equal(
        button(render(TwitchWorkspace), "Reconnect Twitch").props.disabled,
        false
      )
      assert.equal(text(render(TwitchWorkspace)).includes("private"), false)
    }
  )
})
