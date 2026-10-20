const user = {
  externalAccounts: [
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
export const useClerk = () => ({ openUserProfile() {} })
export const useReverification = (callback: unknown) => callback
