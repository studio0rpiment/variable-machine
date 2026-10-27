import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'

const KINDS = ['data', 'raw', 'runs', 'adapters', 'merges', 'fused', 'tools', 'images', 'outputs', 'audio', 'gestures', 'packages'] as const
const NAME = /^[A-Za-z0-9][\w.-]{0,127}$/

/**
 * `trash <data|runs|adapters|merges|fused|tools|images|outputs|audio|gestures>/<name>`: move one artifact to the
 * Mac's Trash, so starting over never loses anything for good (it can be put
 * back from the Trash). A model exported to Ollama is removed separately,
 * with `ollama rm`.
 */
export async function trashCommand(args: string[]): Promise<boolean> {
  const [target] = args
  const [kind, name, ...rest] = (target ?? '').split('/')
  if (!KINDS.includes(kind as (typeof KINDS)[number]) || !name || !NAME.test(name) || rest.length || args.length !== 1) {
    print(`usage: trash <${KINDS.join('|')}>/<name>   moves it to the Trash`)
    return false
  }
  const from = path.join(WORKSPACE, kind, name)
  try {
    await fs.access(from)
  } catch {
    print(`no workspace/${kind}/${name}`)
    return false
  }
  const bin = path.join(os.homedir(), '.Trash')
  const to = path.join(bin, `${name} (variable machine ${kind}, ${new Date().toISOString().slice(0, 19).replace('T', ' ')})`)
  try {
    await fs.rename(from, to)
  } catch {
    // Another disk, or no access to the Trash: a copy-then-remove would be a real delete, so don't.
    print(`couldn't move workspace/${kind}/${name} to the Trash; nothing was removed`)
    return false
  }
  print(`  ◂ workspace/${kind}/${name} → Trash`)
  return true
}
