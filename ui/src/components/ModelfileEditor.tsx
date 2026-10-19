import { useMemo } from 'react'
import { parseModelfile, WEIGHTS, type Line } from '@shared/modelfile'

interface Props {
  value: string
  /** omit for a read-only view (the Modelfile tab shows what its form makes) */
  onChange?: (text: string) => void
}

const NOTES: Record<string, string> = {
  FROM: 'weights',
  ADAPTER: 'weights',
  SYSTEM: 'not weights · system prompt',
  PARAMETER: 'not weights · sampling',
  TEMPLATE: 'not weights · prompt format',
  MESSAGE: 'not weights · example turn',
  LICENSE: 'not weights · license',
  REQUIRES: 'not weights · ollama version',
  unknown: 'not an instruction',
}

/**
 * The Modelfile as plain text, with a gutter that says, line by line, which
 * instructions are weights (FROM, ADAPTER) and which only travel with them.
 * No wrapping, so gutter rows and text rows stay one-to-one.
 */
export default function ModelfileEditor({ value, onChange }: Props) {
  const parsed = useMemo(() => parseModelfile(value), [value])
  const rows = value.split('\n').length
  const gutter = useMemo(() => {
    const out: { text: string; weights?: boolean; cont?: boolean }[] = Array.from({ length: rows }, () => ({ text: '' }))
    parsed.lines.forEach((l: Line) => {
      if (l.kind === 'blank' || l.kind === 'comment') return
      out[l.start] = { text: NOTES[l.kind], weights: WEIGHTS.has(l.kind as never) }
      for (let i = 1; i < l.span; i++) out[l.start + i] = { text: '', cont: true, weights: WEIGHTS.has(l.kind as never) }
    })
    return out
  }, [parsed, rows])

  return (
    <div className="modelfile">
      <div className="modelfile__scroll">
        <div className="modelfile__gutter" aria-hidden="true">
          {gutter.map((g, i) => (
            <div key={i} className={`modelfile__mark ${g.weights ? 'is-weights' : ''} ${g.cont ? 'is-cont' : ''}`.trim()}>
              {g.text}
            </div>
          ))}
        </div>
        <textarea
          className="modelfile__text"
          value={value}
          rows={rows}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={!onChange}
          aria-label="Modelfile"
        />
      </div>
      {parsed.errors.length > 0 && (
        <ul className="modelfile__errors">
          {parsed.errors.map((e) => (
            <li key={e} className="label">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
