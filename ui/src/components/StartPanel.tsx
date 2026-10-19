import type { ReactNode } from 'react'
import { AFTER, BEFORE, START_INTRO, THREE_WAYS, THREE_WAYS_NOTE, type Step } from '../explain/start'
import { MergeMark, PreferMark, TrainMark } from '../icons'

const WAY_MARKS: Record<string, ReactNode> = {
  train: <TrainMark size={1.6} />,
  prefer: <PreferMark size={1.6} />,
  merge: <MergeMark size={1.6} />,
}

/** One step: the whole card is a link to its tab. */
function StepCard({ step, n, mark }: { step: Step; n: string; mark?: ReactNode }) {
  return (
    <a className="step" href={`#${step.panel}`}>
      <span className="step__head">
        <span className="label label--muted">{n}</span>
        {mark}
      </span>
      <span className="step__title">{step.title}</span>
      <span className="label label--muted">tab: {step.panel}</span>
      <span className="step__text">{step.text}</span>
    </a>
  )
}

/**
 * Start: the map of the app. The tabs run left to right in the order you'd
 * use them, and the middle of the path is the three ways to change a model's
 * numbers (plan §2: imitate, prefer, blend), each with its explanation.
 */
export default function StartPanel() {
  return (
    <section className="panel start" aria-label="start">
      <header className="start__intro">
        <h1 className="start__title">{START_INTRO.title}</h1>
        <p className="start__text">{START_INTRO.text}</p>
      </header>

      <ol className="start__row">
        {BEFORE.map((s, i) => (
          <li key={s.panel}>
            <StepCard step={s} n={String(i + 1)} />
          </li>
        ))}
      </ol>

      <section className="start__ways" aria-label="three ways to change a model">
        <h2 className="start__ways-title">
          <span className="label label--muted">4</span> Three ways to change the numbers
        </h2>
        <ol className="start__row">
          {THREE_WAYS.map((s, i) => (
            <li key={s.panel}>
              <StepCard step={s} n={`4${'abc'[i]}`} mark={WAY_MARKS[s.panel]} />
            </li>
          ))}
        </ol>
        <p className="label label--muted start__note">{THREE_WAYS_NOTE}</p>
      </section>

      <ol className="start__row">
        {AFTER.map((s, i) => (
          <li key={s.panel}>
            <StepCard step={s} n={String(BEFORE.length + 2 + i)} />
          </li>
        ))}
      </ol>
    </section>
  )
}
