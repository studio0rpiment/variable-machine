import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'

export interface ChatRecord {
  timestamp: string
  model: string
  prompt: string
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
