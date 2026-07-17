import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    default: "Sign in",
    template: "%s | Cleo",
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
}

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
