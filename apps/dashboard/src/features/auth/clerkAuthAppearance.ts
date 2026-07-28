import type { ComponentProps } from "react"
import { SignIn } from "@clerk/nextjs"
import { dark } from "@clerk/themes"

type ClerkAuthAppearance = NonNullable<
  ComponentProps<typeof SignIn>["appearance"]
>

export const clerkAuthAppearance: ClerkAuthAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    elevation: "flush",
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
  },
  variables: {
    colorPrimary: "#0891b2",
    colorForeground: "#f8fafc",
    colorMutedForeground: "#94a3b8",
    colorBackground: "transparent",
    colorInput: "rgba(255, 255, 255, 0.04)",
    colorInputForeground: "#f8fafc",
    colorBorder: "rgba(255, 255, 255, 0.12)",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full",
    card: "w-full bg-transparent p-0 shadow-none",
    header: "gap-3 text-left",
    headerTitle:
      "font-heading text-3xl font-semibold tracking-[-0.025em] text-foreground",
    headerSubtitle: "text-sm leading-6 text-muted-foreground",
    socialButtons: "gap-3",
    socialButtonsBlockButton:
      "h-12 w-full rounded-md border border-white/15 bg-white/[0.04] text-sm font-medium text-foreground shadow-none transition-colors hover:bg-white/[0.08]",
    socialButtonsBlockButtonText: "font-medium text-foreground",
    dividerRow: "hidden",
    form: "gap-4",
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldInput:
      "h-11 rounded-md border-white/15 bg-white/[0.04] text-foreground shadow-none focus:border-cyan-400 focus:ring-cyan-400/30",
    formButtonPrimary:
      "h-12 rounded-md bg-cyan-600 text-sm font-medium text-white shadow-none hover:bg-cyan-500",
    formFieldErrorText: "text-sm text-red-400",
    alert: "border border-red-400/30 bg-red-400/10 text-red-100",
    footer: "bg-transparent px-0 pt-6",
    footerAction: "text-sm text-muted-foreground",
    footerActionLink:
      "font-medium text-foreground underline-offset-4 hover:underline",
  },
}
