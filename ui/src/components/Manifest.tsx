import type { ReactNode } from 'react'

interface Props {
  name: string
  /** small lowercase lines under the name */
  lines?: ReactNode[]
  badges?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  active?: boolean
}

/**
 * One artifact as a card: uppercase name, a few label lines, badges and
 * actions. Dashed outline at rest, solid when active or hovered (KP Minimal).
 * Used for Ollama models and HF bases now; datasets, adapters and fused
 * models later.
 */
export default function Manifest({ name, lines = [], badges, actions, children, active }: Props) {
  return (
    <article className={`manifest ${active ? 'is-active' : ''}`.trim()}>
      <header className="manifest__head">
        <h3 className="manifest__name">{name}</h3>
        {badges && <span className="manifest__badges">{badges}</span>}
      </header>
      {lines.filter(Boolean).map((l, i) => (
        <span className="label label--muted" key={i}>
          {l}
        </span>
      ))}
      {children}
      {actions && <footer className="manifest__actions">{actions}</footer>}
    </article>
  )
}

export function Badge({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <span className={`badge ${warn ? 'badge--warn' : ''}`.trim()}>{children}</span>
}
