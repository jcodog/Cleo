import { z } from "zod"

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value
const nodeEnvValues = ["development", "test", "production"] as const

type NodeEnv = (typeof nodeEnvValues)[number]

type OptionalUrlOptions = {
  nodeEnv?: NodeEnv | (() => string | undefined)
}

export const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional()
)
export const optionalUrl = createOptionalUrl()

export const nodeEnv = z.enum(nodeEnvValues).default("development")

export function createOptionalUrl(options: OptionalUrlOptions = {}) {
  return z.preprocess(
    emptyStringToUndefined,
    z
      .url()
      .optional()
      .superRefine((value, ctx) => {
        if (value === undefined) {
          return
        }

        let url: URL

        try {
          url = new URL(value)
        } catch {
          return
        }

        if (url.protocol === "https:") {
          return
        }

        const currentNodeEnv = resolveNodeEnv(options.nodeEnv)

        if (
          url.protocol === "http:" &&
          currentNodeEnv !== "production" &&
          isLoopbackHostname(url.hostname)
        ) {
          return
        }

        ctx.addIssue({
          code: "custom",
          message:
            "URL must use HTTPS unless it is explicit loopback HTTP outside production.",
        })
      })
  )
}

function resolveNodeEnv(value: OptionalUrlOptions["nodeEnv"]): NodeEnv {
  const defaultNodeEnv =
    typeof process === "undefined" ? undefined : process.env.NODE_ENV
  const resolvedValue =
    typeof value === "function" ? value() : (value ?? defaultNodeEnv)

  return nodeEnvValues.includes(resolvedValue as NodeEnv)
    ? (resolvedValue as NodeEnv)
    : "development"
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  )
}
