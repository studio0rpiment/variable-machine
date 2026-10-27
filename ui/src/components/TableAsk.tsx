import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { joinWords } from '@shared/quote'
import type { Role, Roles } from '@shared/tableQuery'
import type { ColumnProfile, TableProfile } from '@shared/tableProfile'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import CommandPreview from './CommandPreview'
import { Explained } from '../explain/Explained'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ROLES: Role[] = ['what', 'where', 'when', 'how much', 'how', 'id', 'other']
/** What each role means, under the dropdown and in its title. */
export const ROLE_MEANS: Record<Role, string> = {
  what: 'what each row is: the kind of thing counted (an offense, a species)',
  where: 'a place: a block, an address, a ward or neighbourhood, a latitude or longitude',
  when: 'a date or time, or a part of the day (a shift)',
  'how much': 'a number to add up or average',
  how: 'a detail with a few kinds of value (a method, a condition)',
  id: 'a different value in every row: left out of questions',
  other: 'left out of questions',
}

const pct = (x: number) => (x === 0 ? '0%' : x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`)

interface Raw {
  name: string
  columns?: string[]
  rows?: number
  license: string
  about?: string
}

/** Tables in workspace/raw (those with columns), kept up to date. */
export function useTables() {
  const [tables, setTables] = useState<Raw[]>([])
  const load = useCallback(() => void readManifests<Raw>('raw').then((r) => setTables(r.filter((x) => x.columns?.length))), [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('raw/') && e.path.endsWith('manifest.json') && load(), [load]),
  )
  return tables
}

/** A table's profile.json and roles.json, read again whenever either changes. */
export function useTableFiles(table: string) {
  const [profile, setProfile] = useState<TableProfile | null>(null)
  const [roles, setRoles] = useState<Roles | null>(null)
  const [read, setRead] = useState(false)
  const load = useCallback(async () => {
    if (!table) return
    const [p, r] = await Promise.all([readFile(`raw/${table}/profile.json`), readFile(`raw/${table}/roles.json`)])
    setProfile(p ? (JSON.parse(p) as TableProfile) : null)
    setRoles(r ? (JSON.parse(r) as Roles) : null)
    setRead(true)
  }, [table])
  useEffect(() => {
    setRead(false)
    void load()
  }, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path === `raw/${table}/profile.json` || e.path === `raw/${table}/roles.json`) && void load(), [table, load]),
  )
  return { profile, roles, read }
}

/** Opened the first time a table is shown, folded every time after: remembered in the browser. */
function firstTime(table: string) {
  const key = `vm.table-seen.${table}`
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
  } catch {
    // storage unavailable: show it open
  }
  return true
}

/**
 * "What's in this table": the rows, the dates, where it came from and its
 * license; then one line per column (type, how many values, how much is
 * missing, examples) with its role, which you can change. A column opens to
 * its most common values and, for the kinds of thing, the words a question
 * uses for each. This is where the roles are set: the questions are made
 * from them.
 */
export function TableWhat({ table, open: openAlways }: { table: string; open?: boolean }) {
  const { profile, roles, read } = useTableFiles(table)
  const [open] = useState(() => openAlways ?? firstTime(table))
  const [filter, setFilter] = useState('')
  const [hideIds, setHideIds] = useState(true)
  const [expanded, setExpanded] = useState('')
  const [busy, setBusy] = useState('')
  const run = async (key: string, line: string) => {
    setBusy(key)
    await runCommand(line)
    setBusy('')
  }
  const roleOf = (c: ColumnProfile) => roles?.columns.find((x) => x.name === c.name)?.role ?? c.guess
  const shown = useMemo(
    () => (profile?.columns ?? []).filter((c) => (!hideIds || !['id', 'other'].includes(roleOf(c)) || c.name === expanded) && (!filter.trim() || `${c.name} ${c.examples.join(' ')}`.toLowerCase().includes(filter.trim().toLowerCase()))),
    // roleOf reads roles; the list changes when they do
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, roles, filter, hideIds, expanded],
  )
  const profileLine = joinWords(['data', 'profile', `raw/${table}`])
  const hidden = (profile?.columns.length ?? 0) - shown.length

  return (
    <details className="fold table-what" open={open}>
      <summary className="fold__summary">
        <span className="fold__mark" aria-hidden="true" />
        what's in this table{profile ? ` · ${profile.rows.toLocaleString('en-US')} rows, ${profile.columns.length} columns` : ''}
      </summary>
      <div className="fold__body">
        {read && !profile ? (
          <>
            <p className="mf-next">Not read yet. Reading it counts each column's values and guesses what each column means in a question.</p>
            <Explained id="table.profile">
              <CommandPreview command={profileLine} onRun={() => void run('profile', profileLine)} running={busy === 'profile'} label="read the table" />
            </Explained>
          </>
        ) : profile && roles ? (
          <>
            <dl className="mf-goes table-what__facts">
              <dt>rows</dt>
              <dd>{profile.rows.toLocaleString('en-US')}</dd>
              <dt>dates</dt>
              <dd>{profile.range ? `${profile.range.from} to ${profile.range.to} (${profile.range.column})` : 'no date column'}</dd>
              <dt>source</dt>
              <dd>
                {profile.title ?? table}
                {profile.page && (
                  <>
                    {' · '}
                    <a href={profile.page} target="_blank" rel="noopener noreferrer" className="text-link">
                      its page
                    </a>
                  </>
                )}
              </dd>
              <dt>license</dt>
              <dd>{profile.license ?? 'not recorded'}</dd>
              <dt>one row is</dt>
              <dd>
                <NounField table={table} noun={roles.noun} />
              </dd>
            </dl>
            <div className="inline-fields table-what__tools">
              <label className="field">
                <span className="label label--muted">filter the columns</span>
                <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="a column's name or a value" spellCheck={false} />
              </label>
              <label className="mf-check table-what__switch">
                <input type="checkbox" checked={hideIds} onChange={(e) => setHideIds(e.target.checked)} />
                <span className="label">hide id-like columns{hidden > 0 && hideIds ? ` (${hidden} hidden)` : ''}</span>
              </label>
            </div>
            <div className="table-cols" role="table" aria-label={`columns of ${table}`}>
              <div className="table-cols__row table-cols__head label label--muted" role="row">
                <span role="columnheader">column</span>
                <span role="columnheader">type</span>
                <span role="columnheader">values</span>
                <span role="columnheader">missing</span>
                <span role="columnheader">for example</span>
                <span role="columnheader">role in a question</span>
              </div>
              {shown.map((c) => {
                const role = roleOf(c)
                const isOpen = expanded === c.name
                return (
                  <Fragment key={c.name}>
                    <div className={`table-cols__row ${isOpen ? 'is-open' : ''}`.trim()} role="row">
                      <button type="button" className="text-button table-cols__name" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? '' : c.name)} title="show its values">
                        {c.name}
                      </button>
                      <span>{c.type === 'place' ? 'place-like' : c.type === 'date' ? `date${c.times ? '/time' : ''}` : c.type}</span>
                      <span>{c.distinct.toLocaleString('en-US')}</span>
                      <span>{pct(c.missing)}</span>
                      <span className="table-cols__ex">{c.type === 'date' || c.type === 'number' ? (c.min ? `${c.min} to ${c.max}` : '') : c.examples.join(' · ')}</span>
                      <Explained id="table.role">
                        <select value={role} onChange={(e) => void run(`role ${c.name}`, joinWords(['data', 'role', `raw/${table}`, c.name, e.target.value]))} aria-label={`role of ${c.name}`} title={ROLE_MEANS[role]}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </Explained>
                    </div>
                    {isOpen && <ColumnValues table={table} column={c} roles={roles} />}
                  </Fragment>
                )
              })}
            </div>
            <p className="label label--muted">
              Guessed from the names and the values: {countRole(profile, roles, 'what')} what · {countRole(profile, roles, 'where')} where · {countRole(profile, roles, 'when')} when · {countRole(profile, roles, 'how much')} how much · {countRole(profile, roles, 'how')} how. Change a role and the next questions use it.{' '}
              <button type="button" className="text-button" onClick={() => void run('again', `${profileLine} --again`)}>
                guess again
              </button>
            </p>
          </>
        ) : (
          <p className="label label--muted">reading…</p>
        )}
      </div>
    </details>
  )
}

const countRole = (p: TableProfile, r: Roles, role: Role) => p.columns.filter((x) => (r.columns.find((y) => y.name === x.name)?.role ?? x.guess) === role).length

function NounField({ table, noun }: { table: string; noun: string }) {
  const [v, setV] = useState(noun)
  useEffect(() => setV(noun), [noun])
  const save = () => v.trim() && v.trim() !== noun && void runCommand(joinWords(['data', 'role', `raw/${table}`, '--noun', v.trim()]))
  return (
    <span className="table-what__noun">
      <input type="text" value={v} onChange={(e) => setV(e.target.value.toLowerCase())} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="what one row is" spellCheck={false} />
      <span className="label label--muted">the word answers count in: "12 {v || 'row'}s"</span>
    </span>
  )
}

/** A column's most common values as bars, and for a kind of thing, the words a question uses for each value. */
function ColumnValues({ table, column, roles }: { table: string; column: ColumnProfile; roles: Roles }) {
  const words = roles.words[column.name]
  const max = column.top[0]?.n ?? 1
  return (
    <div className="table-values" role="row">
      {column.top.length === 0 ? (
        <p className="label label--muted">empty in every row</p>
      ) : (
        <>
          <span className="label label--muted">
            {column.distinct > column.top.length ? `the ${column.top.length} most common of ${column.distinct.toLocaleString('en-US')} values` : `all ${column.distinct} values`}
            {words ? ', and the words a question uses for each (the first is used most)' : ''}
          </span>
          <ul className="table-values__list">
            {column.top.map((t) => (
              <li key={t.value} className="table-values__item">
                <span className="table-values__bar" style={{ width: `${Math.max(2, (t.n / max) * 100)}%` }} aria-hidden="true" />
                <span className="table-values__value">{t.value}</span>
                <span className="label label--muted">{t.n.toLocaleString('en-US')}</span>
                {words && <WordsField table={table} column={column.name} value={t.value} words={words[t.value] ?? []} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function WordsField({ table, column, value, words }: { table: string; column: string; value: string; words: string[] }) {
  const [v, setV] = useState(words.join(', '))
  useEffect(() => setV(words.join(', ')), [words])
  const save = () => v.trim() && v.trim() !== words.join(', ') && void runCommand(joinWords(['data', 'words', `raw/${table}`, column, value, v.trim()]))
  return <input type="text" className="table-values__words" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label={`words for ${value}`} spellCheck={false} />
}

/** The lines the one button runs, in order: each is a command, echoed in the terminal. */
export function askSetLines(table: string, name: string, rows: number, voice: string, haveRoles: boolean) {
  return [
    ...(haveRoles ? [] : [joinWords(['data', 'profile', `raw/${table}`])]),
    joinWords(['data', 'questions', `raw/${table}`, name, '--rows', String(rows), ...(voice ? ['--voice', voice] : [])]),
    joinWords(['data', 'split', name, '--valid', '0.15']),
    joinWords(['data', 'validate', name]),
    ...(voice ? [joinWords(['data', 'split', `${name}-voice`, '--valid', '0.15'])] : []),
  ]
}

/**
 * One button: "make a training set from this table". Guesses the roles (if
 * they aren't set yet), makes the questions and their queries, splits off
 * some to test with, and checks them. Every step is a command, so each one
 * shows in the terminal and can be run again by hand, changed.
 */
export function AskSetCard({ table, onMade }: { table: string; onMade: (name: string) => void }) {
  const { roles, read } = useTableFiles(table)
  const [name, setName] = useState(`${table}-ask`.slice(0, 64))
  const [rows, setRows] = useState(600)
  const [voice, setVoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => setName(`${table}-ask`.slice(0, 64)), [table])
  const lines = askSetLines(table, name, rows, voice, !!roles)
  const make = async () => {
    setBusy(true)
    setNote('')
    for (const l of lines) {
      if (!(await runCommand(l))) {
        setNote(`stopped at: ${l}`)
        setBusy(false)
        return
      }
    }
    setBusy(false)
    onMade(name)
  }
  return (
    <div className="ask-set">
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">as dataset</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} />
        </label>
        <label className="field field--narrow">
          <span className="label label--muted">questions: {rows}</span>
          <input type="range" min={300} max={1000} step={100} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
        </label>
        <label className="field">
          <span className="label label--muted">a voice for answers (optional)</span>
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="">none: plain sentences, no second set</option>
            <option value="plain">plain, as a second set to train</option>
            <option value="news">a news brief</option>
            <option value="caption">a caption</option>
          </select>
        </label>
      </div>
      <Explained id="table.make">
        <button type="button" className="text-button ask-set__go" onClick={() => void make()} aria-disabled={busy || !read || !NAME.test(name) || name === 'new' || undefined}>
          {busy ? 'making it…' : 'make a training set from this table →'}
        </button>
      </Explained>
      {note && <span className="label label--muted">{note}</span>}
      <details className="fold">
        <summary className="fold__summary">
          <span className="fold__mark" aria-hidden="true" />
          the {lines.length} commands it runs, to open and change
        </summary>
        <div className="fold__body ask-set__lines">
          {lines.map((l) => (
            <CommandPreview key={l} command={l} onRun={() => void runCommand(l)} label="run this one" />
          ))}
          <p className="label label--muted">
            data questions makes {rows} questions with the queries that answer them, from the roles above and the table's own values: counts, near a block, in a period, two places or periods or kinds compared, day and night, which has the most, and some whose answer is none. Typed, it takes --seed to make a different set.
          </p>
        </div>
      </details>
    </div>
  )
}

/** The smaller option: a table's rows as they are, as text a model learns to continue. */
export function RowsAsTextCard({ table, onMade }: { table: string; onMade: (name: string) => void }) {
  const [as, setAs] = useState<'csv' | 'sentence'>('sentence')
  const [name, setName] = useState(`${table}-rows`.slice(0, 64))
  useEffect(() => setName(`${table}-rows`.slice(0, 64)), [table])
  const lines = [joinWords(['data', 'rows', `raw/${table}`, name, '--as', as]), joinWords(['data', 'split', name, '--valid', '0.1'])]
  const [busy, setBusy] = useState(false)
  const make = async () => {
    setBusy(true)
    for (const l of lines) if (!(await runCommand(l))) return setBusy(false)
    setBusy(false)
    onMade(name)
  }
  return (
    <div className="ask-set">
      <p className="mf-next">A model trained on these writes rows that look like the table's. They are invented records, never real ones: the model makes up blocks, dates and offenses that fit the pattern. Use it to see what a model picks up from a table, not to look anything up.</p>
      <div className="inline-fields">
        <div className="choice" role="radiogroup" aria-label="each row as">
          {(['sentence', 'csv'] as const).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={x === as} className={`text-button ${x === as ? 'is-active' : ''}`.trim()} onClick={() => setAs(x)}>
              {x === 'csv' ? 'a CSV line' : 'read out as a sentence'}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="label label--muted">as dataset</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} />
        </label>
      </div>
      <Explained id="table.rows">
        <CommandPreview command={lines.join(' ; ')} onRun={() => void make()} running={busy} disabled={!NAME.test(name)} label="make it" />
      </Explained>
    </div>
  )
}


/**
 * The Data tab's way in for a table: choose one of the tables brought in, see
 * what's in it (and set the roles), make a training set from it with one
 * button, or, smaller, its rows as they are.
 */
export function TableAskWay({ prefer, onMade, rowsTitle, rowsWhen }: { prefer?: string; onMade: (name: string) => void; rowsTitle: string; rowsWhen: string }) {
  const tables = useTables()
  const [table, setTable] = useState('')
  useEffect(() => {
    if (prefer && tables.some((t) => t.name === prefer)) setTable(prefer)
    else if (!table && tables[0]) setTable(tables[0].name)
  }, [prefer, tables, table])
  if (!tables.length) return <p className="mf-next">No tables yet: bring one in with the search above, or a CSV address under "bring in a book or a table".</p>
  return (
    <div className="table-ask">
      <label className="field">
        <span className="label label--muted">table</span>
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          {tables.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name} · {x.rows?.toLocaleString('en-US')} rows
            </option>
          ))}
        </select>
      </label>
      {table && (
        <>
          <TableWhat key={table} table={table} />
          <AskSetCard table={table} onMade={onMade} />
          <h3 className="panel__title label mf-lead-plain">{rowsTitle}</h3>
          <p className="mf-next">{rowsWhen}</p>
          <RowsAsTextCard table={table} onMade={onMade} />
        </>
      )}
    </div>
  )
}
