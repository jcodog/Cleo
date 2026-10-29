"use client"

import { IconShield } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { AccountRoles } from "./AccountRoles"

export function LinkedRolesDialog() {
  return (
    <Dialog>
      <SidebarMenu>
        <SidebarMenuItem>
          <DialogTrigger render={<SidebarMenuButton tooltip="Linked Roles" />}>
            <IconShield aria-hidden />
            <span>Linked Roles</span>
          </DialogTrigger>
        </SidebarMenuItem>
      </SidebarMenu>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Discord Linked Roles</DialogTitle>
          <DialogDescription>
            Claim and manage your Linked Roles inside Discord.
          </DialogDescription>
        </DialogHeader>
        <AccountRoles />
      </DialogContent>
    </Dialog>
  )
}
