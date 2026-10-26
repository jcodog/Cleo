import { ClerkProvider, useAuth } from "@clerk/expo"
import { tokenCache } from "@clerk/expo/token-cache"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { Text, View } from "react-native"
import { styles, colors } from "../theme"

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL
const convex = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null

/** Restore the Clerk SecureStore session before Convex can authenticate native routes. */
export default function RootLayout() {
  if (!publishableKey || !convex)
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Cleo needs configuration</Text>
        <Text style={styles.body}>
          Set the Clerk publishable key and Convex URL for this development
          build.
        </Text>
      </View>
    )
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
