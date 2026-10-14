export function useAuth() {
  return {
    userId: window.liveIdentity ?? "fixture-user",
    sessionId: "fixture-session",
  }
}
export function useClerk() {
  return { openUserProfile() {} }
}
