const user = {
  externalAccounts: [
    {
      provider: "discord",
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
      providerUserId: "222",
      approvedScopes:
        "channel:bot moderator:read:followers bits:read channel:read:subscriptions",
      verification: { status: "verified" },
    },
  ],
}
export const useUser = () => ({ user, isLoaded: true })
export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: true,
  userId: "fixture-clerk",
  sessionId: "fixture-session",
})
export const useClerk = () => ({ openUserProfile() {} })
export const useReverification = (callback: unknown) => callback
export const UserButton = Object.assign(() => null, {
  MenuItems: () => null,
  Link: () => null,
  Action: () => null,
})
