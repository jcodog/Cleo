import { v } from "convex/values"

export const welcomeStyle = v.object({
  preset: v.union(
    v.literal("classic"),
    v.literal("aurora"),
    v.literal("spotlight"),
    v.literal("ribbon")
  ),
  palette: v.union(
    v.literal("cyan"),
    v.literal("orchid"),
    v.literal("forest"),
    v.literal("amber")
  ),
  greeting: v.string(),
  align: v.union(v.literal("left"), v.literal("center")),
})
