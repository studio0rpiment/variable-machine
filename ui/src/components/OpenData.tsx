import { useCallback, useEffect, useRef, useState } from 'react'
import { joinWords } from '@shared/quote'
import { useHelperEvent } from '../hooks/useHelper'
import { readManifests } from '../lib/workspace'
import Manifest from './Manifest'
import CommandPreview from './CommandPreview'
import { Explained } from '../explain/Explained'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const asName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|-+$/g, '')
    .slice(0, 48)

interface Result {
  id: string
  title: string
  about: string
  publisher: string
  license: string | null
  page: string
  csv: string | null
  via: 'csv' | 'arcgis'
}

const SOURCES = { dc: 'DC Open Data', datagov: 'data.gov' } as const
type Source = keyof typeof SOURCES

/**
 * Search an open-data portal for a table and bring it in as raw material, with
 * the license the portal states (or one the student fills in after reading the
 * dataset's page). Searching only reads; bringing it in is `data raw csv`, or
 * `data raw arcgis` for a DC table, read straight from its map service.
 */
export function OpenDataCard({ busy, onRun }: { busy: boolean; onRun: (line: string, raw: string) => void }) {
  const [source, setSource] = useState<Source>('dc')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [note, setNote] = useState('')
  const [pick, setPick] = useState<Result | null>(null)
  const [name, setName] = useState('')
  const [license, setLicense] = useState('')

  const search = async () => {
    if (!q.trim()) return
    setNote(`searching ${SOURCES[source]}…`)
    setPick(null)
    const res = await fetch(`/api/opendata/search?source=${source}&q=${encodeURIComponent(q.trim())}`)
    const body = (await res.json().catch(() => ({}))) as { results?: Result[]; error?: string }
    if (!res.ok || !body.results) return setNote(body.error ?? `couldn't reach ${SOURCES[source]}`), setResults([])
    setResults(body.results)
    setNote(body.results.length ? '' : 'nothing found: try other words')
  }
  const choose = (r: Result) => {
    setPick(r)
    setName(asName(r.title))
    setLicense(r.license ?? '')
  }

  const line = pick?.csv
    ? joinWords(['data', 'raw', pick.via ?? 'csv', pick.csv, name, '--license', license.trim() || '<license>', '--about', pick.title + (pick.about ? `: ${pick.about.slice(0, 160)}` : ''), '--page', pick.page])
    : ''
  return (
    <Manifest name="search public data" lines={['tables of public facts, from city, state and federal portals', 'searching reads the catalog only; nothing downloads until you bring one in']}>
      <div className="inline-fields">
        <div className="choice" role="radiogroup" aria-label="portal">
          {(Object.keys(SOURCES) as Source[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={s === source} className={`text-button ${s === source ? 'is-active' : ''}`.trim()} onClick={() => (setSource(s), setResults(null), setPick(null))}>
              {SOURCES[s]}
            </button>
          ))}
        </div>
      </div>
      <form
        className="inline-fields"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <label className="field">
          <span className="label label--muted">what are you looking for</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. traffic, trees, libraries, school enrollment" />
        </label>
        <Explained id="data.opendata">
          <button type="submit" className="text-button" aria-disabled={!q.trim() || undefined}>
            search
          </button>
        </Explained>
      </form>
      {note && <span className="label label--muted">{note}</span>}

      {results && results.length > 0 && (
        <ul className="od-results">
          {results.map((r) => (
            <li key={r.id} className={`od-result ${pick?.id === r.id ? 'is-active' : ''}`.trim()}>
              <a href={r.page} target="_blank" rel="noopener noreferrer" className="text-link od-result__title">
                {r.title}
              </a>
              <span className="label label--muted">
                {r.publisher} · {r.license ?? 'license not stated: check its page'}
              </span>
              {r.about && <p className="od-result__about">{r.about}</p>}
              {r.csv ? (
                <button type="button" className="text-button od-result__pick" onClick={() => choose(r)}>
                  {pick?.id === r.id ? 'chosen' : 'choose this table'}
                </button>
              ) : (
                <span className="label label--muted">no table to download here (a map, a document or an app)</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {pick?.csv && (
        <div className="od-bring">
          <div className="inline-fields">
            <label className="field">
              <span className="label label--muted">as</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} />
            </label>
            <label className="field">
              <span className="label label--muted">license {pick.license ? '(as the portal states it)' : '(read it on the dataset page first)'}</span>
              <input type="text" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="e.g. CC BY 4.0, U.S. public domain" />
            </label>
          </div>
          <CommandPreview command={line} onRun={() => onRun(line, name)} disabled={!NAME.test(name) || !license.trim()} running={busy} label="bring it in" />
        </div>
      )}
    </Manifest>
  )
}

interface Raw {
  name: string
  license: string
  about?: string
  page?: string
  columns?: string[]
  sample?: Record<string, string>[]
  rows?: number
}

const BLANK = /\{([^{}|]+)(\|round)?\}/g
const round = (v: string) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Math.round(Number(v)).toLocaleString('en-US') : v)
const fill = (t: string, r: Record<string, string>) => t.replace(BLANK, (_, c: string, how?: string) => (r[c] === undefined ? `{${c}}` : how ? round(r[c].trim()) : r[c].trim()))

/**
 * The formatting step for a table: a question and an answer with {column}
 * blanks, filled from each row. The preview fills them from the table's first
 * rows as you type, so you see the questions before any are made.
 */
export function TemplateCard({ busy, onRun, prefer }: { busy: boolean; onRun: (line: string, name: string) => void; prefer?: string }) {
  const [tables, setTables] = useState<Raw[]>([])
  const [table, setTable] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [skipZero, setSkipZero] = useState(true)
  const [name, setName] = useState('')
  const [limit, setLimit] = useState(300)
  const focus = useRef<'question' | 'answer'>('question')
  const fields = { question: useRef<HTMLTextAreaElement>(null), answer: useRef<HTMLTextAreaElement>(null) }

  const load = useCallback(() => void readManifests<Raw>('raw').then((r) => setTables(r.filter((x) => x.columns?.length))), [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('raw/') && e.path.endsWith('manifest.json') && load(), [load]),
  )
  // A table just brought in is the one to work on, and this is the next step: bring it into view.
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (prefer && tables.some((t) => t.name === prefer)) {
      setTable(prefer)
      requestAnimationFrame(() => {
        card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } else if (!table && tables[0]) setTable(tables[0].name)
  }, [prefer, tables, table])
  useEffect(() => setName((n) => n || (table ? `${table}-qa` : '')), [table])

  const t = tables.find((x) => x.name === table)
  /** Put {column} where the cursor is, in the field last used. */
  const insert = (col: string) => {
    const k = focus.current
    const el = fields[k].current
    const v = k === 'question' ? question : answer
    const at = el?.selectionStart ?? v.length
    const next = `${v.slice(0, at)}{${col}}${v.slice(el?.selectionEnd ?? at)}`
    ;(k === 'question' ? setQuestion : setAnswer)(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + col.length + 2, at + col.length + 2)
    })
  }
  const used = [...`${question} ${answer}`.matchAll(BLANK)].map((m) => m[1])
  const unknown = t ? used.filter((c) => !t.columns!.includes(c)) : []
  const line = joinWords(['data', 'template', `raw/${table}`, name, '--question', question.trim() || '<question>', '--answer', answer.trim() || '<answer>', ...(skipZero ? ['--skip', '0'] : []), '--limit', String(limit)])

  if (!tables.length) return <p className="mf-next">No tables yet: bring one in with the search above, or a CSV address under "bring in a book or a table".</p>
  return (
    <div ref={card}>
      {prefer && table === prefer && <p className="mf-next od-arrived">{prefer} is here. Next: write a question and its answer, with {'{column}'} where each row fills in.</p>}
    <Manifest name="table to questions and answers" lines={['write one question and its answer, with {column} where a row fills in', 'add |round to a number column for a whole number: {COUNT|round}']}>
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">table</span>
          <select value={table} onChange={(e) => (setTable(e.target.value), setName(`${e.target.value}-qa`))}>
            {tables.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name} · {x.rows?.toLocaleString('en-US')} rows
              </option>
            ))}
          </select>
        </label>
      </div>
      {t && (
        <>
          {t.about && <p className="od-result__about">{t.about}</p>}
          <span className="label label--muted">
            {t.license}
            {t.page && (
              <>
                {' · '}
                <a href={t.page} target="_blank" rel="noopener noreferrer" className="text-link">
                  its page
                </a>
              </>
            )}
          </span>
          <div className="od-columns" aria-label="columns: click to put one in">
            <span className="label label--muted">columns, click to put one in:</span>
            {t.columns!.map((c) => (
              <button key={c} type="button" className="text-button od-col" onClick={() => insert(c)} title={t.sample?.[0]?.[c] ? `e.g. ${t.sample[0][c]}` : undefined}>
                {c}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="label label--muted">question</span>
            <textarea ref={fields.question} rows={2} value={question} onFocus={() => (focus.current = 'question')} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How many vehicles a day use {REGISTEREDNAME} {STREETTYPE} {QUADRANT}?" />
          </label>
          <label className="field">
            <span className="label label--muted">answer</span>
            <textarea ref={fields.answer} rows={2} value={answer} onFocus={() => (focus.current = 'answer')} onChange={(e) => setAnswer(e.target.value)} placeholder="e.g. About {AADT2011|round} vehicles a day." />
          </label>
          {unknown.length > 0 && <span className="label label--muted">no column called {unknown.map((u) => `{${u}}`).join(', ')}</span>}
          {(question || answer) && t.sample && (
            <div className="od-preview">
              <span className="label label--muted">from the first rows of the table</span>
              {t.sample.map((r, i) => {
                // the same rule the command uses: a blank that is empty (or 0, when left out) drops the row
                const gap = used.find((c) => r[c] !== undefined && (!r[c].trim() || (skipZero && r[c].trim() === '0')))
                return gap ? (
                  <p key={i} className="od-preview__row od-preview__row--out">
                    left out: {gap} is {r[gap].trim() ? '0' : 'empty'} in this row
                  </p>
                ) : (
                  <p key={i} className="od-preview__row">
                    “{fill(question, r)}” → “{fill(answer, r)}”
                  </p>
                )
              })}
            </div>
          )}
          <label className="mf-check">
            <input type="checkbox" checked={skipZero} onChange={(e) => setSkipZero(e.target.checked)} />
            <span className="mf-check__body">
              <span className="mf-field__title">leave out rows where a blank is 0</span>
              <span className="mf-field__help">Tables often write 0 for "not counted". A model trained on those would learn that a busy avenue has no traffic.</span>
            </span>
          </label>
          <div className="inline-fields">
            <label className="field">
              <span className="label label--muted">as dataset</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} />
            </label>
            <label className="field field--narrow">
              <span className="label label--muted">rows</span>
              <input type="text" inputMode="numeric" value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(5000, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
            </label>
          </div>
          <Explained id="data.template">
            <CommandPreview command={line} onRun={() => onRun(line, name)} disabled={!NAME.test(name) || name === 'new' || !used.length || unknown.length > 0 || !question.trim() || !answer.trim()} running={busy} label="make questions and answers" />
          </Explained>
        </>
      )}
    </Manifest>
    </div>
  )
}
