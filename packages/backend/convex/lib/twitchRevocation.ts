import type { Doc } from "../_generated/dataModel"

// The barrier survives consumer removal and provider deletion. Legacy rows fail closed.
export function chatRevoked(
  row: Pick<
    Doc<"twitchEventSubscriptions">,
    "key" | "status" | "authorizationRevoked"
  >
): boolean {
  return (
    row.key === "chatMessage" &&
    (row.authorizationRevoked === true || row.status === "revoked")
  )
}
