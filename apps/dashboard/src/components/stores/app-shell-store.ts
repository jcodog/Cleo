import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AppShellPlatform = "discord" | "kick" | "twitch"

type AppShellState = {
  selectedPlatform: AppShellPlatform
  selectedDiscordGuildId?: string
  setSelectedPlatform: (platform: AppShellPlatform) => void
  setSelectedDiscordGuildId: (guildId?: string) => void
}

export const useAppShellStore = create<AppShellState>()(
  persist(
    (set) => ({
      selectedPlatform: "discord",
      selectedDiscordGuildId: undefined,
      setSelectedPlatform: (selectedPlatform) => set({ selectedPlatform }),
      setSelectedDiscordGuildId: (selectedDiscordGuildId) =>
        set({ selectedDiscordGuildId }),
    }),
    {
      name: "cleo-dashboard-shell",
      partialize: (state) => ({
        selectedPlatform: state.selectedPlatform,
        selectedDiscordGuildId: state.selectedDiscordGuildId,
      }),
    }
  )
)
