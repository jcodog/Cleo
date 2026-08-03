const DISCORD_FETCH_TIMEOUT_MS = 10_000
const DISCORD_RATE_LIMIT_MAX_RETRIES = 2
const DISCORD_RATE_LIMIT_WAIT_BUDGET_MS = 5_000

export type DiscordJsonResponse = {
  ok: boolean
  status: number
  json?: unknown
}

type DiscordRestTransportOptions = {
  fetch?: typeof fetch
  sleep?: (delayMs: number) => Promise<void>
  requestTimeoutMs?: number
  maxRateLimitRetries?: number
  rateLimitWaitBudgetMs?: number
}

export async function fetchDiscordJson(
  url: string,
  init: RequestInit,
  options: DiscordRestTransportOptions = {}
): Promise<DiscordJsonResponse | null> {
  const fetchImpl = options.fetch ?? fetch
  const sleep = options.sleep ?? wait
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DISCORD_FETCH_TIMEOUT_MS
  const maxRateLimitRetries =
    options.maxRateLimitRetries ?? DISCORD_RATE_LIMIT_MAX_RETRIES
  const rateLimitWaitBudgetMs =
    options.rateLimitWaitBudgetMs ?? DISCORD_RATE_LIMIT_WAIT_BUDGET_MS
  let retries = 0
  let waitedMs = 0

  try {
    while (true) {
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs)
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal
      const response = await fetchImpl(url, {
        ...init,
        signal,
      })

      if (response.status === 429) {
        const retryDelayMs = await getRetryDelayMs(response)
        await discardResponseBody(response)

        if (
          retryDelayMs === null ||
          retries >= maxRateLimitRetries ||
          retryDelayMs > rateLimitWaitBudgetMs - waitedMs
        ) {
          return { ok: false, status: response.status }
        }

        retries += 1
        waitedMs += retryDelayMs
        await sleep(retryDelayMs)
        continue
      }

      if (!response.ok) {
        await discardResponseBody(response)
        return { ok: false, status: response.status }
      }

      if (response.status === 204) {
        return { ok: true, status: response.status }
      }

      return {
        ok: true,
        status: response.status,
        json: await response.json(),
      }
    }
  } catch {
    return null
  }
}

async function discardResponseBody(response: Response): Promise<void> {
  if (response.body === null || response.bodyUsed) {
    return
  }

  try {
    await response.body.cancel()
  } catch {
    // Preserving the Discord status is more useful than surfacing cleanup errors.
  }
}

async function getRetryDelayMs(response: Response): Promise<number | null> {
  const headerDelay = parseRetryDelayMs(response.headers.get("Retry-After"))

  if (headerDelay !== null) {
    return headerDelay
  }

  try {
    const body: unknown = await response.json()

    if (typeof body !== "object" || body === null || !("retry_after" in body)) {
      return null
    }

    return parseRetryDelayMs(body.retry_after)
  } catch {
    return null
  }
}

function parseRetryDelayMs(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null
  }

  const seconds = Number(value)

  if (!Number.isFinite(seconds) || seconds < 0) {
    return null
  }

  return Math.ceil(seconds * 1_000)
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
