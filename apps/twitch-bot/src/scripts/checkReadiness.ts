import { checkReadiness } from "../readiness"

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [path, pid, notBefore] = args
  const expectedPid = Number(pid)
  const timestamp = Number(notBefore)
  if (
    args.length !== 3 ||
    !path ||
    !Number.isSafeInteger(expectedPid) ||
    expectedPid < 1 ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    !(await checkReadiness({ path, expectedPid, notBefore: timestamp }))
  )
    process.exitCode = 1
}
