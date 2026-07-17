import { ActivityType, type Client, type PresenceData } from "discord.js"

import { registerCleanupHook } from "@/runtime/shutdown"

const ROTATING_STATUS_INTERVAL_MS = 60 * 1000
const INCLUDE_SHARD_STATUS_AT_BOOT = false

type RotatingStatusOptions = {
  includeShardStatus?: boolean
  setInterval?: typeof setInterval
  clearInterval?: typeof clearInterval
}

export type RotatingStatusPresence = PresenceData

const baseRotatingStatuses: RotatingStatusPresence[] = [
  {
    activities: [
      {
        name: "new look, same me.",
        type: ActivityType.Playing,
      },
    ],
    status: "online",
  },
  {
    activities: [
      {
        name: "the changes make me better.",
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  },
  {
    activities: [
      {
        name: "to the music of progress as v3 enhances.",
        type: ActivityType.Listening,
      },
    ],
    status: "online",
  },
]
let rotationTimer: ReturnType<typeof setInterval> | null = null

export function configureRotatingStatus(
  client: Client<true>,
  options: RotatingStatusOptions = {}
): void {
  const statuses = getRotatingStatuses(client, {
    includeShardStatus:
      options.includeShardStatus ?? INCLUDE_SHARD_STATUS_AT_BOOT,
  })

  if (statuses.length === 0) {
    return
  }

  clearRotatingStatus(options.clearInterval)

  let index = 0
  setBotPresence(client, statuses[index])

  const interval = options.setInterval ?? setInterval
  rotationTimer = interval(() => {
    index = (index + 1) % statuses.length
    setBotPresence(client, statuses[index])
  }, ROTATING_STATUS_INTERVAL_MS)
  rotationTimer.unref?.()
}

export function getRotatingStatuses(
  client: Client<true>,
  options: {
    includeShardStatus?: boolean
  } = {}
): RotatingStatusPresence[] {
  const statuses = [...baseRotatingStatuses]
  statuses.push(createShardSummaryPresence(client))

  if (options.includeShardStatus) {
    statuses.push(createShardDebugPresence(client))
  }

  return statuses
}

export function clearRotatingStatus(
  clearIntervalImplementation: typeof clearInterval = clearInterval
): void {
  if (!rotationTimer) {
    return
  }

  clearIntervalImplementation(rotationTimer)
  rotationTimer = null
}

function setBotPresence(
  client: Client<true>,
  presence: RotatingStatusPresence | undefined
): void {
  if (!presence) {
    return
  }

  client.user.setPresence(presence)
}

function createShardSummaryPresence(
  client: Client<true>
): RotatingStatusPresence {
  const shardCount = client.shard?.count ?? 1
  const serverCount = client.guilds.cache.size
  const serverLabel = serverCount === 1 ? "server" : "servers"
  const shardLabel = shardCount === 1 ? "shard" : "shards"
  const name =
    shardCount > 1
      ? `${serverCount} ${serverLabel} over ${shardCount} ${shardLabel}`
      : `${serverCount} ${serverLabel}`

  return {
    activities: [
      {
        name,
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  }
}

function createShardDebugPresence(
  client: Client<true>
): RotatingStatusPresence {
  const shardIds = client.shard?.ids ?? [0]
  const shardLabel = shardIds.map((shardId) => shardId + 1).join(",")
  const guildCount = client.guilds.cache.size
  const guildLabel = guildCount === 1 ? "server" : "servers"
  const shardLabelPrefix = shardIds.length === 1 ? "shard" : "shards"

  return {
    activities: [
      {
        name: `${shardLabelPrefix} ${shardLabel} - ${guildCount} ${guildLabel}`,
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  }
}

registerCleanupHook(() => {
  clearRotatingStatus()
})
