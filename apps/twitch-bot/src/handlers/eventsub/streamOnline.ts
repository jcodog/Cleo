import type { EventPayload } from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function streamOnline(
  event: EventPayload<"streamOnline">,
  context: HandlerContext
): Promise<void> {
  await context.convex.streamOnline(context.messageId, event)
}
