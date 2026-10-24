import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT, WORKSPACE } from './config.ts'
import { scopePath } from './run.ts'
import { IMAGE_EXT } from './shared/kinds.ts'

export interface ChatRecord {
  timestamp: string
  model: string
  prompt: string
  /** the picture sent with the prompt, a workspace path */
  image?: string
  system?: string
  answer: string
  thinking?: string
  options?: Record<string, unknown>
  stats?: { evalCount?: number; durationMs?: number }
}

/** Local date, so a late-night session doesn't land in tomorrow's file. */
export function today(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Append one exchange to workspace/chat/<date>.jsonl. Returns the workspace-relative path. */
export async function appendChat(record: ChatRecord): Promise<string> {
  const rel = path.join('chat', `${today()}.jsonl`)
  const file = path.join(WORKSPACE, rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, JSON.stringify(record) + '\n')
  return rel
}

/**
 * A picture for a chat, by its workspace path (images/<set>/<photo>), read in
 * as the base64 Ollama wants. Only photos inside workspace/ are read.
 */
export async function readPicture(rel: string): Promise<{ path: string; base64: string } | null> {
  const scoped = scopePath(rel)
  if (!scoped || !IMAGE_EXT.test(scoped)) return null
  try {
    return { path: scoped, base64: (await fs.readFile(path.join(ROOT, scoped))).toString('base64') }
  } catch {
    return null
  }
}
