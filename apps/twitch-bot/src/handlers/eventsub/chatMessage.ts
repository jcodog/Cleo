import type { EventPayload } from "@workspace/shared/twitchEventSub"
export async function chatMessage(
  _event: EventPayload<"chatMessage">
): Promise<void> {
  // Chat commands are a separate feature. Never echo or execute viewer text here.
}
