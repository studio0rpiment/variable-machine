import { useEffect, useRef, useState } from 'react'
import { chatOnce, seesPictures, type OllamaModel } from '../lib/ollama'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { ChatMark, Run, Stop } from '../icons'
import ModelSelect from './ModelSelect'
import PicturePicker from './PicturePicker'
import { OLLAMA_LIBRARY } from '@shared/library'
import { Explained } from '../explain/Explained'
import AskedAnswer from './AskedAnswer'
import { askableTables, datasetForModel, loadTable, runWritten, systemFor, tableForModel, type Asked } from '../lib/askTable'
import type { Prepared } from '@shared/tableQuery'

interface Exchange {
  id: number
  prompt: string
  /** the picture sent with it, a workspace path */
  image?: string
  /** a picture was attached, but this model doesn't see, so it got the words only */
  wordsOnly?: boolean
  answer: string
  thinking: string
  state: 'streaming' | 'done' | 'stopped' | 'error'
  meta?: string
  /** asked of a table: what the model wrote, run against it */
  asked?: Asked
  /** the table it was asked of */
  table?: string
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
  const [picture, setPicture] = useState('')
  /** ask the table: each model writes a query, the table answers it */
  const [askMode, setAskMode] = useState(false)
  const [tables, setTables] = useState<string[]>([])
  const [table, setTable] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
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

