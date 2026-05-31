import { DashboardShellClient } from "@/features/app-shell"

const AppLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return <DashboardShellClient>{children}</DashboardShellClient>
}

export default AppLayout
