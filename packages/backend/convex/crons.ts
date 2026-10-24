import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()
crons.interval(
  "Guild Premium Stripe reconciliation",
  { minutes: 5 },
  internal.premiumActions.reconcileKnown,
  {}
)
crons.interval(
  "Discord native Linked Roles reconciliation",
  { minutes: 5 },
  internal.discordConnections.reconcile,
  {}
)
crons.interval(
  "Consented community recognition delivery",
  { minutes: 1 },
  internal.recognitionActions.deliver,
  {}
)
crons.interval(
  "Ambiguous community recognition reconciliation",
  { minutes: 5 },
  internal.recognitionActions.reconcile,
  {}
)
crons.interval(
  "Community account role reconciliation",
  { minutes: 5 },
  internal.communityRoles.bootstrap,
  {}
)
crons.interval(
  "Twitch webhook receipt retention",
  { hours: 1 },
  internal.twitchEventSub.cleanupReceipts,
  {}
)
crons.interval(
  "Twitch live notification retention",
  { hours: 1 },
  internal.liveNotifications.cleanup,
  {}
)
export default crons
