import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { BotStatusFields, OverviewField } from "../components/workspace-ui"
import type { GuildOverview } from "../types"

export function SettingsSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Server access</CardTitle>
        <CardDescription>
          Current Cleo presence and your verified management access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <OverviewField label="Server" value={overview.name} />
          <OverviewField
            label="Management access"
            value={overview.membership.isOwner ? "Owner" : "Manager"}
          />
          <BotStatusFields isBotLeft={isBotLeft} overview={overview} />
        </dl>
      </CardContent>
    </Card>
  )
}
