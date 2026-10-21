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

/**
 * A run's loss points: from loss.jsonl, or, when that is empty (a run whose
 * live lines weren't recognised), read again from its full log.
 */
export async function readLossPoints<T>(folder: string, parse: (line: string) => T | null): Promise<T[]> {
  const saved = ((await readFile(`runs/${folder}/loss.jsonl`)) ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T)
  if (saved.length) return saved
  return ((await readFile(`runs/${folder}/log.txt`)) ?? '').split('\n').flatMap((l) => {
    const p = parse(l)
    return p ? [p] : []
  })
}
