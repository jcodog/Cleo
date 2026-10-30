import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AppShellPlatform = "discord" | "kick" | "twitch"

type AppShellState = {
  selectedDiscordGuildId?: string
  selectionClerkUserId?: string
  setSelectedDiscordGuildId: (
    guildId: string | undefined,
    clerkUserId: string
  ) => void
}

export const useAppShellStore = create<AppShellState>()(
  persist(
    (set) => ({
      selectedDiscordGuildId: undefined,
      setSelectedDiscordGuildId: (
        selectedDiscordGuildId,
        selectionClerkUserId
      ) => set({ selectedDiscordGuildId, selectionClerkUserId }),
    }),
    {
      name: "cleo-dashboard-shell",
      partialize: (state) => ({
        selectedDiscordGuildId: state.selectedDiscordGuildId,
        selectionClerkUserId: state.selectionClerkUserId,
      }),
    }
  )
)
