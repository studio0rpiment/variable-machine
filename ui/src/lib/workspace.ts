/** Read-only views of workspace/ (helper/src/workspace.ts). */

export interface Entry {
  name: string
  dir: boolean
  size: number
  modified: string
}

export async function listDir(dir: string): Promise<Entry[]> {
  const res = await fetch(`/api/workspace/list?dir=${encodeURIComponent(dir)}`)
  return res.ok ? res.json() : []
}

export async function readFile(path: string): Promise<string | null> {
  const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`)
  return res.ok ? res.text() : null
}

export async function readManifests<T>(dir: string): Promise<(T & { folder: string })[]> {
  const res = await fetch(`/api/workspace/manifests?dir=${encodeURIComponent(dir)}`)
  return res.ok ? res.json() : []
}
