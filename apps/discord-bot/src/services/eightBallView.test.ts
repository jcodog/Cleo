import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ComponentType,
  MessageFlags,
  type AttachmentBuilder,
  type ContainerBuilder,
} from "discord.js"

import { buildEightBallView, EIGHT_BALL_IMAGE_NAME } from "./eightBallView"

test("buildEightBallView creates a Components V2 eight ball response", () => {
  const image = Buffer.from("fake-png")

  const view = buildEightBallView({
    question: "Will this actually work?",
    answer: "Without a doubt.",
    image,
    username: "Jason",
  })

  assert.equal(view.flags, MessageFlags.IsComponentsV2)

  assert.deepEqual(view.allowedMentions, {
    parse: [],
  })

  assert.equal(view.components?.length, 1)
  assert.equal(view.files?.length, 1)

  const container = view.components?.[0] as ContainerBuilder
  const containerJson = container.toJSON()

  assert.equal(containerJson.type, ComponentType.Container)

  assert.deepEqual(
    containerJson.components.map((component) => component.type),
    [
      ComponentType.TextDisplay,
      ComponentType.TextDisplay,
      ComponentType.Separator,
      ComponentType.MediaGallery,
      ComponentType.TextDisplay,
    ]
  )

  const [heading, question, , gallery, footer] = containerJson.components

  assert.equal(heading?.type, ComponentType.TextDisplay)

  if (heading?.type === ComponentType.TextDisplay) {
    assert.equal(heading.content, "## 🎱 Magic 8 Ball")
  }

  assert.equal(question?.type, ComponentType.TextDisplay)

  if (question?.type === ComponentType.TextDisplay) {
    assert.equal(question.content, "> Will this actually work?")
  }

  assert.equal(gallery?.type, ComponentType.MediaGallery)

  if (gallery?.type === ComponentType.MediaGallery) {
    assert.equal(gallery.items.length, 1)

    assert.equal(
      gallery.items[0]?.media.url,
      `attachment://${EIGHT_BALL_IMAGE_NAME}`
    )

    assert.equal(
      gallery.items[0]?.description,
      "Magic 8 Ball answer: Without a doubt."
    )
  }

  assert.equal(footer?.type, ComponentType.TextDisplay)

  if (footer?.type === ComponentType.TextDisplay) {
    assert.equal(footer.content, "-# Asked by Jason")
  }

  const attachment = view.files?.[0] as AttachmentBuilder

  assert.equal(attachment.name, EIGHT_BALL_IMAGE_NAME)
  assert.equal(attachment.description, "Magic 8 Ball answer: Without a doubt.")
  assert.equal(attachment.attachment, image)
})

test("buildEightBallView escapes user-provided markdown", () => {
  const view = buildEightBallView({
    question: "**Definitely not formatted by me**",
    answer: "Maybe.",
    image: Buffer.from("fake-png"),
    username: "*Jason*",
  })

  const container = view.components?.[0] as ContainerBuilder
  const json = container.toJSON()

  const textDisplays = json.components.filter(
    (component) => component.type === ComponentType.TextDisplay
  )

  assert.equal(
    textDisplays[1]?.type === ComponentType.TextDisplay
      ? textDisplays[1].content
      : undefined,
    "> \\*\\*Definitely not formatted by me\\*\\*"
  )

  assert.equal(
    textDisplays[2]?.type === ComponentType.TextDisplay
      ? textDisplays[2].content
      : undefined,
    "-# Asked by \\*Jason\\*"
  )
})
