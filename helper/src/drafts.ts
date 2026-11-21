import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { ollamaPost } from './ollama.ts'
import { setRunning, write } from './run.ts'
import { simpleRow, type ChatRow } from './shared/chatRow.ts'
import type { DatasetManifest, DraftRow } from './shared/manifest.ts'

/**
 * Drafts: rows a model writes for a dataset, waiting for a person to read them.
 *
 *   data draft <name> --from raw/<name>|uploads/<file>.txt [--fields a,b,c] [--count 200] [--model qwen3:4b]
 *
 * The model reads the material a passage at a time and writes rows from it,
 * ten to a call, into workspace/data/<name>/drafts.jsonl, each marked
 * unreviewed. Nothing goes into train.jsonl here: on the Data tab each draft
 * is kept (`data append … --draft <id>`, edited first if need be) or rejected
 * (`data reject <name> <id>`).
 *
 * With --fields, each row is a made-up text and its fields as JSON, for a
 * reader model (a small model that returns the same fields every time). Without, each row is
 * a question about the passage and its answer (a character's voice).
 */

const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const BATCH = 10
const FIELD = /^[a-z][a-z0-9_]{0,31}$/

export const draftsFile = (name: string) => ws('data', name, 'drafts.jsonl')

export async function readDrafts(name: string): Promise<DraftRow[]> {
  const text = await fs.readFile(draftsFile(name), 'utf8').catch(() => '')
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as DraftRow)
}

const writeDrafts = (name: string, drafts: DraftRow[]) => fs.writeFile(draftsFile(name), drafts.map((d) => JSON.stringify(d)).join('\n') + (drafts.length ? '\n' : ''))

/** How many drafts are in each state, for the manifest. */
export const tally = (drafts: DraftRow[]) => ({
  unreviewed: drafts.filter((d) => d.state === 'unreviewed').length,
  kept: drafts.filter((d) => d.state === 'kept').length,
  rejected: drafts.filter((d) => d.state === 'rejected').length,
})

/** The material as passages: a raw source's chunks, or an uploaded text split at blank lines into pieces of about 2,000 characters. */
async function passages(from: string): Promise<string[] | null> {
  if (/^raw\/[a-z0-9][a-z0-9._-]*$/.test(from)) {
    const t = await fs.readFile(ws(from, 'chunks.jsonl'), 'utf8').catch(() => null)
    return t === null ? null : t.split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { text: string }).text)
  }
  if (/^uploads\/[\w.-]+\.(txt|md)$/.test(from)) {
    const t = await fs.readFile(ws(from), 'utf8').catch(() => null)
    if (t === null) return null
    const out: string[] = []
    let cur = ''
    for (const para of t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
      if (cur && cur.length + para.length > 2000) out.push(cur), (cur = '')
      cur = cur ? `${cur}\n\n${para}` : para
    }
    if (cur) out.push(cur)
    return out
  }
  return null
}

function prompt(n: number, passage: string, fields: string[] | null) {
  return fields
    ? [
        'You make up training examples for a reader model: a small model that reads one kind of text and returns the same fields every time, as JSON.',
        `Write ${n} examples as JSON: {"rows":[{"text":"…","fields":{${fields.map((f) => `"${f}":"…"`).join(',')}}}]}.`,
        'Each text is one the people in the notes might send or receive: made up, but true to the notes. Vary who writes, how long it is and how it is worded; in some, leave a field unsaid.',
        `Each fields object has exactly these fields: ${fields.join(', ')}, copied from its own text. Every value must be written in the text itself, not only in the notes: a message is signed by the name its sender field gives. A field the text doesn't say is "".`,
        'Do not copy the notes, and do not leave placeholders.',
        '',
        'The notes:',
        '',
        passage,
      ].join('\n')
    : [
        'You write training examples for a small chat model, from a passage of someone\'s writing.',
        `Write ${n} examples as JSON: {"rows":[{"user":"…","assistant":"…"}]}.`,
        'Each user turn is a question a curious reader might ask about the passage; each assistant turn answers it clearly, true to the passage, in the voice of its writing.',
        'Do not copy the passage whole, and do not leave placeholders.',
        '',
        'The passage:',
        '',
        passage,
      ].join('\n')
}

function schema(n: number, fields: string[] | null) {
  const row = fields
    ? { type: 'object', properties: { text: { type: 'string' }, fields: { type: 'object', properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])), required: fields } }, required: ['text', 'fields'] }
    : { type: 'object', properties: { user: { type: 'string' }, assistant: { type: 'string' } }, required: ['user', 'assistant'] }
  return { type: 'object', properties: { rows: { type: 'array', minItems: n, maxItems: n, items: row } }, required: ['rows'] }
}

/** One row from the model as a chat row, or null when it is empty or a placeholder. */
function toRow(o: unknown, fields: string[] | null): ChatRow | null {
  const r = o as { text?: unknown; fields?: Record<string, unknown>; user?: unknown; assistant?: unknown }
  const real = (s: unknown): s is string => typeof s === 'string' && s.replace(/[.…\s]/g, '').length >= 3
  if (fields) {
    if (!real(r.text) || !r.fields || typeof r.fields !== 'object') return null
    const answer = Object.fromEntries(fields.map((f) => [f, typeof r.fields![f] === 'string' ? (r.fields![f] as string).trim() : '']))
    return simpleRow(r.text.trim(), JSON.stringify(answer))
  }
  return real(r.user) && real(r.assistant) ? simpleRow(r.user.trim(), r.assistant.trim()) : null
}