  // Asking a table: list the tables that can be asked, and pick the one the first model was trained on.
  useEffect(() => {
    if (!askMode) return
    void askableTables().then(async (ts) => {
      setTables(ts)
      const trained = (await Promise.all(columns.map((c) => (c.model ? tableForModel(c.model) : null)))).find(Boolean)
      setTable((t) => (trained && ts.includes(trained.table) ? trained.table : t && ts.includes(t) ? t : (ts[0] ?? '')))
    })
    // only when switched on; a model chosen later picks its table below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askMode])
  useEffect(() => {
    setPrepared(null)
    if (askMode && table) void loadTable(table).then(setPrepared)
  }, [askMode, table])
  const chooseModel = (key: number, model: string) => {
    patchCol(key, (x) => ({ ...x, model }))
    if (askMode) void tableForModel(model).then((t) => t && tables.includes(t.table) && setTable(t.table))
  }

  // models trained on a table's rows as plain text: what they write is made up, and the column says so
  const [invents, setInvents] = useState<Set<string>>(new Set())
  const colModels = columns.map((c) => c.model).join('\n')
  useEffect(() => {
    void Promise.all(colModels.split('\n').filter(Boolean).map(async (m) => ((await datasetForModel(m))?.format === 'text' ? m : null))).then((ms) => setInvents(new Set(ms.filter((m): m is string => !!m))))
  }, [colModels])

  const patchCol = (key: number, fn: (c: Column) => Column) => setColumns((cs) => cs.map((c) => (c.key === key ? fn(c) : c)))
  const patch = (key: number, id: number, fn: (x: Exchange) => Exchange) => patchCol(key, (c) => ({ ...c, log: c.log.map((x) => (x.id === id ? fn(x) : x)) }))

  const ask = async (key: number, model: string, text: string, image: string) => {
    const id = nextId++
    const abort = new AbortController()
    aborts.current.set(key, abort)
    // Only a model that sees gets the picture; the others would refuse the whole question.
    const sees = image ? await seesPictures(model) : false
    const p = askMode ? prepared : null
    patchCol(key, (c) => ({ ...c, log: [...c.log, { id, prompt: text, ...(image && { image, wordsOnly: !sees }), ...(p && { table }), answer: '', thinking: '', state: 'streaming' }] }))
    let wrote = ''
    chatOnce(
      model,
      text,
      (d) => {
        wrote += d.content
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
      // a query: the same every time, and JSON only, as the model was trained and checked
      p ? { temperature: 0, num_predict: 200 } : undefined,
      sees ? image : undefined,
      p ? { system: systemFor(p), format: 'json' } : undefined,
    )
      .then(() => patch(key, id, (x) => (x.state === 'streaming' || x.state === 'done' ? { ...x, state: 'done', ...(p && { asked: runWritten(p, wrote) }) } : x)))
      .catch((e: Error) => patch(key, id, (x) => ({ ...x, state: abort.signal.aborted ? 'stopped' : 'error', meta: abort.signal.aborted ? 'stopped' : e.message })))
  }

  const send = () => {
    const text = prompt.trim()
    if (!text || streaming || (askMode && !prepared)) return
    for (const c of columns) if (c.model) void ask(c.key, c.model, text, picture)
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
        <Explained id="chat.askTable">
          <button type="button" role="switch" aria-checked={askMode} className={`text-button ${askMode ? 'is-active' : ''}`.trim()} onClick={() => setAskMode((v) => !v)}>
            ask the table {askMode ? 'on' : 'off'}
          </button>
        </Explained>
        {askMode && (
          <Explained id="chat.table">
            <label className="model-select">
              <span className="label label--muted">table</span>
              <select value={table} onChange={(e) => setTable(e.target.value)}>
                {!tables.length && <option value="">no tables read yet (Data tab)</option>}
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </Explained>
        )}
        {askMode && table && !prepared && <span className="label label--muted">reading the table…</span>}
        {n < MAX_COLUMNS && (
          <Explained id="chat.addColumn">
            <button type="button" className="text-button" onClick={() => setColumns((cs) => [...cs, { key: nextId++, model: cs.at(-1)?.model ?? '', log: [] }])}>
              + column
            </button>
          </Explained>
        )}
      </header>
      <div className="chat__columns" style={{ ['--cols' as string]: n }}>
        {columns.map((c, i) => (
          <div className="chat__column" key={c.key}>
            <div className="chat__column-head">
              <Explained id="chat.model">
                <ModelSelect label={LETTERS[i]} models={models} value={c.model} onChange={(v) => chooseModel(c.key, v)} onOpen={reload} />
              </Explained>
              {n > 2 && (
                <button type="button" className="text-button" onClick={() => setColumns((cs) => cs.filter((x) => x.key !== c.key))} aria-label={`remove column ${LETTERS[i]}`}>
                  remove
                </button>
              )}
            </div>
            {invents.has(c.model) && <p className="label chat__invents">trained on a table's rows as they are: it writes invented records that look real, never real ones. Start a row and it carries on.</p>}
            {/* column-reverse keeps the newest answer in view while it streams, without scroll code */}
            <div className="chat__scroll">
              <ol className="chat__log">
                {c.log.map((x) => (
                  <li key={x.id} className={`exchange is-${x.state}`}>
                    {x.image && (
                      <figure className="exchange__picture">
                        <img src={`/api/workspace/file?path=${encodeURIComponent(x.image)}`} alt={x.image} />
                        {x.wordsOnly && <figcaption className="label label--muted">doesn't see pictures: it got the words only</figcaption>}
                      </figure>
                    )}
                    <p className="exchange__prompt">{x.prompt}</p>
                    {x.thinking && (
                      <details className="exchange__thinking" open={x.state === 'streaming' && !x.answer}>
                        <summary className="label">thinking</summary>
                        <p>{x.thinking}</p>
                      </details>
                    )}
                    {x.asked ? <AskedAnswer asked={x.asked} roles={x.table === table ? prepared?.roles : undefined} /> : <p className="exchange__answer">{x.answer}</p>}
                    {x.meta && <span className="label label--muted">{x.meta}</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </div>
      <PicturePicker value={picture} onChange={setPicture} />
      <div className="chat__prompt">
        <textarea
          value={prompt}
          rows={2}
          placeholder={askMode ? `a question about ${table || 'the table'}: each model writes a query, the table answers it · enter sends` : `one prompt${picture ? ' and the picture' : ''}, ${n === 2 ? 'both' : `all ${n}`} models · enter sends, shift-enter for a new line`}
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
          <Explained id="chat.send">
            {/* aria-disabled, not disabled, so the explanation flag still opens on hover (see CommandPreview) */}
            <button type="button" className="icon-button" onClick={send} aria-disabled={!prompt.trim() || undefined} aria-label="send">
              <Run />
            </button>
          </Explained>
        )}
      </div>
    </section>
  )
}
