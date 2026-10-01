import {
  eventDefinitions,
  type EventPayload,
} from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function raid(
  event: EventPayload<"raid">,
  context: HandlerContext
): Promise<void> {
  const definition = eventDefinitions.raid
  await context.announcements.send(
    event.to_broadcaster_user_id,
    definition,
    definition.values(event),
    context.template
  )
}
