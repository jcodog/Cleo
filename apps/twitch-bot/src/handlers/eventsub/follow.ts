import {
  eventDefinitions,
  type EventPayload,
} from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function follow(
  event: EventPayload<"follow">,
  context: HandlerContext
): Promise<void> {
  const definition = eventDefinitions.follow
  await context.announcements.send(
    event.broadcaster_user_id,
    definition,
    definition.values(event),
    context.template
  )
}
