import {
  eventDefinitions,
  type EventPayload,
} from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function resubscribe(
  event: EventPayload<"resubscribe">,
  context: HandlerContext
): Promise<void> {
  const definition = eventDefinitions.resubscribe
  await context.announcements.send(
    event.broadcaster_user_id,
    definition,
    definition.values(event),
    context.template
  )
}
