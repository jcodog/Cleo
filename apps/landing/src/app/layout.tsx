import { Geist, Geist_Mono, Outfit } from "next/font/google"
import type { Metadata, Viewport } from "next"
import "@workspace/ui/globals.css"
import { siteMetadata } from "@/lib/siteMetadata"
import { cn } from "@workspace/ui/lib/utils"

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
        "dark font-sans",
        geist.variable,
        outfitHeading.variable
      )}
    >
      <body className="flex h-full min-h-screen w-full min-w-full flex-col overflow-x-hidden scroll-smooth bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
