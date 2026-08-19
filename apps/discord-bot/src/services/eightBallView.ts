import {
  AttachmentBuilder,
  ContainerBuilder,
  escapeMarkdown,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type InteractionReplyOptions,
} from "discord.js"

export type EightBallViewOptions = {
  question: string
  answer: string
  image: Buffer
  username: string
}

export const EIGHT_BALL_IMAGE_NAME = "eight-ball.png"

export function buildEightBallView({
  question,
  answer,
  image,
  username,
}: EightBallViewOptions): InteractionReplyOptions {
  const attachment = new AttachmentBuilder(image, {
    name: EIGHT_BALL_IMAGE_NAME,
    description: `Magic 8 Ball answer: ${answer}`,
  })

  const heading = new TextDisplayBuilder().setContent("## 🎱 Magic 8 Ball")

  const questionDisplay = new TextDisplayBuilder().setContent(
    `> ${escapeMarkdown(question)}`
  )

  const separator = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small)

  const gallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${EIGHT_BALL_IMAGE_NAME}`)
      .setDescription(`Magic 8 Ball answer: ${answer}`)
  )

  const footer = new TextDisplayBuilder().setContent(
    `-# Asked by ${escapeMarkdown(username)}`
  )

  const container = new ContainerBuilder()
    .addTextDisplayComponents(heading, questionDisplay)
    .addSeparatorComponents(separator)
    .addMediaGalleryComponents(gallery)
    .addTextDisplayComponents(footer)

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    files: [attachment],
    allowedMentions: {
      parse: [],
    },
  }
}
