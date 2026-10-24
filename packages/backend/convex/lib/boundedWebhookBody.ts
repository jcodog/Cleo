/** Read raw signed bytes with a hard limit, including chunked requests. */
export async function boundedWebhookBody(
  request: Request,
  maximum: number
): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > maximum) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > maximum) {
        await reader.cancel()
        return null
      }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}
