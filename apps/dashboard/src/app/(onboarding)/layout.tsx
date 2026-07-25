import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    default: "Welcome",
    template: "%s | Cleo",
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
}

export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
