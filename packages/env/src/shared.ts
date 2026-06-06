import { z } from "zod"

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value

export const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional()
)
export const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.url().optional()
)

export const nodeEnv = z
  .enum(["development", "test", "production"])
  .default("development")
