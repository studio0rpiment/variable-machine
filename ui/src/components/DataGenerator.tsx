import { useEffect, useMemo, useRef, useState } from 'react'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { runCommand } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { simpleRow, type ChatRow } from '@shared/chatRow'
import ModelSelect from './ModelSelect'
import CommandPreview from './CommandPreview'
import { Keep, Reject } from '../icons'
import { Explained } from '../explain/Explained'

interface Props {
  dataset: string
  /** rows already in the set; a few are shown to the model as examples */
  examples: ChatRow[]
}

interface Candidate {
  id: number
  user: string
  assistant: string
  state: 'open' | 'keeping' | 'kept' | 'rejected'
}

const DEFAULT_TASK = 'Write new examples in the same style as the ones above, on different topics.'
const MATERIAL_TASK = 'Write questions a curious reader might ask about the material, each with a clear answer drawn from it.'

function systemPrompt(n: number, examples: ChatRow[], material?: string) {
  const excerpt = (t: string) => (t.length > 300 ? t.slice(0, 300) + '…' : t).replace(/\s+/g, ' ')
  const shown = examples
    .map((r) => `User: ${excerpt(r.messages.find((m) => m.role === 'user')?.content ?? '')}\nAssistant: ${excerpt(r.messages.at(-1)?.content ?? '')}`)
    .join('\n\n')
  return [
    'You write training examples for a small chat model.',
    `Write ${n} new examples as JSON: {"rows":[{"user":"…","assistant":"…"}]}.`,
    'Each user turn is a question or request a person might write; each assistant turn is a good, complete reply to it.',
    'Do not copy the examples, and do not leave placeholders.',
    ...(shown ? ['', 'The dataset already has rows like these (excerpts):', '', shown] : []),
    ...(material ? ['', 'Write the examples from this material. Answers must be true to it:', '', material] : []),
  ].join('\n')
}

/**
 * Ollama structured outputs: the answer must be {"rows":[…]} with exactly n
 * rows. This also keeps a thinking model (qwen3) from writing its reasoning
 * into the answer, which `think: false` alone does not prevent.
 */
function rowsSchema(n: number) {
  const row = { type: 'object', properties: { user: { type: 'string' }, assistant: { type: 'string' } }, required: ['user', 'assistant'] }
  return { type: 'object', properties: { rows: { type: 'array', minItems: n, maxItems: n, items: row } }, required: ['rows'] }
}

/**
 * Pull each complete {…} row out of a JSON document as it streams in, so
 * candidates appear one by one instead of all at the end. Tracks strings and
 * nesting; a row is any object two levels in ({"rows":[ HERE ]}).
 */
function rowExtractor(onRow: (json: string) => void) {
  let text = ''
  let i = 0
  let depth = 0
  let inString = false
  let escaped = false
  let start = -1
  return (chunk: string) => {
    text += chunk
    for (; i < text.length; i++) {
      const c = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') inString = false
        continue
      }
      if (c === '"') inString = true
      else if (c === '{' || c === '[') {
        if (c === '{' && depth === 2) start = i
        depth++
      } else if (c === '}' || c === ']') {
        depth--
        if (c === '}' && depth === 2 && start >= 0) {
          onRow(text.slice(start, i + 1))
          start = -1
        }
      }
    }
  }
}

/** Pick a few rows to show the model, the same ones until the set changes. */
function sample<T>(xs: T[], n: number) {
  const step = Math.max(1, Math.floor(xs.length / n))
  return xs.filter((_, i) => i % step === 0).slice(0, n)
}

let nextId = 1

/**
 * Generate and curate (plan §3.2 Data): a model writes candidate rows, one
 * JSON object per line, streamed in as they complete. Each one can be
 * edited, then kept (a `data append` command) or rejected (nothing written).
 */
