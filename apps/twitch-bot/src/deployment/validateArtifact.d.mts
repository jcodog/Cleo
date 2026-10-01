export const releaseFiles: readonly string[]
export function validateArtifact(
  directory: string,
  expectedSha: string
): Promise<void>
export function main(args?: string[]): Promise<void>
