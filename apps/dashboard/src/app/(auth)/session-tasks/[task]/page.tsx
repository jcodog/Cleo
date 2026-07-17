import type { Metadata } from "next"

import { ClerkSessionTask } from "@/features/auth/ClerkSessionTask"

export const metadata: Metadata = {
  title: "Complete sign-in",
}

export default async function SessionTaskPage({
  params,
}: {
  params: Promise<{ task: string }>
}) {
  const { task } = await params

  return <ClerkSessionTask task={task} />
}
