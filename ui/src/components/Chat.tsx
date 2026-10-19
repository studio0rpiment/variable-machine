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

const SIDES = ['a', 'b'] as const
type Side = (typeof SIDES)[number]

/** Untouched, open-license defaults that make a good first comparison (plan §8), in order of preference. qwen3:4b leads. */
const PREFERRED = ['qwen3:4b', 'smollm2:1.7b', 'smollm2:360m', 'qwen2.5:1.5b', 'olmo2:7b']

/** Models the library knows are not open-license (qwen2.5:3b, llama3.2:3b) are never picked by default; they can still be chosen by hand. */
const NOT_OPEN = new Set(OLLAMA_LIBRARY.filter((l) => !l.open).map((l) => l.tag))

function pickDefaults(models: OllamaModel[]): Record<Side, string> {
  const names = models.map((m) => m.name).filter((n) => !NOT_OPEN.has(n.replace(/:latest$/, '')))
  const ranked = [...PREFERRED.filter((p) => names.includes(p)), ...names.filter((n) => !PREFERRED.includes(n))]
  return { a: ranked[0] ?? '', b: ranked[1] ?? ranked[0] ?? '' }
}

let nextId = 1

/**
 * Two models side by side, one prompt (plan §3.2 Chat). Each answer is a
 * single-turn `ollama run-once`, which is what the terminal echoes and what
 * lands in workspace/chat/<date>.jsonl — no hidden conversation history.
 */
interface Props {
  /** set from elsewhere ("chat with …") to put a model in column b */
  request?: { model: string; a?: string; n: number }
}

export default function Chat({ request }: Props) {
  const { models, error, reload } = useOllamaModels()
  const [chosen, setChosen] = useState<Record<Side, string>>({ a: '', b: '' })
  const [log, setLog] = useState<Record<Side, Exchange[]>>({ a: [], b: [] })
  const [prompt, setPrompt] = useState('')
  const aborts = useRef<Partial<Record<Side, AbortController>>>({})
  const streaming = SIDES.some((s) => log[s].at(-1)?.state === 'streaming')

  useEffect(() => {
    if (models.length) setChosen((c) => (c.a && c.b ? c : pickDefaults(models)))
  }, [models])

  useEffect(() => {
    if (request) setChosen((c) => ({ a: request.a ?? c.a, b: request.model }))
  }, [request])

  const patch = (side: Side, id: number, fn: (x: Exchange) => Exchange) =>
    setLog((l) => ({ ...l, [side]: l[side].map((x) => (x.id === id ? fn(x) : x)) }))

  const ask = (side: Side, model: string, text: string) => {
    const id = nextId++
    const abort = new AbortController()
    aborts.current[side] = abort
    setLog((l) => ({ ...l, [side]: [...l[side], { id, prompt: text, answer: '', thinking: '', state: 'streaming' }] }))
    chatOnce(
      model,
      text,
      (d) => {
        patch(side, id, (x) => ({
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
      .then(() => patch(side, id, (x) => (x.state === 'streaming' ? { ...x, state: 'done' } : x)))
      .catch((e: Error) => patch(side, id, (x) => ({ ...x, state: abort.signal.aborted ? 'stopped' : 'error', meta: abort.signal.aborted ? 'stopped' : e.message })))
  }

  const send = () => {
    const text = prompt.trim()
    if (!text || streaming) return
    for (const side of SIDES) if (chosen[side]) ask(side, chosen[side], text)
    setPrompt('')
  }

  const stop = () => SIDES.forEach((s) => aborts.current[s]?.abort())

  return (
    <section className="chat" aria-label="chat">
      <header className="panel-head">
        <ChatMark size={1} />
        <span className="label">chat</span>
        {error && <span className="label label--muted">· {error}</span>}
      </header>
      <div className="chat__columns">
        {SIDES.map((side) => (
          <div className="chat__column" key={side}>
            <ModelSelect label={side} models={models} value={chosen[side]} onChange={(v) => setChosen((c) => ({ ...c, [side]: v }))} onOpen={reload} />
            {/* column-reverse keeps the newest answer in view while it streams, without scroll code */}
            <div className="chat__scroll">
            <ol className="chat__log">
              {log[side].map((x) => (
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
          placeholder="one prompt, both models · enter sends, shift-enter for a new line"
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
          <button type="button" className="icon-button" onClick={stop} title="stop both" aria-label="stop">
            <Stop />
          </button>
        ) : (
          <button type="button" className="icon-button" onClick={send} disabled={!prompt.trim()} title="send to both" aria-label="send">
            <Run />
          </button>
        )}
      </div>
    </section>
  )
}
