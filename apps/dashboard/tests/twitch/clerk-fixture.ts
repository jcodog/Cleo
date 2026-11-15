const user = {
  id: "fixture-clerk",
  reload: async () => user,
  externalAccounts: [
    {
      provider: "discord",
      username: "Cleo tester",
      providerUserId: "111111111111111111",
      approvedScopes: "identify guilds",
      verification: { status: "verified" },
      reauthorize: async () => ({
        verification: {
          externalVerificationRedirectURL: new URL(
            "https://discord.com/oauth2/authorize?client_id=fixture&scope=role_connections.write&state=clerk-state"
          ),
        },
      }),
    },
    {
      provider: "twitch",
      username: "cleo_channel",
      providerUserId: "222",
      approvedScopes:
        "channel:bot moderator:read:followers bits:read channel:read:subscriptions",
      verification: { status: "verified" },
      destroy: async () => {
        if (new URLSearchParams(location.search).has("failDisconnect"))
          throw new Error("Connection failed")
        user.externalAccounts = user.externalAccounts.filter(
          (account) => account.provider !== "twitch"
        )
      },
    },
  ],
}
export const useUser = () => ({ user, isLoaded: true })
export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: true,
  userId: "fixture-clerk",
  sessionId: "fixture-session",
  getToken: async (options: unknown) => {
    window.dispatchEvent(new CustomEvent("token-fixture", { detail: options }))
    if (new URLSearchParams(location.search).has("failSession"))
      throw new Error("Session unavailable")
    return "fixture-session-token"
  },
})
export const useClerk = () => ({
  openUserProfile() {},
  signOut(options: unknown) {
    window.dispatchEvent(
      new CustomEvent("signout-fixture", { detail: options })
    )
    return Promise.resolve()
  },
})
export const useReverification = (callback: unknown) => callback
export const UserButton = Object.assign(() => null, {
  MenuItems: () => null,
  Link: () => null,
  Action: () => null,
})
