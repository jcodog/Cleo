import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()
crons.interval(
  "Twitch live notification retention",
  { hours: 1 },
  internal.liveNotifications.cleanup,
  {}
)
export default crons
