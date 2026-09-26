import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { StaffOverviewContent } from "./StaffOverviewPageShell"

const runtimeGlobal = globalThis as typeof globalThis & {
  React?: typeof React
}
runtimeGlobal.React = React

const noop = () => undefined

test("staff overview renders loading and forbidden states", () => {
  const loading = renderToStaticMarkup(
    React.createElement(StaffOverviewContent, {
      result: undefined,
      guilds: [],
      guildStatus: "LoadingFirstPage",
      loadMore: noop,
    })
  )
  assert.match(loading, /Staff Operations/)
  assert.doesNotMatch(loading, /Access Not Available/)

  const forbidden = renderToStaticMarkup(
    React.createElement(StaffOverviewContent, {
      result: { status: "forbidden" },
      guilds: [],
      guildStatus: "Exhausted",
      loadMore: noop,
    })
  )
  assert.match(forbidden, /Access Not Available/)
})

test("staff overview renders metrics, guilds, activity, and pagination", () => {
  const rendered = renderToStaticMarkup(
    React.createElement(StaffOverviewContent, {
      result: {
        status: "ready",
        metrics: {
          guildCount: 2,
          userCount: 42,
        },
        activity: [
          {
            id: "event:1",
            eventType: "guildMemberAdd",
            summary: "Member Joined",
            discordGuildId: "123456789012345678",
            guildName: "Cleo HQ",
            occurredAt: 1_800_000_000_000,
          },
        ],
      },
      guilds: [
        {
          discordGuildId: "123456789012345678",
          name: "Cleo HQ",
          memberCount: 42,
          installedAt: 1_700_000_000_000,
          lastSyncedAt: 1_800_000_000_000,
        },
      ],
      guildStatus: "CanLoadMore",
      loadMore: noop,
    })
  )

  assert.match(rendered, />Guilds</)
  assert.match(rendered, />Users</)
  assert.match(rendered, />2</)
  assert.match(rendered, />42</)
  assert.match(rendered, /Cleo HQ/)
  assert.match(rendered, /Member Joined/)
  assert.match(rendered, /Load more servers/)
})
