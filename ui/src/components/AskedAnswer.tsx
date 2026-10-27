import type { Asked } from '../lib/askTable'
import type { Roles } from '@shared/tableQuery'

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }))

/**
 * One answer from asking a table, in the order it happened: the query the
 * model wrote (or, plainly, why it isn't one the table can run), the numbers
 * the runner counted and the rows behind them, and the answer in a sentence.
 */
export default function AskedAnswer({ asked, roles }: { asked: Asked; roles?: Roles }) {
  const r = asked.result
  const shownCols = roles ? roles.columns.filter((c) => !['id', 'other'].includes(c.role) && c.place !== 'lat' && c.place !== 'lon').map((c) => c.name).slice(0, 7) : Object.keys((r?.ok ? r.rows[0] : undefined) ?? {}).slice(0, 7)
  return (
    <div className="asked">
      <div className="asked__step">
        <span className="label label--muted">the query it wrote</span>
        <code className="asked__query">{asked.query ? JSON.stringify(asked.query) : asked.wrote.trim() || '(nothing)'}</code>
      </div>
      {asked.problem ? (
        <p className="asked__problem">
          <span className="label">not a query the table can run.</span> {asked.problem}. No answer is given rather than a guess.
        </p>
      ) : (
        r?.ok && (
          <>
            <div className="asked__step">
              <span className="label label--muted">
                what the table says · {fmt(r.matched)} {r.matched === 1 ? 'row' : 'rows'} match
              </span>
              {r.sides || r.groups ? (
                <ol className="asked__counts">
                  {(r.sides ?? r.groups)!.map((s) => (
                    <li key={s.label}>
                      <span>{s.label}</span>
                      <span>{fmt(s.value)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <span className="asked__number">{fmt(r.value)}</span>
              )}
              {r.notes.map((n) => (
                <span key={n} className="label label--muted">
                  {n}
                </span>
              ))}
            </div>
            <p className="asked__sentence">{asked.sentence}</p>
            {r.rows.length > 0 && (
              <details className="asked__more">
                <summary className="label">the rows behind it (the first {r.rows.length})</summary>
                <div className="asked__rows">
                  <table>
                    <thead>
                      <tr>
                        {shownCols.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.rows.map((row, i) => (
                        <tr key={i}>
                          {shownCols.map((c) => (
                            <td key={c}>{row[c]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {asked.sql && (
              <details className="asked__more">
                <summary className="label">the same query in SQL</summary>
                <pre className="asked__sql">{asked.sql}</pre>
              </details>
            )}
          </>
        )
      )}
    </div>
  )
}
