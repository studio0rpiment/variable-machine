import { prefRowProblem, rowProblem, type ChatRow, type DataFormat, type PrefRow } from './chatRow.ts'

/**
 * Datasets found elsewhere come in many shapes. These are the common ones,
 * matched by column names, each turned into the two shapes training reads:
 *
 *   chat         {"messages": [{role, content}, …]}  (already the right shape)
 *                question / answer · instruction (+ input or context) / output or response
 *                prompt / response or completion · user / assistant · input / output
 *   preference   prompt (or question, instruction) / chosen / rejected
 *
 * Column names are compared without case, spaces or punctuation, so
 * "Question", "question_text" and "QUESTION" all match "question".
 */

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

const ASK = ['question', 'instruction', 'prompt', 'user', 'input', 'query', 'questiontext', 'q']
const CONTEXT = ['context', 'input']
const ANSWER = ['answer', 'response', 'output', 'completion', 'assistant', 'answertext', 'target', 'a']

/** The column a row uses for each part, or null when its shape isn't one we know. */
export interface Shape {
  format: DataFormat
  /** human description, printed so the student sees how the columns were read */
  reads: string
  convert: (row: Record<string, unknown>) => ChatRow | PrefRow | null
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

type Msg = { role?: string; from?: string; content?: unknown; value?: unknown }
const asList = (v: unknown): Msg[] => (Array.isArray(v) ? (v as Msg[]) : [])
const roleOf = (m: Msg) => (m.role ?? m.from ?? '').toLowerCase()
/** The answer in a field that is either text or a conversation: its last assistant reply. */
const lastReply = (v: unknown) => (Array.isArray(v) ? text([...asList(v)].reverse().find((m) => ['assistant', 'gpt', 'bot'].includes(roleOf(m)))?.content ?? '') : text(v))
const firstUser = (v: unknown) => text(asList(v).find((m) => ['user', 'human'].includes(roleOf(m)))?.content ?? '')

function find(cols: string[], wanted: string[], not: string[] = []): string | undefined {
  for (const w of wanted) {
    const hit = cols.find((c) => key(c) === w && !not.includes(c))
    if (hit) return hit
  }
  return undefined
}

/** Work out a shape from the columns of the first row. */
export function detectShape(sample: Record<string, unknown>): Shape | null {
  const cols = Object.keys(sample)

  if (Array.isArray(sample.messages) || Array.isArray(sample.conversations)) {
    const field = Array.isArray(sample.messages) ? 'messages' : 'conversations'
    return {
      format: 'chat',
      reads: `"${field}" as the conversation`,
      convert: (r) => {
        const list = (r[field] as { role?: string; from?: string; content?: string; value?: string }[]) ?? []
        // ShareGPT-style rows say from: human/gpt and value; map them to roles.
        const role = (m: { role?: string; from?: string }) => {
          const v = (m.role ?? m.from ?? '').toLowerCase()
          return v === 'human' || v === 'user' ? 'user' : v === 'gpt' || v === 'assistant' || v === 'bot' ? 'assistant' : v === 'system' ? 'system' : null
        }
        const messages = list.flatMap((m) => {
          const ro = role(m)
          const content = text(m.content ?? m.value)
          return ro && content ? [{ role: ro as ChatRow['messages'][number]['role'], content }] : []
        })
        const row = { messages }
        return rowProblem(row) ? null : row
      },
    }
  }

  const chosen = find(cols, ['chosen'])
  const rejected = find(cols, ['rejected'])
  if (chosen && rejected) {
    // Answers may be plain text, or whole conversations (a list of messages) whose last reply is the answer.
    const prompt = find(cols, ['prompt', 'question', 'instruction', 'input'])
    if (!prompt && !Array.isArray(sample[chosen])) return null
    return {
      format: 'preference',
      reads: `${prompt ? `"${prompt}"` : `the first message of "${chosen}"`} as the question, "${chosen}" as the better answer, "${rejected}" as the worse one`,
      convert: (r) => {
        const row = { prompt: prompt ? text(r[prompt]) : firstUser(r[chosen]), chosen: lastReply(r[chosen]), rejected: lastReply(r[rejected]) }
        return prefRowProblem(row) ? null : row
      },
    }
  }

  const answer = find(cols, ANSWER)
  const ask = find(cols, ASK, answer ? [answer] : [])
  if (!ask || !answer) return null
  const context = find(cols, CONTEXT, [ask, answer])
  return {
    format: 'chat',
    reads: `"${ask}"${context ? ` (with "${context}" added below it)` : ''} as the question, "${answer}" as the answer`,
    convert: (r) => {
      const q = text(r[ask])
      const c = context ? text(r[context]) : ''
      const row = { messages: [{ role: 'user' as const, content: c ? `${q}\n\n${c}` : q }, { role: 'assistant' as const, content: text(r[answer]) }] }
      return rowProblem(row) ? null : row
    },
  }
}

export const SHAPES_HELP = [
  'chat: a "messages" list, or two columns such as question/answer, instruction/response, prompt/completion, input/output',
  'preference: three columns, prompt (or question) / chosen / rejected',
]

/** A small CSV reader: commas, quoted fields with "" inside, newlines inside quotes. The first line names the columns. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (field += '"'), i++
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') row.push(field), (field = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  const [head, ...body] = rows
  if (!head) return []
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])))
}
