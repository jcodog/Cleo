import { renderTemplate } from "@workspace/shared/twitchEventSub"
import type { TwitchApiService } from "../TwitchApiService"
import type { TwitchAuthService } from "../TwitchAuthService"
import type { Logger } from "@workspace/logger"

type Definition = Parameters<typeof renderTemplate>[0]
export class AnnouncementService {
  constructor(
    private readonly api: Pick<TwitchApiService, "sendChatMessage">,
    private readonly auth: Pick<TwitchAuthService, "maintain">,
    private readonly logger: Logger
  ) {}
  async send(
    broadcasterId: string,
    definition: Definition,
    values: Record<string, string>,
    template?: string,
    beforeSend?: () => Promise<boolean>
  ): Promise<void> {
    const message = renderTemplate(definition, values, template)
    const token = await this.auth.maintain()
    const sent = await this.api.sendChatMessage(token, broadcasterId, message, beforeSend)
    if (!sent) return
    this.logger.info("Twitch chat message sent")
  }
}
