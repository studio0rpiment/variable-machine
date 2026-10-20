import fs from 'node:fs/promises'
import { existsSync, readdirSync, renameSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { print } from './hub.ts'

/**
 * pCloud (and sync services like it) sometimes answers a file that was
 * rewritten quickly by renaming it "name [conflicted].ext", or "[conflicted 2]".
 * Sometimes that leaves a copy next to the real file; sometimes the real file
 * is gone and the conflicted one is the only copy. So: when the real file is
 * there, the conflicted copy goes to the Trash; when it isn't, the conflicted
 * one is renamed back, because it is the real file.
 */
const CONFLICT = / \[conflicted(?: \d+)?\](?=\.[^./\\]*$|$)/i

export const isConflicted = (p: string) => CONFLICT.test(path.basename(p))

export async function tidyConflict(p: string, quiet = false): Promise<void> {
  if (!isConflicted(p)) return
  const original = path.join(path.dirname(p), path.basename(p).replace(CONFLICT, ''))
  try {
    if (existsSync(original)) {
      const bin = path.join(os.homedir(), '.Trash')
      await fs.rename(p, path.join(bin, `${path.basename(p)} (${Date.now()})`))
      if (!quiet) print(`\x1b[2m  a sync service left a copy of ${path.basename(original)}; moved it to the Trash\x1b[22m`)
    } else {
      await fs.rename(p, original)
      if (!quiet) print(`\x1b[2m  a sync service renamed ${path.basename(original)}; put its name back\x1b[22m`)
    }
  } catch {
    // gone already, or not ours to move: leave it
  }
}

/** Look through a folder (not node_modules) for ones left while the helper wasn't running. */
export async function sweepConflicts(root: string) {
  const walk = async (dir: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '.git') await walk(p)
      } else if (isConflicted(e.name)) await tidyConflict(p)
    }
  }
  await walk(root)
}

/** For the page server: if index.html was renamed away, put it back right now. */
export function restoreSync(dir: string, name: string): boolean {
  try {
    const stem = name.replace(/\.[^.]+$/, '')
    const ext = path.extname(name)
    const hit = readdirSync(dir).find((f) => f.startsWith(`${stem} [conflicted`) && f.endsWith(ext))
    if (!hit) return false
    renameSync(path.join(dir, hit), path.join(dir, name))
    return true
  } catch {
    return false
  }
}
