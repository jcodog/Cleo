import type { StaffTopbarEntry } from "@/features/app-shell/staffAccess"

export type StaffUserButtonLink = {
  href: string
  icon: "home" | "shield-lock"
  label: "Cleo Dashboard" | "Staff Dashboard"
}

export function getStaffUserButtonLink(
  staffEntry: StaffTopbarEntry | null
): StaffUserButtonLink | null {
  if (!staffEntry) {
    return null
  }

  if (staffEntry.mode === "staff") {
    return {
      href: staffEntry.href,
      icon: "shield-lock",
      label: "Staff Dashboard",
    }
  }

  return {
    href: staffEntry.href,
    icon: "home",
    label: "Cleo Dashboard",
  }
}