/** `ensure` reads the set's manifest, making the set if it isn't there: it is called once the options are found good, so a mistyped command makes nothing. */
export async function draft(name: string, ensure: () => Promise<DatasetManifest>, opts: Record<string, string>, line: string, save: (m: DatasetManifest) => Promise<void>): Promise<boolean> {
  const usage = 'usage: data draft <name> --from raw/<name>|uploads/<file>.txt [--fields a,b,c] [--count 200] [--model qwen3:4b]'
  if (!opts.from) return print(usage), false
  const ps = await passages(opts.from)
  if (!ps?.length) return print(`data draft: nothing to read at workspace/${opts.from} (a raw source from data raw …, or a .txt or .md uploaded on the Data tab)`), false
  const fields = opts.fields ? opts.fields.split(',').map((f) => f.trim()).filter(Boolean) : null
  if (fields && (!fields.length || !fields.every((f) => FIELD.test(f)))) return print('data draft: --fields are lowercase names, comma-separated: sender,work,ask,deadline'), false
  const count = Math.max(1, Math.min(1000, Number(opts.count ?? 200) || 200))
  const model = opts.model ?? 'qwen3:4b'
  const m = await ensure()
  if ((m.format ?? 'chat') !== 'chat') return print(`data draft: ${name} is a ${m.format} dataset; drafts are chat rows`), false

  const drafts = await readDrafts(name)
  const train = (await fs.readFile(ws('data', name, 'train.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean)
  const seen = new Set([...drafts.map((d) => d.row.messages.find((x) => x.role === 'user')?.content), ...train.map((l) => (JSON.parse(l) as ChatRow).messages.find((x) => x.role === 'user')?.content)])
  let id = drafts.reduce((a, d) => Math.max(a, d.id), 0)
  let made = 0
  let calls = 0
  const abort = new AbortController()
  setRunning({ abort })
  print(`${model} writes ${count} rows from ${ps.length} passage${ps.length === 1 ? '' : 's'} of workspace/${opts.from}, ${BATCH} to a call${fields ? `; fields: ${fields.join(', ')}` : ''}`)
  try {
    // a call that gives nothing new counts too, so a model that only repeats itself stops
    while (made < count && calls < Math.ceil(count / BATCH) * 2) {
      const n = Math.min(BATCH, count - made)
      const passage = ps[calls % ps.length]
      calls++
      const res = await ollamaPost('/api/chat', { model, stream: false, think: false, format: schema(n, fields), messages: [{ role: 'system', content: prompt(n, passage, fields) }, { role: 'user', content: `Write ${n}.` }], options: { temperature: 0.9 } }, abort.signal)
      const out = (await res.json()) as { message?: { content?: string }; error?: string }
      if (out.error) throw new Error(out.error)
      let rows: unknown[] = []
      try {
        rows = (JSON.parse(out.message?.content ?? '') as { rows?: unknown[] }).rows ?? []
      } catch {
        /* a call that broke off; the next one goes on */
      }
      const fresh: DraftRow[] = []
      for (const r of rows) {
        const row = toRow(r, fields)
        const user = row?.messages.find((x) => x.role === 'user')?.content
        if (!row || seen.has(user)) continue
        seen.add(user)
        fresh.push({ id: ++id, state: 'unreviewed', model, from: opts.from, row })
      }
      if (fresh.length) await fs.appendFile(draftsFile(name), fresh.map((d) => JSON.stringify(d)).join('\n') + '\n')
      drafts.push(...fresh)
      made += fresh.length
      write(`\r\x1b[2K  ${made} of ${count} drafted`)
    }
  } catch (err) {
    write('\n')
    print(abort.signal.aborted ? '  ◂ stopped' : `data draft: ${(err as Error).message}`)
    if (!made) return false
  } finally {
    setRunning(null)
  }
  write('\n')
  m.drafts = tally(drafts)
  if (!m.inputs.includes(`workspace/${opts.from}`)) m.inputs.push(`workspace/${opts.from}`)
  if (m.command.at(-1) !== line) m.command.push(line)
  await save(m)
  print(`  ◂ ${name}/drafts.jsonl · ${m.drafts.unreviewed} to read: keep, edit or reject each one on the Data tab`)
  return true
}

/** Mark one draft kept or rejected; the manifest's tally follows. Returns the draft, or null if there is none to mark. */
export async function markDraft(name: string, id: number, state: 'kept' | 'rejected'): Promise<{ draft: DraftRow; drafts: ReturnType<typeof tally> } | null> {
  const drafts = await readDrafts(name)
  const d = drafts.find((x) => x.id === id)
  if (!d || d.state !== 'unreviewed') return null
  d.state = state
  await writeDrafts(name, drafts)
  return { draft: d, drafts: tally(drafts) }
}
