import { CLEO_ROLE_FAQ } from "../packages/shared/src/cleoRoleEligibility"
const records = [
  {
    key: "personal_premium",
    type: 7,
    name: "Personal Premium",
    description: "An active paid Cleo personal subscription",
  },
  {
    key: "creator_pro",
    type: 7,
    name: "Creator Pro",
    description: "An active paid Cleo creator subscription",
  },
  {
    key: "community_owner_tier",
    type: 2,
    name: "Community Owner tier",
    description:
      "0 none, 1 verified independent community owner, 2 Premium community owner",
  },
  {
    key: "community_manager_tier",
    type: 2,
    name: "Community Manager tier",
    description:
      "0 none, 1 verified independent community administrator, 2 Premium administrator",
  },
  {
    key: "premium_supporter",
    type: 7,
    name: "Premium Supporter",
    description:
      "Current verified paid community supporter who consents to a visible role",
  },
]
if (process.argv.includes("--faq")) process.stdout.write(CLEO_ROLE_FAQ + "\n")
else if (!process.argv.includes("--apply"))
  process.stdout.write(JSON.stringify(records, null, 2) + "\n")
else {
  const applicationId = process.env.DISCORD_APPLICATION_ID
  const token = process.env.DISCORD_BOT_TOKEN
  if (!applicationId || !/^\d{17,20}$/.test(applicationId) || !token)
    throw new Error("Configure DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN.")
  const response = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/role-connections/metadata`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(records),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    }
  )
  if (!response.ok)
    throw new Error(`Metadata registration failed (${response.status}).`)
  process.stdout.write("Registered five Linked Role metadata fields.\n")
}
