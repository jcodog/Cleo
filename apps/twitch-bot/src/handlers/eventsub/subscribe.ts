import {
  eventDefinitions,
  type EventPayload,
} from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function subscribe(
  event: EventPayload<"subscribe">,
  context: HandlerContext
): Promise<void> {
  if (event.is_gift) return
  const definition = eventDefinitions.subscribe
  await context.announcements.send(
    event.broadcaster_user_id,
    definition,
    definition.values(event),
    context.template
  )
}
