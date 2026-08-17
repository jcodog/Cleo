import type { AppShellArea } from "@/features/app-shell/routes"

export type StaffToolAccess =
  | {
      status: "forbidden" | "disabled" | "ready"
    }
  | undefined

export type StaffTopbarEntry = {
  href: string
  mode: "dashboard" | "staff"
}

export function canShowStaffTools(access: StaffToolAccess): boolean {
  return access?.status === "ready"
}

export function getStaffTopbarEntry(
  area: AppShellArea,
  access: StaffToolAccess
): StaffTopbarEntry | null {
  if (!canShowStaffTools(access)) {
    return null
  }

  if (area === "staff") {
    return {
      href: "/dashboard",
      mode: "dashboard",
    }
  }

  return {
    href: "/staff",
    mode: "staff",
  }
}
