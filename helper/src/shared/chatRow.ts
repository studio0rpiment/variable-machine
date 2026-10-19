/**
 * mlx-lm's chat format, one object per line:
 *   {"messages":[{"role":"system"|"user"|"assistant","content":"…"}, …]}
 * Shared by the helper (validate, count) and the UI (viewer, generator).
 */
export interface ChatRow {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
}

const ROLES = new Set(['system', 'user', 'assistant'])

/** Returns a reason the row is not usable for training, or null when it is. */
export function rowProblem(row: unknown): string | null {
  if (!row || typeof row !== 'object' || !Array.isArray((row as ChatRow).messages)) return 'needs a "messages" array'
  const m = (row as ChatRow).messages
  if (m.length < 2) return 'needs at least a user and an assistant message'
  for (const [i, msg] of m.entries()) {
    if (!msg || !ROLES.has(msg.role)) return `message ${i + 1}: role must be system, user or assistant`
    if (typeof msg.content !== 'string' || !msg.content.trim()) return `message ${i + 1}: content is empty`
  }
  if (!m.some((x) => x.role === 'user')) return 'has no user message'
  if (m.at(-1)!.role !== 'assistant') return 'must end with an assistant message (that is what gets learned)'
  return null
}

/**
 * Tokens, estimated as characters / 3.7, plus a few per message for the chat
 * template. An estimate, and labelled as one: the real count depends on the
 * base model's tokenizer.
 */
export function estimateTokens(row: ChatRow): number {
  return row.messages.reduce((n, m) => n + Math.ceil(m.content.length / 3.7) + 4, 0)
}

export function simpleRow(user: string, assistant: string, system?: string): ChatRow {
  return {
    messages: [...(system ? [{ role: 'system' as const, content: system }] : []), { role: 'user', content: user }, { role: 'assistant', content: assistant }],
  }
}

/** A preference pair (DPO): one prompt, the answer to move toward, the answer to move away from. */
export interface PrefRow {
  prompt: string
  chosen: string
  rejected: string
}

export function prefRowProblem(row: unknown): string | null {
  if (!row || typeof row !== 'object') return 'needs {"prompt", "chosen", "rejected"}'
  for (const k of ['prompt', 'chosen', 'rejected'] as const) {
    const v = (row as Record<string, unknown>)[k]
    if (typeof v !== 'string' || !v.trim()) return `"${k}" is missing or empty`
  }
  const r = row as PrefRow
  if (r.chosen.trim() === r.rejected.trim()) return 'chosen and rejected are the same answer'
  return null
}

export function estimatePrefTokens(row: PrefRow): number {
  // Both sequences are scored: prompt + chosen, prompt + rejected.
  return Math.ceil((2 * row.prompt.length + row.chosen.length + row.rejected.length) / 3.7) + 16
}

export type DataFormat = 'chat' | 'preference'
export const problemFor = (format: DataFormat) => (format === 'preference' ? prefRowProblem : rowProblem)
