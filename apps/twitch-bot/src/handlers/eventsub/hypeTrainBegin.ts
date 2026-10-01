import {
  eventDefinitions,
  type EventPayload,
} from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function hypeTrainBegin(
  event: EventPayload<"hypeTrainBegin">,
  context: HandlerContext
): Promise<void> {
  const definition = eventDefinitions.hypeTrainBegin
  await context.announcements.send(
    event.broadcaster_user_id,
    definition,
    definition.values(event),
    context.template
  )
}
