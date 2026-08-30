import { Geist, Geist_Mono, Outfit } from "next/font/google"
import type { Metadata, Viewport } from "next"
import "@clerk/ui/themes/shadcn.css"
import "@workspace/ui/globals.css"
import { dashboardEnv } from "@workspace/env/dashboard"
import { AppProviders } from "@/components/providers/app-providers"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { cn } from "@workspace/ui/lib/utils"

const outfitHeading = Outfit({ subsets: ["latin"], variable: "--font-heading" })

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const metadataBase = new URL(
  dashboardEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
)

// Keep this pre-paint resolver aligned with ThemeProvider's storage and system rules.
const themeScript = `try{const storedTheme=localStorage.getItem("theme");const isDark=storedTheme==="dark"||(storedTheme!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);const root=document.documentElement;root.classList.toggle("dark",isDark);root.style.colorScheme=isDark?"dark":"light";root.style.backgroundColor=isDark?"#0a0a0b":"#ffffff"}catch{}`

const description =
  "Manage your Discord server with Cleo's moderation, welcome, logs, support, automation, and AI-assisted tools."

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Cleo | Manage your Discord community",
    template: "%s | Cleo",
  },
  description,
  applicationName: "Cleo",
  authors: [{ name: "JCoNet LTD" }],
  creator: "JCoNet LTD",
  publisher: "JCoNet LTD",
  category: "technology",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: "Cleo",
    title: "Cleo | Manage your Discord community",
    description,
    url: "/",
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Cleo, the community assistant",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Cleo | Manage your Discord community",
    description,
    images: ["/android-chrome-512x512.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    title: "Cleo",
    statusBarStyle: "black-translucent",
  },
}

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
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
