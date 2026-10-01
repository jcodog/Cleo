import {
  eventDefinitions,
  type EventPayload,
} from "@workspace/shared/twitchEventSub"
import type { HandlerContext } from "../../services/eventsub/EventSubRouter"
export async function charityDonation(
  event: EventPayload<"charityDonation">,
  context: HandlerContext
): Promise<void> {
  const definition = eventDefinitions.charityDonation
  await context.announcements.send(
    event.broadcaster_user_id,
    definition,
    definition.values(event),
    context.template
  )
}
