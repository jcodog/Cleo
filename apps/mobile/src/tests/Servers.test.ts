import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"

type Guild = {
  discordGuildId: string
  name: string
  verified: boolean
  verifiedAt: number
}
type ListProps = {
  children?: React.ReactNode
  data: Guild[]
  ListHeaderComponent: React.ReactNode
  renderItem: (info: { item: Guild }) => React.ReactNode
}

/** Read native text output without replacing the directory's expiry logic. */
function textContent(node: React.ReactNode): string {
  if (typeof node === "string") return node
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return ""
  return React.Children.toArray(node.props.children).map(textContent).join(" ")
}

test("native directory rejects expired cached verification on the first render", async (t) => {
  const now = 1761573600000
  t.mock.method(Date, "now", () => now)
  const guild = {
    discordGuildId: "111111111111111111",
    name: "My server",
    verified: true,
    verifiedAt: now - 300001,
  }
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (value: unknown) => [
        typeof value === "function"
          ? Reflect.apply(value, undefined, [])
          : value,
        () => {},
      ],
      useRef: (value: unknown) => ({ current: value }),
      useEffect: () => {},
      useCallback: (callback: unknown) => callback,
    },
  })
  t.mock.module("react-native", {
    exports: {
      View: "View",
      Text: "Text",
      ActivityIndicator: "Loading",
      FlatList: "List",
      Image: "Image",
      Pressable: "Button",
      RefreshControl: "Refresh",
      StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useQuery: () => ({ status: "ready", guilds: [guild] }),
      useAction: () => async () => ({ status: "ready" }),
    },
  })
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "React", previous)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const { Servers } = await import("../servers/Servers")
  const root = Servers()
  const child = root.props.children
  assert.ok(React.isValidElement(child))
  const DirectoryComponent = child.type
  assert.ok(typeof DirectoryComponent === "function")
  const render = () => {
    const list: unknown = Reflect.apply(DirectoryComponent, undefined, [
      child.props,
    ])
    assert.ok(React.isValidElement<ListProps>(list))
    const item = list.props.data[0]
    assert.ok(item)
    return {
      row: textContent(list.props.renderItem({ item })),
      header: textContent(list.props.ListHeaderComponent),
    }
  }
  const expired = render()
  assert.match(expired.row, /Verification required/)
  assert.doesNotMatch(expired.row, /Management verified/)
  assert.match(expired.header, /verification has expired/)
  guild.verifiedAt = now - 1000
  const fresh = render()
  assert.match(fresh.row, /Management verified/)
  assert.doesNotMatch(fresh.header, /verification has expired/)
})
