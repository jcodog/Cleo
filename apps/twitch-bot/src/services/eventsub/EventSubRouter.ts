import {
  eventDefinitions,
  type EventKey,
  type EventPayload,
} from "@workspace/shared/twitchEventSub"
import type { Logger } from "@workspace/logger"
import type { AnnouncementService } from "../announcements/AnnouncementService"
import type { ConvexService } from "../ConvexService"
export type HandlerContext = {
  announcements: Pick<AnnouncementService, "send">
  convex: Pick<ConvexService, "streamOnline">
  messageId: string
  template?: string
}
import { chatMessage } from "../../handlers/eventsub/chatMessage"
import { streamOnline } from "../../handlers/eventsub/streamOnline"
import { follow } from "../../handlers/eventsub/follow"
import { subscribe } from "../../handlers/eventsub/subscribe"
import { resubscribe } from "../../handlers/eventsub/resubscribe"
import { subscriptionGift } from "../../handlers/eventsub/subscriptionGift"
import { cheer } from "../../handlers/eventsub/cheer"
import { raid } from "../../handlers/eventsub/raid"
import { hypeTrainBegin } from "../../handlers/eventsub/hypeTrainBegin"
import { hypeTrainEnd } from "../../handlers/eventsub/hypeTrainEnd"
import { charityDonation } from "../../handlers/eventsub/charityDonation"

function route<K extends EventKey>(
  key: K,
  handler: (event: EventPayload<K>, context: HandlerContext) => Promise<void>
) {
  return {
    key,
    type: eventDefinitions[key].type,
    version: eventDefinitions[key].version,
    parse: (value: unknown) => {
      // K correlates the parser and handler. Zod validates external data first.
      const event = eventDefinitions[key].parse(value) as EventPayload<K>
      const broadcasterId =
        "broadcaster_user_id" in event
          ? event.broadcaster_user_id
          : event.to_broadcaster_user_id
      return {
        broadcasterId,
        dispatch: (context: HandlerContext) => handler(event, context),
      }
    },
  }
}
export const routes = [
  route("chatMessage", chatMessage),
  route("streamOnline", streamOnline),
  route("follow", follow),
  route("subscribe", subscribe),
  route("resubscribe", resubscribe),
  route("subscriptionGift", subscriptionGift),
  route("cheer", cheer),
  route("raid", raid),
  route("hypeTrainBegin", hypeTrainBegin),
  route("hypeTrainEnd", hypeTrainEnd),
  route("charityDonation", charityDonation),
]
export class EventSubRouter {
  constructor(
    private readonly services: Pick<HandlerContext, "announcements" | "convex">,
    private readonly logger: Logger
  ) {}
  async dispatch(
    parsed: ReturnType<(typeof routes)[number]["parse"]>,
    key: EventKey,
    messageId: string,
    template?: string,
    beforeSend?: () => Promise<boolean>
  ): Promise<void> {
    const announcements: HandlerContext["announcements"] = {
      send: (broadcaster, definition, values, custom) =>
        this.services.announcements.send(
          broadcaster,
          definition,
          values,
          custom,
          beforeSend
        ),
    }
    await parsed.dispatch({
      ...this.services,
      announcements,
      messageId,
      template,
    })
    this.logger.info("Event dispatched", {
      event: key,
    })
  }
}
