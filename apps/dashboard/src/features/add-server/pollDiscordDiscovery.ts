/** Pending verification is retryable, not an installed/installable decision. */
export async function pollDiscordDiscovery<T extends { status: string }>(
  request: () => Promise<T>,
  signal: AbortSignal,
  onPending?: (result: T) => void
): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (signal.aborted) throw new Error("Discord discovery cancelled.")
    const result = await request()
    if (signal.aborted) throw new Error("Discord discovery cancelled.")
    if (result.status !== "verificationPending") return result
    onPending?.(result)
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(new Error("Discord discovery cancelled."))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort)
        resolve()
      }, 1000)
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) abort()
    })
  }
  throw new Error(
    "Discord verification is taking longer than expected. Try again."
  )
}
