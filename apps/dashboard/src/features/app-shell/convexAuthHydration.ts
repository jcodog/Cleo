export function getConvexAuthHydrationResult<Result>({
  hasAuthenticationResolved,
  isAuthenticated,
  isLoading,
  liveResult,
  preloadedResult,
}: {
  hasAuthenticationResolved: boolean
  isAuthenticated: boolean
  isLoading: boolean
  liveResult: Result
  preloadedResult: Result
}): Result | undefined {
  if (isAuthenticated) {
    return liveResult
  }

  if (isLoading && !hasAuthenticationResolved) {
    return preloadedResult
  }

  return undefined
}
