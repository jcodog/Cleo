import { Geist, Geist_Mono, Outfit } from "next/font/google"
import type { Metadata, Viewport } from "next"
import "@workspace/ui/globals.css"
import { appOrigin, siteMetadata } from "@/lib/siteMetadata"
import { landingEnv } from "@workspace/env/landing"
import { LandingSessionProvider } from "@/components/LandingSessionProvider"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@workspace/ui/lib/utils"

// Keep the pre-paint resolver aligned with the local ThemeProvider.
const themeScript = `try{const storedTheme=localStorage.getItem("theme");const isDark=storedTheme==="dark"||(storedTheme!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);const root=document.documentElement;root.classList.toggle("dark",isDark);root.style.colorScheme=isDark?"dark":"light";root.style.backgroundColor=isDark?"#0a0a0b":"#ffffff"}catch{}`

const outfitHeading = Outfit({ subsets: ["latin"], variable: "--font-heading" })

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = siteMetadata()

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
}

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
        fontMono.variable,
        "font-sans",
        geist.variable,
        outfitHeading.variable
      )}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-full min-h-screen w-full min-w-full flex-col overflow-x-hidden scroll-smooth bg-background text-foreground antialiased">
        <ThemeProvider>
          <LandingSessionProvider
            publishableKey={landingEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
            origin={appOrigin()}
          >
            {children}
          </LandingSessionProvider>
          <div className="fixed right-5 bottom-5 z-50">
            <ThemeToggle />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
