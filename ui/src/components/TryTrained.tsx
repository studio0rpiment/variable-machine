import { useEffect, useMemo, useState } from 'react'
import { readFile } from '../lib/workspace'
import { rowProblem, type ChatRow, type PictureRow, type PrefRow } from '@shared/chatRow'
import AnswerColumn from './AnswerColumn'
import { useCompare } from '../hooks/useCompare'
import { Explained } from '../explain/Explained'

interface Props {
  /** the exported model, as Ollama knows it */
  model: string
  /** the untouched model it was trained from, if it is installed */
  original?: string
  /** the dataset it was trained on: its set-aside rows are the questions */
  data: string
  onClose: () => void
}

/** image: a picture row's photo, as a workspace path */
type Q = { question: string; expected?: string; worse?: string; image?: string }

function readRows(text: string, data: string): Q[] {
  return text.split('\n').flatMap((l): Q[] => {
    if (!l.trim()) return []
    try {
      const r = JSON.parse(l) as ChatRow | PrefRow | PictureRow
      if ('prompt' in r) return [{ question: r.prompt, expected: r.chosen, worse: r.rejected }]
      if (rowProblem(r)) return []
      const user = r.messages.find((m) => m.role === 'user')?.content
      const answer = r.messages.find((m) => m.role === 'assistant')?.content
      const image = 'images' in r && typeof r.images?.[0] === 'string' ? `data/${data}/${r.images[0]}` : undefined
      return user ? [{ question: user, expected: answer, ...(image && { image }) }] : []
    } catch {
      return []
    }
  })
}

/**
 * Test a trained model the honest way: on questions from the rows set aside
 * at the split, which training never saw. Three answers side by side: what
 * the dataset says, the original model, and the trained one. Another question
 * is one click; your own is a sentence away (then there is no answer in the data).
 */
export default function TryTrained({ model, original, data, onClose }: Props) {
  const [rows, setRows] = useState<Q[]>([])
  const [from, setFrom] = useState<'set aside' | 'trained on'>('set aside')
  const [i, setI] = useState(0)
  const [question, setQuestion] = useState('')
  const models = useMemo(() => (original ? [original, model] : [model]), [original, model])
  const { answers, ask, busy } = useCompare(models.length)

  useEffect(() => {
    void (async () => {
      const valid = readRows((await readFile(`data/${data}/valid.jsonl`)) ?? '', data)
      const pool = valid.length ? valid : readRows((await readFile(`data/${data}/train.jsonl`)) ?? '', data)
      setFrom(valid.length ? 'set aside' : 'trained on')
      setRows(pool)
      setI(0)
      setQuestion(pool[0]?.question ?? '')
    })()
  }, [data])

  const row = rows[i]
  const own = !row || question.trim() !== row.question.trim()
  const next = () => {
    if (!rows.length) return
    const n = (i + 1) % rows.length
    setI(n)
    setQuestion(rows[n].question)
  }

  return (
    <section className="try" aria-label={`try ${model}`}>
      <header className="try__head">
        <h2 className="panel__title label mf-lead-plain">try it: {original ? `${original} before, ${model} after` : model}</h2>
        <button type="button" className="text-button" onClick={onClose}>
          close
        </button>
      </header>
      <p className="mf-next">
        {from === 'set aside'
          ? `The questions come from the rows of ${data} set aside when it was split: training never saw them, so this shows what the model learned rather than what it memorised.`
          : `${data} has no rows set aside, so these questions are ones it trained on: a good answer may only be memory.`}{' '}
        Change the question to ask your own.
      </p>
      <div className="mf-make__run try__ask">
        <label className="field">
          <span className="label label--muted">
            question {row && !own ? `${i + 1} of ${rows.length}, ${from}` : '(your own)'}
          </span>
          <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
        {row?.image && <img className="row__picture" src={`/api/workspace/file?path=${encodeURIComponent(row.image)}`} alt={row.image} />}
        <Explained id="adapters.try">
          <button type="button" className="text-button" onClick={() => question.trim() && !busy && void ask(question.trim(), models, row?.image)} aria-disabled={!question.trim() || busy || undefined}>
            ask {original ? 'both' : 'it'}
          </button>
        </Explained>
        <button type="button" className="text-button" onClick={next} aria-disabled={rows.length < 2 || busy || undefined}>
          another question
        </button>
      </div>
      <div className={`mf-compare ${own ? '' : 'mf-compare--three'}`.trim()}>
        {!own && row?.expected && (
          <div className="mf-answer mf-answer--data">
            <span className="label label--muted">the answer in the data</span>
            <span className="mf-answer__model">{data}</span>
            <p className="mf-answer__text">{row.expected}</p>
            {row.worse && <span className="label label--muted">rather than: {row.worse}</span>}
          </div>
        )}
        {original && <AnswerColumn label="the original" model={original} a={answers[0]} placeholder={`${original} before training. Its answer appears here.`} />}
        <AnswerColumn label="after training" model={model} a={answers[original ? 1 : 0]} placeholder={`${model}, trained on ${data}. Its answer appears here.`} />
      </div>
      <p className="mf-next">
        Look for the things the data does: its length, its tone, its kind of answer. Training on a few hundred rows changes how a model answers far more than what it knows.
      </p>
    </section>
  )
}
