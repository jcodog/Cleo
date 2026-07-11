import assert from "node:assert/strict"
import { test } from "node:test"
import { ActivityType, type PresenceData } from "discord.js"

import { configureRotatingStatus, getRotatingStatuses } from "./rotatingStatus"

function createClient() {
  const presences: PresenceData[] = []

  return {
    presences,
    user: {
      setPresence(presence: PresenceData) {
        presences.push(presence)
        return undefined
      },
    },
    guilds: {
      cache: new Map([
        ["123456789012345678", {}],
        ["234567890123456789", {}],
      ]),
    },
    shard: {
      ids: [2],
      count: 8,
    },
  }
}

function createSingleRuntimeClient() {
  return {
    user: {
      setPresence() {
        return undefined
      },
    },
    guilds: {
      cache: new Map([["123456789012345678", {}]]),
    },
    shard: null,
  }
}

test("rotating status list includes default brand presences", () => {
  assert.deepEqual(getRotatingStatuses(createClient() as never), [
    {
      activities: [
        {
          name: "new look, new me.",
          type: ActivityType.Playing,
        },
      ],
      status: "online",
    },
    {
      activities: [
        {
          name: "the dashboard come alive",
          type: ActivityType.Watching,
        },
      ],
      status: "online",
    },
    {
      activities: [
        {
          name: "2 servers over 8 shards",
          type: ActivityType.Watching,
        },
      ],
      status: "online",
    },
  ])
})

test("rotating status summarizes single runtime servers without shard count", () => {
  const statuses = getRotatingStatuses(createSingleRuntimeClient() as never)
  const summary = statuses.at(-1)

  assert.deepEqual(summary, {
    activities: [
      {
        name: "1 server",
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  })
})

test("rotating status can include shard diagnostics", () => {
  assert.deepEqual(
    getRotatingStatuses(createClient() as never, {
      includeShardStatus: true,
    }),
    [
      {
        activities: [
          {
            name: "new look, new me.",
            type: ActivityType.Playing,
          },
        ],
        status: "online",
      },
      {
        activities: [
          {
            name: "the dashboard come alive",
            type: ActivityType.Watching,
          },
        ],
        status: "online",
      },
      {
        activities: [
          {
            name: "2 servers over 8 shards",
            type: ActivityType.Watching,
          },
        ],
        status: "online",
      },
      {
        activities: [
          {
            name: "shard 3 - 2 servers",
            type: ActivityType.Watching,
          },
        ],
        status: "online",
      },
    ]
  )
})

test("rotating status applies full presence entries", () => {
  const client = createClient()

  configureRotatingStatus(client as never, {
    includeShardStatus: true,
    setInterval: (() =>
      ({
        unref() {
          return undefined
        },
      }) as never) as typeof setInterval,
  })

  assert.deepEqual(client.presences, [
    {
      activities: [
        {
          name: "new look, new me.",
          type: ActivityType.Playing,
        },
      ],
      status: "online",
    },
  ])
})
