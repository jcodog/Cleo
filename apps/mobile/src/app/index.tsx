import { useAuth, useClerk, useSSO } from "@clerk/expo"
import { useConvexAuth } from "convex/react"
import { useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as WebBrowser from "expo-web-browser"
import * as AuthSession from "expo-auth-session"
import { Servers } from "../servers/Servers"
import { mobileSessionState } from "../lib/sessionState"
import { colors, styles } from "../theme"
import { NativeGlass } from "../components/NativeGlass"
import { SymbolView } from "expo-symbols"

WebBrowser.maybeCompleteAuthSession()

/** Gate the native directory on both restored Clerk and authenticated Convex sessions. */
export default function Home() {
  const { isLoaded, isSignedIn, sessionId } = useAuth()
  const { signOut } = useClerk()
  const { startSSOFlow } = useSSO()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const state = mobileSessionState(
    isLoaded,
    isSignedIn,
    isLoading,
    isAuthenticated
  )
  /** Activate only the session returned by the Clerk Discord SSO flow. */
  async function signIn() {
    setBusy(true)
    setError("")
    try {
      const result = await startSSOFlow({
        strategy: "oauth_discord",
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: "cleo",
          path: "sso-callback",
        }),
      })
      if (result.createdSessionId && result.setActive)
        await result.setActive({ session: result.createdSessionId })
      else if (
        result.authSessionResult?.type !== "cancel" &&
        result.authSessionResult?.type !== "dismiss"
      )
        setError(
          "Sign-in did not finish. Complete any required account steps in Cleo, then try again."
        )
    } catch {
      setError("Sign-in is unavailable. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }
  /** End the Clerk session; authentication gates remove the directory on sign-out. */
  async function leave() {
    setBusy(true)
    setError("")
    try {
      await signOut()
    } catch {
      setError("Sign-out failed. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <NativeGlass style={styles.glassToolbar}>
          <View style={styles.toolbar}>
            <Text style={styles.brand}>Cleo</Text>
            {isSignedIn ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                disabled={busy}
                onPress={leave}
                style={styles.textButton}
              >
                <Text style={styles.link}>Sign out</Text>
                <SymbolView
                  name={{
                    ios: "rectangle.portrait.and.arrow.right",
                    android: "logout",
                  }}
                  size={18}
                  tintColor={colors.cyan}
                />
              </Pressable>
            ) : null}
          </View>
        </NativeGlass>
        <Text accessibilityRole="header" style={styles.title}>
          {isSignedIn ? "My Servers" : "Your communities"}
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.status}>
            {error}
          </Text>
        ) : null}
      </View>
      {state === "ready" ? (
        <Servers key={sessionId} />
      ) : state === "signedOut" ? (
        <View style={styles.center}>
          <Text style={styles.body}>
            Sign in with the Discord account you use for Cleo to see the servers
            you manage.
          </Text>
          <NativeGlass interactive accent style={styles.glassAction}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              style={styles.nativeAction}
              onPress={signIn}
            >
              <Text style={styles.nativeActionText}>
                {busy ? "Opening Discord…" : "Continue with Discord"}
              </Text>
              <SymbolView
                name={{ ios: "arrow.right", android: "arrow_forward" }}
                size={20}
                tintColor={colors.cyan}
              />
            </Pressable>
          </NativeGlass>
        </View>
      ) : (
        <View style={styles.center}>
          {state === "backendUnavailable" ? (
            <Text accessibilityRole="alert" style={styles.status}>
              Your session is signed in, but Cleo could not authenticate with
              the backend. Check your connection or sign out and try again.
            </Text>
          ) : (
            <>
              <ActivityIndicator
                color={colors.cyan}
                accessibilityLabel="Restoring session"
              />
              <Text style={styles.body}>
                {state === "restoring"
                  ? "Restoring your secure session…"
                  : "Connecting to Cleo…"}
              </Text>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  )
}
