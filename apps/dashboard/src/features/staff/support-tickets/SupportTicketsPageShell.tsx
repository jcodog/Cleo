"use client"

import { IconAlertTriangle, IconLifebuoy } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useQuery } from "convex/react"

export function SupportTicketsPageShell() {
  const result = useQuery(api.queries.dashboard.supportTickets.listJcn.list, {})

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">
          JCN Support Tickets
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Private Cleo product support requests opened from Discord DMs and
          user-install contexts.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Support Queue</CardTitle>
          <CardDescription>
            Only messages explicitly submitted through `/help` are stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result === undefined ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : result.status === "forbidden" ? (
            <Empty className="min-h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconAlertTriangle aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Access Not Available</EmptyTitle>
                <EmptyDescription>
                  This queue requires a staff, admin, or superadmin account.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : result.tickets.length === 0 ? (
            <Empty className="min-h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconLifebuoy aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No JCN Support Tickets</EmptyTitle>
                <EmptyDescription>
                  New private `/help` requests will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requester</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latest submitted message</TableHead>
                    <TableHead className="text-right">Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.tickets.map((ticket) => (
                    <TableRow key={ticket.ticketId}>
                      <TableCell className="font-mono text-xs">
                        {ticket.requesterDiscordUserId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {formatLabel(ticket.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-lg whitespace-normal">
                        {ticket.latestMessage ?? "No stored message"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDateTime(ticket.lastActivityAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatLabel(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}
