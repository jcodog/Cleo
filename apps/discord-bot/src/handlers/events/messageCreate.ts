import { Event } from "@/classes/Event"
import { moderateDiscordMessage } from "@/services/messageModeration"
export default new Event({
  name: "messageCreate",
  execute: moderateDiscordMessage,
})
