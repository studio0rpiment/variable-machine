import { useMemo, useState } from 'react'
import { problemFor, type ChatRow, type DataFormat, type PrefRow } from '@shared/chatRow'

interface Props {
  train: string
  valid: string
  format: DataFormat
}

const PAGE = 20

function parse(text: string, part: 'train' | 'valid', format: DataFormat) {
  const rowProblem = problemFor(format)
  return text
    .split('\n')
    .map((l, i) => ({ line: i + 1, raw: l }))
    .filter((r) => r.raw.trim())
    .map((r) => {
      try {
        const row = JSON.parse(r.raw) as ChatRow & PrefRow
        return { ...r, part, row, problem: rowProblem(row) }
      } catch {
        return { ...r, part, row: null, problem: 'not valid JSON' }
      }
    })
}

/** The JSONL, read-only and paged: each row as its turns, with the file and line it lives on and anything wrong with it. */
export default function DataRows({ train, valid, format }: Props) {
  const rows = useMemo(() => [...parse(train, 'train', format), ...parse(valid, 'valid', format)], [train, valid, format])
  const [page, setPage] = useState(0)
  const [only, setOnly] = useState<'all' | 'train' | 'valid' | 'problems'>('all')
  const shown = rows.filter((r) => (only === 'all' ? true : only === 'problems' ? !!r.problem : r.part === only))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const p = Math.min(page, pages - 1)

  return (
    <div className="rows">
      <div className="rows__bar">
        {(['all', 'train', 'valid', 'problems'] as const).map((o) => (
          <button key={o} type="button" className={`text-button ${only === o ? 'is-active' : ''}`.trim()} onClick={() => (setOnly(o), setPage(0))}>
            {o}
          </button>
        ))}
        <span className="label label--muted">
          {shown.length} rows · page {p + 1} of {pages}
        </span>
        <button type="button" className="text-button" disabled={p === 0} onClick={() => setPage(p - 1)}>
          prev
        </button>
        <button type="button" className="text-button" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
          next
        </button>
      </div>
      <ol className="rows__list">
        {shown.slice(p * PAGE, p * PAGE + PAGE).map((r) => (
          <li key={`${r.part}${r.line}`} className={`row ${r.problem ? 'has-problem' : ''}`.trim()}>
            <span className="label label--muted">
              {r.part}.jsonl:{r.line}
              {r.problem ? ` · ${r.problem}` : ''}
            </span>
            {format === 'preference' && r.row?.prompt ? (
              <>
                <p className="row__turn row__turn--user">
                  <span className="label label--muted">prompt</span> {r.row.prompt}
                </p>
                <p className="row__turn">
                  <span className="label">chosen</span> {r.row.chosen}
                </p>
                <p className="row__turn row__turn--user">
                  <span className="label label--muted">rejected</span> {r.row.rejected}
                </p>
              </>
            ) : (
              r.row?.messages?.map((m, i) => (
                <p key={i} className={`row__turn row__turn--${m.role}`}>
                  <span className="label label--muted">{m.role}</span> {m.content}
                </p>
              )) ?? <code className="row__raw">{r.raw}</code>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
