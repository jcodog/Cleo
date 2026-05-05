import { z } from "zod"

export const optionalString = z.string().min(1).optional()
export const optionalUrl = z.url().optional()

export const nodeEnv = z
  .enum(["development", "test", "production"])
  .default("development")
