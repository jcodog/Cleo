"use node"
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  verify,
  createPublicKey,
} from "node:crypto"
import { backendEnv } from "@workspace/env/backend"
export const digestIntegrationValue = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export function encryptDiscordTokens(value: string) {
  const key = Buffer.from(
    backendEnv.DISCORD_TOKEN_ENCRYPTION_KEY ?? "",
    "base64"
  )
  if (key.length !== 32)
    throw new Error("Discord token encryption is not configured.")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((b) => b.toString("base64url"))
    .join(".")
}
export function decryptDiscordTokens(value: string) {
  const [iv, tag, ciphertext] = value.split(".")
  const key = Buffer.from(
    backendEnv.DISCORD_TOKEN_ENCRYPTION_KEY ?? "",
    "base64"
  )
  if (!iv || !tag || !ciphertext || key.length !== 32)
    throw new Error("Discord token encryption unavailable.")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
export function verifyDiscordApplicationWebhook(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
  now: number
) {
  if (
    body.length > 65536 ||
    !/^[a-f0-9]{128}$/i.test(signature) ||
    !/^[a-f0-9]{64}$/i.test(publicKey) ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000
  )
    return false
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKey, "hex"),
    ]),
    format: "der",
    type: "spki",
  })
  return verify(
    null,
    Buffer.from(timestamp + body),
    key,
    Buffer.from(signature, "hex")
  )
}
export function verifyStripeSignature(
  body: string,
  header: string,
  secret: string,
  now: number
) {
  if (body.length > 262144 || header.length > 8192) return false
  const parts = header.split(",").map((part) => part.split("="))
  const timestamp = parts.find(([key]) => key === "t")?.[1]
  if (
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000
  )
    return false
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest()
  return parts.some(
    ([key, value]) =>
      key === "v1" &&
      !!value &&
      /^[a-f0-9]{64}$/i.test(value) &&
      timingSafeEqual(expected, Buffer.from(value, "hex"))
  )
}
