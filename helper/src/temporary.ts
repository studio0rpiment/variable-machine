import fs from 'node:fs/promises'
import path from 'node:path'
import { OLLAMA_URL, WORKSPACE } from './config.ts'
import { broadcast } from './hub.ts'

/**
 * Variants made on the Modelfile tab are temporary until the student keeps
 * them. Their names are listed in workspace/modelfiles/unsaved.json; when
 * Variable Machine stops, each one is removed from Ollama and its Modelfile
 * deleted, so a class of experiments doesn't pile up on the computer. The
 * same sweep runs at start, which catches a stop that gave no time to clean
 * (a closed terminal window, a crash).
 *
 * Variants made by typing `ollama create` in the terminal are deliberate and
 * never listed. Clean-up removes the name from Ollama only: a variant shares
 * its weights with the model it came from, so those stay.
 */
const LIST = path.join(WORKSPACE, 'modelfiles', 'unsaved.json')
const modelfileOf = (name: string) => path.join(WORKSPACE, 'modelfiles', `${name}.Modelfile`)

async function read(): Promise<string[]> {
  try {
    const v = JSON.parse(await fs.readFile(LIST, 'utf8'))
    return Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

async function write(names: string[]) {
  await fs.mkdir(path.dirname(LIST), { recursive: true })
  await fs.writeFile(LIST, JSON.stringify([...new Set(names)].sort(), null, 2) + '\n')
}

const exists = (f: string) => fs.access(f).then(() => true, () => false)

/**
 * Called just before the Modelfile tab writes a Modelfile. A new name starts
 * out temporary; one that's already kept stays kept when it's made again.
 */
export async function markIfNew(name: string) {
  const names = await read()
  if (names.includes(name)) return
  if (await exists(modelfileOf(name))) return // already on disk and not listed: kept earlier
  await write([...names, name])
}

/** The student chose to keep it: it's no longer cleaned up. */
export async function keep(name: string) {
  const names = await read()
  if (!names.includes(name)) return
  await write(names.filter((n) => n !== name))
}

/** Remove every temporary variant from Ollama and the workspace. Returns the names removed. */
export async function sweep(): Promise<string[]> {
  const names = await read()
  if (!names.length) return []
  const removed: string[] = []
  for (const name of names) {
    // Ollama may already be gone at shutdown; then the name stays listed and the next start removes it.
    const res = await fetch(new URL('/api/delete', OLLAMA_URL), { method: 'DELETE', body: JSON.stringify({ model: name }) }).catch(() => null)
    if (!res || (!res.ok && res.status !== 404)) continue
    await fs.rm(modelfileOf(name), { force: true })
    removed.push(name)
  }
  await write(names.filter((n) => !removed.includes(n)))
  for (const model of removed) broadcast({ type: 'ollama.changed', model, change: 'removed' })
  return removed
}
