import { useEffect, useState, type ReactNode } from "react"
import {
  AccessibilityInfo,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect"
import { colors } from "../theme"

export function NativeGlass({
  children,
  style,
  interactive = false,
  accent = false,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  interactive?: boolean
  accent?: boolean
}) {
  const [reduceTransparency, setReduceTransparency] = useState(true)
  useEffect(() => {
    let active = true
    let preferenceChanged = false
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (value) => {
        preferenceChanged = true
        if (active) setReduceTransparency(value)
      }
    )
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (active && !preferenceChanged) setReduceTransparency(value)
      })
      .catch(() => {
        /* Keep the opaque appearance if accessibility state is unavailable. */
      })
    return () => {
      active = false
      subscription.remove()
    }
  }, [])
  if (
    reduceTransparency ||
    !isGlassEffectAPIAvailable() ||
    !isLiquidGlassAvailable()
  ) {
    return (
      <View
        style={[
          { backgroundColor: accent ? "#083344" : colors.surface },
          style,
        ]}
      >
        {children}
      </View>
    )
  }
  return (
    <GlassView
      colorScheme="dark"
      glassEffectStyle="regular"
      isInteractive={interactive}
      tintColor={accent ? "#0891b244" : undefined}
      style={style}
    >
      {children}
    </GlassView>
  )
}
