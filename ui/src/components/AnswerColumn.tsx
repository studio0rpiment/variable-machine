/** What one model said, as it streams in. */
export interface Answer {
  text: string
  thinking: string
  /** waiting: queued behind the other model (Ollama runs one at a time on a 16GB Mac) */
  state: 'idle' | 'waiting' | 'streaming' | 'done' | 'error'
  meta?: string
}
export const EMPTY: Answer = { text: '', thinking: '', state: 'idle' }

/** One side of the comparison. */
export default function AnswerColumn({ label, model, a, placeholder }: { label: string; model: string; a: Answer; placeholder?: string }) {
  return (
    <div className="mf-answer">
      <span className="label label--muted">{label}</span>
      <span className="mf-answer__model">{model}</span>
      {a.thinking && (
        <details className="exchange__thinking" open={a.state === 'streaming' && !a.text}>
          <summary className="label">thinking</summary>
          <p>{a.thinking}</p>
        </details>
      )}
      {a.state === 'waiting' ? (
        <p className="mf-answer__text mf-answer__text--waiting">Waiting its turn: this Mac runs one model at a time, so this answer starts as soon as the one before it finishes.</p>
      ) : a.state === 'idle' && !a.text && placeholder ? (
        <p className="mf-answer__text mf-answer__text--waiting">{placeholder}</p>
      ) : (
        <p className={`mf-answer__text ${a.state === 'streaming' ? 'is-streaming' : ''}`.trim()}>{a.text || '…'}</p>
      )}
      {a.meta && <span className="label label--muted">{a.meta}</span>}
    </div>
  )
}

