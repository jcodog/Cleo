export function getConvexAuthHydrationResult<Result>({
  isAuthenticated,
  liveResult,
  preloadedResult,
}: {
  isAuthenticated: boolean
  liveResult: Result
  preloadedResult: Result
}): Result {
  return isAuthenticated ? liveResult : preloadedResult
}
