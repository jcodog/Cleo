import React from "react"
import { Image as NextImage } from "next/dist/client/image-component"
export default function Image(props: React.ComponentProps<typeof NextImage>) {
  return <NextImage {...props} unoptimized />
}
