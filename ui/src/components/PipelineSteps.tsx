import type { PipelineState } from '../hooks/usePipeline'

/** The recipe's commands in order: done, running, waiting. The same lines scroll by in the terminal. */
export default function PipelineSteps({ p }: { p: PipelineState }) {
  return (
    <ol className="steps">
      {p.commands.map((c, i) => {
        const state = p.done ? (i <= p.step ? (p.ok || i < p.step ? 'done' : 'failed') : 'skipped') : i < p.step ? 'done' : i === p.step ? 'running' : 'waiting'
        return (
          <li key={i} className={`steps__item is-${state}`}>
            <span className="label label--muted">{state}</span>
            <code>{c}</code>
          </li>
        )
      })}
    </ol>
  )
}
