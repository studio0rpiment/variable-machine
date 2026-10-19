/** Text choices and rem-sized sliders shared by the Train and Prefer panels (KP Minimal: no boxed controls). */

/** A row of text choices; the chosen one is underlined (KP Minimal: no boxed controls). */
export function Choice<T extends string | number>({ label, value, options, onChange, format = String, 'aria-describedby': describedBy }: { label: string; value: T; options: T[]; onChange: (v: T) => void; format?: (v: T) => string; 'aria-describedby'?: string }) {
  return (
    <div className="choice" role="radiogroup" aria-label={label} aria-describedby={describedBy}>
      <span className="label label--muted">{label}</span>
      {options.map((o) => (
        <button key={String(o)} type="button" role="radio" aria-checked={o === value} className={`text-button ${o === value ? 'is-active' : ''}`.trim()} onClick={() => onChange(o)}>
          {format(o)}
        </button>
      ))}
    </div>
  )
}

/** A rem-sized slider over a list of allowed values. */
export function Steps<T extends number>({ label, value, options, onChange, format = String, 'aria-describedby': describedBy }: { label: string; value: T; options: T[]; onChange: (v: T) => void; format?: (v: T) => string; 'aria-describedby'?: string }) {
  const i = Math.max(0, options.indexOf(value))
  return (
    <label className="slider">
      <span className="label label--muted">
        {label} <span className="label">{format(value)}</span>
      </span>
      <input type="range" min={0} max={options.length - 1} step={1} value={i} onChange={(e) => onChange(options[Number(e.target.value)])} aria-describedby={describedBy} />
    </label>
  )
}
