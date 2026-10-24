import { useRef, useState } from 'react'
import { chatOnce } from '../lib/ollama'
import { EMPTY, type Answer } from '../components/AnswerColumn'

/** A short context window: plenty for one question, and a 4B model needs 3GB instead of 7.6GB, so switching is quick. */
const ASK_OPTIONS = { num_ctx: 4096 }

/**
 * Ask several models the same question and stream their answers. On a 16GB
 * Mac Ollama keeps one model in memory at a time, so they answer in turn; the
 * ones still to come show "waiting". A new question replaces the old one.
 */
export function useCompare(count: number) {
  const [answers, setAnswers] = useState<Answer[]>(() => Array.from({ length: count }, () => EMPTY))
  const aborts = useRef<AbortController[]>([])
  const turn = useRef(0)

  const put = (i: number, f: (a: Answer) => Answer) => setAnswers((all) => all.map((a, j) => (j === i ? f(a) : a)))

  /** image: a picture for models that see, by its workspace path */
  const ask = async (question: string, models: string[], image?: string) => {
    aborts.current.forEach((a) => a.abort())
    aborts.current = []
    const mine = ++turn.current
    setAnswers(models.map((_, i) => (i === 0 ? EMPTY : { ...EMPTY, state: 'waiting' })))
    for (const [i, model] of models.entries()) {
      if (mine !== turn.current) return // a newer question replaced this one
      const ctrl = new AbortController()
      aborts.current.push(ctrl)
      put(i, () => ({ text: '', thinking: '', state: 'streaming' }))
      await chatOnce(
        model,
        question,
        (d) =>
          put(i, (a) => ({
            text: a.text + d.content,
            thinking: a.thinking + d.thinking,
            state: d.error ? 'error' : d.done ? 'done' : 'streaming',
            meta: d.error ?? (d.done ? [d.evalCount && `${d.evalCount} tokens`, d.durationMs && `${(d.durationMs / 1000).toFixed(1)}s`].filter(Boolean).join(' · ') : undefined),
          })),
        ctrl.signal,
        ASK_OPTIONS,
        image,
      ).catch((e: Error) => {
        if (!ctrl.signal.aborted) put(i, (a) => ({ ...a, state: 'error', meta: e.message }))
      })
    }
  }

  const busy = answers.some((a) => a.state === 'streaming' || a.state === 'waiting')
  return { answers, ask, busy }
}
