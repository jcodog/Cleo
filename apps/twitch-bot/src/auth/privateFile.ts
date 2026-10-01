import { constants } from "node:fs"
import { lstat, open, link, rename, unlink } from "node:fs/promises"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"

export async function readPrivateJson(
  path: string,
  maxBytes: number
): Promise<unknown> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  try {
    const stat = await handle.stat()
    if (
      !stat.isFile() ||
      stat.size > maxBytes ||
      (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    )
      throw new Error("State must be a private regular file.")
    return JSON.parse(await handle.readFile("utf8"))
  } finally {
    await handle.close()
  }
}

export async function syncPrivateDirectory(path: string): Promise<void> {
  if (process.platform === "win32") return
  const parent = await open(
    dirname(path),
    constants.O_RDONLY | constants.O_NOFOLLOW
  )
  try {
    await parent.sync()
  } finally {
    await parent.close()
  }
}

export async function writePrivateJson(
  path: string,
  value: unknown,
  overwrite = true
): Promise<void> {
  const directory = await lstat(dirname(path))
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (process.platform !== "win32" && (directory.mode & 0o077) !== 0)
  )
    throw new Error(
      "State directory must be private and must not be a symlink."
    )
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(JSON.stringify(value))
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (overwrite) await rename(temporary, path)
    else await link(temporary, path)
    await syncPrivateDirectory(path)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}