export default function DataGenerator({ dataset, examples }: Props) {
  const { models, reload } = useOllamaModels()
  const [model, setModel] = useState('qwen3:4b')
  const [count, setCount] = useState(10)
  const [task, setTask] = useState(DEFAULT_TASK)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState('')
  const abort = useRef<AbortController | null>(null)

  // Raw material (workspace/raw): an optional passage the rows are written from.
  const [raws, setRaws] = useState<{ folder: string; license: string; chunks: number }[]>([])
  const [raw, setRaw] = useState('')
  const [passages, setPassages] = useState<string[]>([])
  const [passage, setPassage] = useState(0)
  useEffect(() => void readManifests<{ license: string; chunks: number }>('raw').then(setRaws), [])
  useEffect(() => {
    if (!raw) return setPassages([])
    void readFile(`raw/${raw}/chunks.jsonl`).then((t) => {
      const ps = (t ?? '').split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { text: string }).text)
      setPassages(ps)
      setPassage(Math.min(ps.length - 1, 1))
    })
    setTask((cur) => (cur === DEFAULT_TASK ? MATERIAL_TASK : cur))
  }, [raw])
  const material = raw ? passages[passage] : undefined

  const seeds = useMemo(() => sample(examples, 3), [examples])
  const system = systemPrompt(count, raw ? seeds.slice(0, 1) : seeds, material)
  const schema = rowsSchema(count)
  const short = (s: string) => (s.length > 48 ? s.slice(0, 45) + '…' : s)
  const preview = joinWords(['ollama', 'run-once', model, '--system', short(system), '--no-think', '--format', short(JSON.stringify(schema)), short(task)])
  const seedUsers = useMemo(() => new Set(seeds.map((r) => r.messages.find((m) => m.role === 'user')?.content.trim())), [seeds])

  /** One row from the model → a candidate, unless it is empty, a placeholder, or a copy of an example. */
  const add = (json: string): boolean => {
    try {
      const o = JSON.parse(json) as { user?: unknown; assistant?: unknown }
      if (typeof o.user !== 'string' || typeof o.assistant !== 'string') return false
      const user = o.user.trim()
      const assistant = o.assistant.trim()
      if (user.replace(/[.…\s]/g, '').length < 3 || assistant.replace(/[.…\s]/g, '').length < 2 || seedUsers.has(user)) return false
      setCandidates((c) => [...c, { id: nextId++, user, assistant, state: 'open' }])
      return true
    } catch {
      return false
    }
  }

  const generate = async () => {
    setRunning(true)
    setNote('')
    const ctrl = new AbortController()
    abort.current = ctrl
    let got = 0 // usable rows this run
    const feed = rowExtractor((json) => {
      if (add(json)) got++
    })
    try {
      const res = await fetch('/ollama/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-variable-machine-source': 'data' },
        body: JSON.stringify({ model, think: false, format: schema, stream: true, messages: [{ role: 'system', content: system }, { role: 'user', content: task }] }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(`ollama: ${res.status}`)
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let ndjson = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        ndjson += value
        let nl: number
        while ((nl = ndjson.indexOf('\n')) >= 0) {
          const chunk = JSON.parse(ndjson.slice(0, nl)) as { message?: { content?: string }; error?: string }
          ndjson = ndjson.slice(nl + 1)
          if (chunk.error) throw new Error(chunk.error)
          feed(chunk.message?.content ?? '')
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setNote((e as Error).message)
    } finally {
      setRunning(false)
      if (!got && !ctrl.signal.aborted) setNote((n) => n || 'the model wrote no usable rows; try again or change the task')
    }
  }

  const patch = (id: number, p: Partial<Candidate>) => setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))

  const keep = async (c: Candidate) => {
    patch(c.id, { state: 'keeping' })
    const row = simpleRow(c.user.trim(), c.assistant.trim())
    const ok = await runCommand(joinWords(['data', 'append', dataset, JSON.stringify(row), '--source', model, ...(raw ? ['--from', `raw/${raw}`] : [])]))
    patch(c.id, { state: ok ? 'kept' : 'open' })
  }

  const open = candidates.filter((c) => c.state !== 'rejected')
  const kept = candidates.filter((c) => c.state === 'kept').length

  return (
    <div className="generator">
      <div className="generator__head">
        <ModelSelect label="writer" models={models} value={model} onChange={setModel} onOpen={reload} />
        <label className="field field--narrow">
          <span className="label label--muted">rows</span>
          <input type="text" inputMode="numeric" value={count} onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
        </label>
      </div>
      {raws.length > 0 && (
        <div className="material">
          <label className="field">
            <span className="label label--muted">write from raw material (optional)</span>
            <select value={raw} onChange={(e) => setRaw(e.target.value)}>
              <option value="">no material: style only</option>
              {raws.map((r) => (
                <option key={r.folder} value={r.folder}>
                  {r.folder} · {r.chunks} passages
                </option>
              ))}
            </select>
          </label>
          {raw && passages.length > 0 && (
            <>
              <div className="material__nav">
                <span className="label label--muted">
                  passage {passage + 1} of {passages.length} · {raws.find((r) => r.folder === raw)?.license}
                </span>
                <button type="button" className="text-button" disabled={passage === 0} onClick={() => setPassage(passage - 1)}>
                  prev
                </button>
                <button type="button" className="text-button" disabled={passage >= passages.length - 1} onClick={() => setPassage(passage + 1)}>
                  next
                </button>
                <button type="button" className="text-button" onClick={() => setPassage(Math.floor(Math.random() * passages.length))}>
                  any
                </button>
              </div>
              <p className="material__text">{material}</p>
            </>
          )}
        </div>
      )}
      <label className="field">
        <span className="label label--muted">task</span>
        <textarea rows={2} value={task} onChange={(e) => setTask(e.target.value)} />
      </label>
      <details className="generator__prompt">
        <summary className="label label--muted">the full instructions sent with it ({seeds.length} example rows from {dataset})</summary>
        <pre>{system}</pre>
      </details>
      <div className="generator__run">
        <Explained id="data.generate">
          <CommandPreview command={preview} onRun={() => void generate()} running={running} label="generate" />
        </Explained>
        {running && (
          <button type="button" className="text-button" onClick={() => abort.current?.abort()}>
            stop
          </button>
        )}
        {candidates.length > 0 && (
          <span className="label label--muted">
            {kept} kept · {candidates.filter((c) => c.state === 'rejected').length} rejected · {candidates.filter((c) => c.state === 'open').length} to decide
          </span>
        )}
        {note && <span className="label label--muted">{note}</span>}
      </div>
      <ol className="candidates">
        {open.map((c) => (
          <li key={c.id} className={`candidate is-${c.state}`}>
            <label className="field">
              <span className="label label--muted">user</span>
              <textarea rows={2} value={c.user} disabled={c.state !== 'open'} onChange={(e) => patch(c.id, { user: e.target.value })} />
            </label>
            <label className="field">
              <span className="label label--muted">assistant</span>
              <textarea rows={3} value={c.assistant} disabled={c.state !== 'open'} onChange={(e) => patch(c.id, { assistant: e.target.value })} />
            </label>
            <div className="candidate__actions">
              {c.state === 'kept' ? (
                <span className="label">kept · in {dataset}/train.jsonl</span>
              ) : (
                <>
                  <Explained id="data.keep">
                    <button type="button" className="icon-text" onClick={() => void keep(c)} disabled={c.state !== 'open'}>
                      <Keep size={1} /> keep
                    </button>
                  </Explained>
                  <Explained id="data.reject">
                    <button type="button" className="icon-text" onClick={() => patch(c.id, { state: 'rejected' })} disabled={c.state !== 'open'}>
                      <Reject size={1} /> reject
                    </button>
                  </Explained>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
