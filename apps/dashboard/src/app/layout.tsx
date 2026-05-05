import { Geist, Geist_Mono, Outfit } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"

import "@workspace/ui/globals.css"
import { AppProviders } from "@/components/app-providers"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"

const outfitHeading = Outfit({ subsets: ["latin"], variable: "--font-heading" })

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable,
        outfitHeading.variable
      )}
    >
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
        >
          <ThemeProvider>
            <AppProviders>{children}</AppProviders>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
