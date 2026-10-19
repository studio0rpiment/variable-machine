import type { OllamaModel } from '../lib/ollama'

interface Props {
  label: string
  models: OllamaModel[]
  value: string
  onChange: (name: string) => void
  onOpen: () => void
}

/** A bare select (bottom rule only). Reloads the model list when it gets focus, rather than on a timer. */
export default function ModelSelect({ label, models, value, onChange, onOpen }: Props) {
  return (
    <label className="model-select">
      <span className="label label--muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} onFocus={onOpen}>
        {!models.some((m) => m.name === value) && <option value={value}>{value || 'no models yet'}</option>}
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
            {m.details?.parameter_size ? ` · ${m.details.parameter_size}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
