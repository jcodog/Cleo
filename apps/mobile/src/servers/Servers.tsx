import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native"
import { useAction, useQuery } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { directoryNotice } from "../lib/sessionState"
import { colors, styles } from "../theme"

class DirectoryBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <View style={styles.center}>
        <Text accessibilityRole="alert" style={styles.body}>
          Your server list is unavailable.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={this.props.retry}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    ) : (
      this.props.children
    )
  }
}
export function Servers() {
  const [attempt, setAttempt] = useState(0)
  return (
    <DirectoryBoundary
      key={attempt}
      retry={() => setAttempt((value) => value + 1)}
    >
      <Directory />
    </DirectoryBoundary>
  )
}
function Directory() {
  const directory = useQuery(
    api.queries.dashboard.discord.guilds.directory.list
  )
  const sync = useAction(
    api.actions.dashboard.discord.guilds.syncDashboardGuilds.sync
  )
  const syncAccounts = useAction(
    api.actions.dashboard.account.syncLinkedAccounts.sync
  )
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [clock, setClock] = useState(0)
  const lifecycle = useRef<AbortController | null>(null)
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      setRefreshing(true)
      setError("")
      try {
        const account = await syncAccounts({})
        if (signal.aborted) return
        if (account.status !== "ready")
          throw new Error("Account verification is unavailable.")
        for (let attempt = 0; attempt < 15; attempt++) {
          const result = await sync({})
          if (signal.aborted) return
          if (result.status === "ready") return
          if (result.status !== "verificationPending")
            throw new Error(
              "Discord verification is unavailable. Your last-known servers remain visible."
            )
          await new Promise<void>((resolve) => setTimeout(resolve, 1000))
          if (signal.aborted) return
        }
        throw new Error(
          "Discord is still verifying permissions. Pull to check again shortly."
        )
      } catch (failure) {
        if (!signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Verification failed. Pull to retry."
          )
      } finally {
        if (!signal.aborted) setRefreshing(false)
      }
    },
    [sync, syncAccounts]
  )
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])
  if (!directory)
    return (
      <View style={styles.center}>
        <ActivityIndicator
          color={colors.cyan}
          accessibilityLabel="Loading servers"
        />
        <Text style={styles.body}>Finding your servers…</Text>
      </View>
    )
  const expired = directory.guilds.some(
    (guild) => guild.verified && (guild.verifiedAt ?? 0) + 300000 <= clock
  )
  const notice = directoryNotice(
    expired && directory.status === "ready" ? "expired" : directory.status
  )
  const reload = () => {
    if (!refreshing && lifecycle.current) void refresh(lifecycle.current.signal)
  }
  return (
    <FlatList
      data={directory.guilds}
      keyExtractor={(guild) => guild.discordGuildId}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.cyan}
          onRefresh={reload}
        />
      }
      ListHeaderComponent={
        <View style={styles.message}>
          <Text style={styles.body}>
            Discord servers you manage with Cleo. Pull down to verify
            permissions.
          </Text>
          {notice ? (
            <Text accessibilityRole="status" style={styles.status}>
              {notice}
            </Text>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.status}>
              {error}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.message}>
          <Text style={styles.name}>No servers to show</Text>
          <Text style={styles.body}>
            Cleo must be installed in a server where your Discord account has
            Manage Server permission.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={reload}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Refresh servers</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => {
        const verified =
          item.verified && (item.verifiedAt ?? 0) + 300000 > clock
        return (
          <View
            style={styles.row}
            accessible
            accessibilityLabel={`${item.name}, ${verified ? "verified management access" : "verification required"}`}
          >
            {item.iconUrl ? (
              <Image source={{ uri: item.iconUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.name}>
                  {item.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.body}>
                {item.memberCount !== undefined
                  ? `${item.memberCount.toLocaleString()} members`
                  : "Member count unavailable"}
              </Text>
              <Text style={verified ? styles.body : styles.status}>
                {verified ? "Management verified" : "Verification required"}
              </Text>
            </View>
          </View>
        )
      }}
    />
  )
}
