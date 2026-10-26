import type { PipelineState } from '../hooks/usePipeline'
import Loading from './Loading'

/** What a running recipe is doing, in a few words. */
const DOING: Record<string, string> = { train: 'training', prefer: 'training on your choices', merge: 'blending', export: 'making the model', fuse: 'folding the adapter in', register: 'giving it to Ollama' }

/** A running recipe's wait: steps done of steps to do while it trains (so speed and time left are measured), or only what it is doing. */
function Wait({ p }: { p: PipelineState }) {
  const iters = (p.params as { iters?: number } | null)?.iters
  const last = p.points.at(-1)?.iter
  const doing = DOING[p.recipe] ?? 'working'
  if (iters && last) return <Loading label={doing} done={last} total={iters} unit="steps" />
  return <Loading label={iters ? `${doing}: loading the model first` : doing} />
}

/** The recipe's commands in order: done, running, waiting. The same lines scroll by in the terminal. */
export default function PipelineSteps({ p }: { p: PipelineState }) {
  return (
    <>
      {!p.done && <Wait p={p} />}
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
    </>
  )
}
