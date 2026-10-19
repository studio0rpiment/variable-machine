import { Fragment } from 'react'
import type { LossPoint } from './LossChart'
import { LOSS_GUIDE, readLoss } from '../explain/loss'

interface Props {
  points: LossPoint[]
  live?: boolean
  /** Train's loss is how far off its guesses are; Prefer's is how clearly it leans toward the chosen answer */
  kind: 'train' | 'prefer'
}

/**
 * Under the loss chart: this run read in plain words, and a fold on what loss,
 * the two lines and the usual shapes mean.
 */
export default function LossNotes({ points, live = false, kind }: Props) {
  const reading = readLoss(points, kind, live)
  return (
    <div className="loss-notes">
      {reading && (
        <div className="loss-notes__reading" aria-live={live ? 'polite' : undefined}>
          <p className="loss-notes__verdict">{reading.verdict}</p>
          {reading.details.map((d) => (
            <p key={d} className="mf-next">
              {d}
            </p>
          ))}
        </div>
      )}
      <details className="fold">
        <summary className="fold__summary">
          <span className="fold__mark" aria-hidden="true" />
          What this chart means: loss, train and valid
        </summary>
        <div className="fold__body">
          <dl className="model-key">
            {LOSS_GUIDE[kind].map((g) => (
              <Fragment key={g.title}>
                <dt>{g.title}</dt>
                <dd>{g.text}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </details>
    </div>
  )
}
