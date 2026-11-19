import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { ollamaPost } from './ollama.ts'
import { setRunning, write } from './run.ts'
import type { DatasetManifest } from './shared/manifest.ts'
import { asObject, same, schemaFor, type Fields } from './score.ts'

/**
 * A reader model: a small model with one job, which reads one kind of text (a
 * message, an invoice, a build log) and returns the same fields every time, as
 * JSON. Its dataset is chat rows whose answer is a JSON object. A multi-agent
 * studio's agents call readers from their scripts (the Projects tab's "models
 * for a multi-agent studio").
 *
 *   reader check <model> <dataset> [--against qwen3:4b|none] [--limit 100]
 *
 * Every row set aside at the split is read twice: by the trained reader, and
 * by the stand-in (qwen3:4b, told the fields and held to them by a JSON
 * schema), which is what a studio uses until its reader is trained. Both are
 * scored the same way: JSON with every field, each field right, each row right,
 * and the time a row takes. Saves check-<model>.json in the dataset's folder.
 */

const DATASET = /^[a-z0-9][a-z0-9._-]{0,63}$/
const STAND_IN = 'qwen3:4b'
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)

type Msg = { role: string; content: string }

export interface ReaderScore {
  model: string
  /** rows whose answer was JSON with every field */
  complete: number
  /** fields right, of rows × fields */
  right: number
  fields: number
  /** rows with every field right */
  rows: number
  /** average milliseconds a row took */
  ms: number
}

export interface ReaderCheck {
  reader: true
  model: string
  against: string | null
  dataset: string
  at: string
  n: number
  fields: string[]
  scores: ReaderScore[]
  rows: { text: string; want: Fields; got: Record<string, { answer: string; wrong: string[] }> }[]
}

const readRows = async (name: string, part: string) =>
  (await fs.readFile(ws('data', name, `${part}.jsonl`), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { messages: Msg[] })

async function chat(body: object, signal: AbortSignal): Promise<string> {
  const res = await ollamaPost('/api/chat', { stream: false, ...body }, signal)
  const out = (await res.json()) as { message?: { content?: string }; error?: string }
  if (out.error) throw new Error(out.error)
  return out.message?.content ?? ''
}

function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = words[++i] ?? ''
    else pos.push(words[i])
  }
  return { pos, opts }
}

const USAGE = 'usage: reader check <model> <dataset> [--against qwen3:4b|none] [--limit 100]   a reader against a stand-in, on the rows set aside'

export async function readerCommand(args: string[]): Promise<boolean> {
  const { pos, opts } = flags(args)
  if (pos[0] !== 'check') return print(USAGE), false
  const [, model, name] = pos
  const m = DATASET.test(name ?? '') ? await fs.readFile(ws('data', name, 'manifest.json'), 'utf8').then((t) => JSON.parse(t) as DatasetManifest).catch(() => null) : null
  if (!model || !m) return print(USAGE), false
  if (m.format !== 'chat') return print(`reader check: ${name} is a ${m.format} dataset; a reader's rows are chat rows whose answer is JSON`), false
  const valid = await readRows(name, 'valid')
  if (!valid.length) return print(`${name} has no rows set aside: data split ${name}`), false
  const answers = valid.map((r) => asObject(r.messages.at(-1)?.content ?? ''))
  const bad = answers.findIndex((a) => !a)
  if (bad >= 0) return print(`reader check: row ${bad + 1} of ${name}/valid.jsonl has an answer that isn't a JSON object, so there are no fields to check`), false
  const fields = [...new Set(answers.flatMap((a) => Object.keys(a!)))]
  const against = opts.against === 'none' ? null : (opts.against ?? STAND_IN)
  const limit = Math.min(valid.length, Number(opts.limit ?? 100))
  const rows = valid.slice(0, limit)
  const schema = schemaFor(fields, answers as Fields[])
  // the stand-in is told the fields and shown one answer from the training rows, as a studio script's fixed prompt would
  const example = (await readRows(name, 'train')).map((r) => r.messages.at(-1)?.content ?? '').find((t) => asObject(t))
  const standIn = (system: string | undefined) =>
    [system, `Read the text and return only JSON with exactly these fields: ${fields.join(', ')}. Copy facts from the text; leave a field empty when the text doesn't say.`, example && `An answer looks like this: ${example}`].filter(Boolean).join('\n\n')

  const abort = new AbortController()
  setRunning({ abort })
  const result: ReaderCheck = { reader: true, model, against, dataset: name, at: new Date().toISOString(), n: rows.length, fields, scores: [], rows: rows.map((r, i) => ({ text: r.messages.find((x) => x.role === 'user')?.content ?? '', want: answers[i]!, got: {} })) }
  try {
    for (const who of [model, ...(against ? [against] : [])]) {
      const score: ReaderScore = { model: who, complete: 0, right: 0, fields: 0, rows: 0, ms: 0 }
      for (const [i, r] of rows.entries()) {
        const asked = r.messages.slice(0, -1)
        const system = asked.find((x) => x.role === 'system')?.content
        const t0 = Date.now()
        const answer =
          who === model
            ? await chat({ model, messages: asked, format: 'json', options: { temperature: 0, num_predict: 300 } }, abort.signal)
            : await chat({ model: who, messages: [{ role: 'system', content: standIn(system) }, ...asked.filter((x) => x.role !== 'system')], think: false, format: schema, options: { temperature: 0, num_predict: 400 } }, abort.signal)
        score.ms += Date.now() - t0
        const got = asObject(answer)
        const want = answers[i]!
        const wrong = fields.filter((k) => !got || !same(got[k], want[k]))
        if (got && fields.every((k) => k in got)) score.complete++
        score.fields += fields.length
        score.right += fields.length - wrong.length
        if (!wrong.length) score.rows++
        result.rows[i].got[who] = { answer: answer.trim(), wrong }
        write(`\r\x1b[2K${who}: ${i + 1} of ${rows.length} · rows right ${score.rows}`)
      }
      score.ms = Math.round(score.ms / rows.length)
      result.scores.push(score)
      write('\n')
    }
  } catch (err) {
    write('\n')
    print(abort.signal.aborted ? '  ◂ stopped' : `reader check: ${(err as Error).message}`)
    if (!result.scores.length) return false
  } finally {
    setRunning(null)
  }

  const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`.padStart(4)
  print(`on ${rows.length} rows set aside (${name}/valid.jsonl), fields: ${fields.join(', ')}`)
  print(`  ${''.padEnd(22)} JSON, every field   fields right   rows right   a row takes`)
  for (const s of result.scores) print(`  ${s.model.padEnd(22)} ${pct(s.complete, rows.length).padStart(18)}   ${pct(s.right, s.fields).padStart(12)}   ${pct(s.rows, rows.length).padStart(10)}   ${(s.ms / 1000).toFixed(1).padStart(9)}s`)
  // which fields each gets wrong most, so the next rows can aim at them
  for (const s of result.scores) {
    const misses = fields.map((k) => [k, result.rows.filter((r) => r.got[s.model]?.wrong.includes(k)).length] as const).filter(([, n]) => n).sort((a, b) => b[1] - a[1])
    if (misses.length) print(`  ${s.model} misses most: ${misses.slice(0, 4).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
  }
  const file = `check-${model.replace(/[^\w.-]/g, '_')}.json`
  await fs.writeFile(ws('data', name, file), JSON.stringify(result, null, 2) + '\n')
  print(`  ◂ workspace/data/${name}/${file}`)
  return true
}
