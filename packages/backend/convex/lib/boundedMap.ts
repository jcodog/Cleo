/** Independent work uses a fixed worker pool, preserving input order. */
export async function boundedMap<T, R>(
  items: readonly T[],
  limit: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Invalid concurrency limit.")
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await operation(items[index]!)
      }
    })
  )
  return results
}
