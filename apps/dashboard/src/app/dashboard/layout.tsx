import { DashboardShellClient } from "@/features/app-shell"

const DashboardLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  return <DashboardShellClient>{children}</DashboardShellClient>
}

export default DashboardLayout
