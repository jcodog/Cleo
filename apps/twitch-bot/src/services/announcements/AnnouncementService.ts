import { renderTemplate } from "@workspace/shared/twitchEventSub"
import type { TwitchApiService } from "../TwitchApiService"
import type { TwitchAuthService } from "../TwitchAuthService"
import type { Logger } from "@workspace/logger"

type Definition = Parameters<typeof renderTemplate>[0]
export class AnnouncementService {
  constructor(
    private readonly api: Pick<TwitchApiService, "sendChatMessage">,
    private readonly auth: Pick<TwitchAuthService, "appToken">,
    private readonly logger: Logger
  ) {}
  async send(
    broadcasterId: string,
    definition: Definition,
    values: Record<string, string>,
    template?: string
  ): Promise<void> {
    const message = renderTemplate(definition, values, template)
    await this.api.sendChatMessage(
      await this.auth.appToken(),
      broadcasterId,
      message
    )
    this.logger.info("Twitch chat message sent", { broadcasterId })
  }
}
