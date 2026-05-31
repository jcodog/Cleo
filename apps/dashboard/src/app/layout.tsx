import { Geist, Geist_Mono, Outfit } from "next/font/google"
import "@workspace/ui/globals.css"
import { AppProviders } from "@/components/providers/app-providers"
import { ThemeProvider } from "@/components/providers/theme-provider"
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
        fontMono.variable,
        "font-sans",
        geist.variable,
        outfitHeading.variable
      )}
    >
      <body className="flex h-full min-h-screen w-full min-w-full flex-col overflow-x-hidden scroll-smooth bg-background text-foreground antialiased">
        <ThemeProvider>
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
