import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AppShellPlatform = "discord" | "kick" | "twitch"

type AppShellState = {
  selectedDiscordGuildId?: string
  setSelectedDiscordGuildId: (guildId?: string) => void
}

export const useAppShellStore = create<AppShellState>()(
  persist(
    (set) => ({
      selectedDiscordGuildId: undefined,
      setSelectedDiscordGuildId: (selectedDiscordGuildId) =>
        set({ selectedDiscordGuildId }),
    }),
    {
      name: "cleo-dashboard-shell",
      partialize: (state) => ({
        selectedDiscordGuildId: state.selectedDiscordGuildId,
      }),
    }
  )
)
