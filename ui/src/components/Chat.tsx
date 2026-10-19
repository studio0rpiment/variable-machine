import { useEffect, useRef, useState } from 'react'
import { chatOnce, type OllamaModel } from '../lib/ollama'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { ChatMark, Run, Stop } from '../icons'
import ModelSelect from './ModelSelect'
import { OLLAMA_LIBRARY } from '@shared/library'

interface Exchange {
  id: number
  prompt: string
  answer: string
  thinking: string
  state: 'streaming' | 'done' | 'stopped' | 'error'
  meta?: string
}

/** Untouched, open-license defaults that make a good first comparison (plan §8), in order of preference. qwen3:4b leads. */
const PREFERRED = ['qwen3:4b', 'smollm2:1.7b', 'smollm2:360m', 'qwen2.5:1.5b', 'olmo2:7b']

/** Models the library knows are not open-license (qwen2.5:3b, llama3.2:3b) are never picked by default; they can still be chosen by hand. */
const NOT_OPEN = new Set(OLLAMA_LIBRARY.filter((l) => !l.open).map((l) => l.tag))

function pickDefaults(models: OllamaModel[]): [string, string] {
  const names = models.map((m) => m.name).filter((n) => !NOT_OPEN.has(n.replace(/:latest$/, '')))
  const ranked = [...PREFERRED.filter((p) => names.includes(p)), ...names.filter((n) => !PREFERRED.includes(n))]
  return [ranked[0] ?? '', ranked[1] ?? ranked[0] ?? '']
}

interface Column {
  key: number
  model: string
  log: Exchange[]
}

const MAX_COLUMNS = 4
const LETTERS = 'abcd'
let nextId = 1

/**
 * Models side by side, one prompt (plan §3.2 Chat): two columns by default,
 * up to four (A, B and their merge need three). Each answer is a single-turn
 * `ollama run-once`, which is what the terminal echoes and what lands in
 * workspace/chat/<date>.jsonl; no hidden conversation history.
 */
interface Props {
  /** set from elsewhere ("chat with …"): a model per column, null keeps that column's model */
  request?: { models: (string | null)[]; n: number }
}

export default function Chat({ request }: Props) {
  const { models, error, reload } = useOllamaModels()
  const [columns, setColumns] = useState<Column[]>([
    { key: nextId++, model: '', log: [] },
    { key: nextId++, model: '', log: [] },
  ])
  const [prompt, setPrompt] = useState('')
  const aborts = useRef(new Map<number, AbortController>())
  const streaming = columns.some((c) => c.log.at(-1)?.state === 'streaming')

  useEffect(() => {
    if (!models.length) return
    const [a, b] = pickDefaults(models)
    setColumns((cs) => cs.map((c, i) => (c.model ? c : { ...c, model: i === 0 ? a : b })))
  }, [models])

  useEffect(() => {
    if (!request) return
    setColumns((cs) => {
      const out = [...cs]
      request.models.forEach((m, i) => {
        if (i >= out.length) out.push({ key: nextId++, model: '', log: [] })
        if (m) out[i] = { ...out[i], model: m }
      })
      return out
    })
  }, [request])

  const patchCol = (key: number, fn: (c: Column) => Column) => setColumns((cs) => cs.map((c) => (c.key === key ? fn(c) : c)))
  const patch = (key: number, id: number, fn: (x: Exchange) => Exchange) => patchCol(key, (c) => ({ ...c, log: c.log.map((x) => (x.id === id ? fn(x) : x)) }))

  const ask = (key: number, model: string, text: string) => {
    const id = nextId++
    const abort = new AbortController()
    aborts.current.set(key, abort)
    patchCol(key, (c) => ({ ...c, log: [...c.log, { id, prompt: text, answer: '', thinking: '', state: 'streaming' }] }))
    chatOnce(
      model,
      text,
      (d) => {
        patch(key, id, (x) => ({
          ...x,
          answer: x.answer + d.content,
          thinking: x.thinking + d.thinking,
          ...(d.error ? { state: 'error', meta: d.error } : {}),
          ...(d.done
            ? { state: 'done', meta: [d.evalCount && `${d.evalCount} tokens`, d.durationMs && `${(d.durationMs / 1000).toFixed(1)}s`].filter(Boolean).join(' · ') }
            : {}),
        }))
      },
      abort.signal,
    )
      .then(() => patch(key, id, (x) => (x.state === 'streaming' ? { ...x, state: 'done' } : x)))
      .catch((e: Error) => patch(key, id, (x) => ({ ...x, state: abort.signal.aborted ? 'stopped' : 'error', meta: abort.signal.aborted ? 'stopped' : e.message })))
  }

  const send = () => {
    const text = prompt.trim()
    if (!text || streaming) return
    for (const c of columns) if (c.model) ask(c.key, c.model, text)
    setPrompt('')
  }

  const stop = () => aborts.current.forEach((a) => a.abort())
  const n = columns.length

  return (
    <section className="chat" aria-label="chat">
      <header className="panel-head">
        <ChatMark size={1} />
        <span className="label">chat</span>
        {error && <span className="label label--muted">· {error}</span>}
        {n < MAX_COLUMNS && (
          <button type="button" className="text-button" onClick={() => setColumns((cs) => [...cs, { key: nextId++, model: cs.at(-1)?.model ?? '', log: [] }])}>
            + column
          </button>
        )}
      </header>
      <div className="chat__columns" style={{ ['--cols' as string]: n }}>
        {columns.map((c, i) => (
          <div className="chat__column" key={c.key}>
            <div className="chat__column-head">
              <ModelSelect label={LETTERS[i]} models={models} value={c.model} onChange={(v) => patchCol(c.key, (x) => ({ ...x, model: v }))} onOpen={reload} />
              {n > 2 && (
                <button type="button" className="text-button" onClick={() => setColumns((cs) => cs.filter((x) => x.key !== c.key))} aria-label={`remove column ${LETTERS[i]}`}>
                  remove
                </button>
              )}
            </div>
            {/* column-reverse keeps the newest answer in view while it streams, without scroll code */}
            <div className="chat__scroll">
              <ol className="chat__log">
                {c.log.map((x) => (
                  <li key={x.id} className={`exchange is-${x.state}`}>
                    <p className="exchange__prompt">{x.prompt}</p>
                    {x.thinking && (
                      <details className="exchange__thinking" open={x.state === 'streaming' && !x.answer}>
                        <summary className="label">thinking</summary>
                        <p>{x.thinking}</p>
                      </details>
                    )}
                    <p className="exchange__answer">{x.answer}</p>
                    {x.meta && <span className="label label--muted">{x.meta}</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </div>
      <div className="chat__prompt">
        <textarea
          value={prompt}
          rows={2}
          placeholder={`one prompt, ${n === 2 ? 'both' : `all ${n}`} models · enter sends, shift-enter for a new line`}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          aria-label="prompt"
        />
        {streaming ? (
          <button type="button" className="icon-button" onClick={stop} title="stop all" aria-label="stop">
            <Stop />
          </button>
        ) : (
          <button type="button" className="icon-button" onClick={send} disabled={!prompt.trim()} title="send to every column" aria-label="send">
            <Run />
          </button>
        )}
      </div>
    </section>
  )
}
