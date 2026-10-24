import type { EventPayload } from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function chatMessage(
  event: EventPayload<"chatMessage">,
  context?: HandlerContext
): Promise<void> {
  await context?.moderation?.(event)
}
