export type DiscordChannelOption = {
  id: string
  name: string
  type: "text" | "announcement" | "thread" | "forum"
}

export type DiscordRoleOption = {
  id: string
  name: string
}

export type DiscordConfigOptions = {
  channels: DiscordChannelOption[]
  roles: DiscordRoleOption[]
}

export function getChannelOptionLabel(channel: DiscordChannelOption): string {
  const typeLabel = {
    announcement: "Announcement",
    forum: "Forum",
    text: "Text",
    thread: "Thread",
  }[channel.type]

  return `#${channel.name} · ${typeLabel}`
}

export function getSelectedOptionState<TOption extends { id: string }>(
  options: TOption[],
  selectedId: string
): { option?: TOption; missing: boolean } {
  if (!selectedId) {
    return { missing: false }
  }

  const option = options.find((candidate) => candidate.id === selectedId)

  return option ? { option, missing: false } : { missing: true }
}

export function getMissingRoleIds(
  roles: DiscordRoleOption[],
  selectedIds: string[]
): string[] {
  const availableIds = new Set(roles.map((role) => role.id))

  return selectedIds.filter((id) => !availableIds.has(id))
}
