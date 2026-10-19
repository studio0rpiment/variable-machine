/**
 * What the loss chart means, in plain words: for Train (imitating examples)
 * and for Prefer (leaning toward the better answer), whose losses measure
 * different things.
 */

export const LOSS_GUIDE = {
  train: [
    {
      title: 'Loss',
      text: 'How surprised the model is by the answers in your examples. It reads each answer one word piece at a time and guesses the next; loss is how far off its guesses were, on average. Lower means its answers come out closer to your examples. Zero would mean copying them word for word.',
    },
    {
      title: 'Iteration',
      text: 'One step of training: the model reads a few rows, measures its loss, and nudges its numbers (the adapter) to do a little better. The bottom of the chart counts these steps.',
    },
    {
      title: 'Train (solid line)',
      text: 'The loss on the rows it is learning from. It almost always goes down, because the model sees these rows again and again.',
    },
    {
      title: 'Valid (dashed line, with dots)',
      text: 'The loss on the rows set aside when you split the dataset. Training never sees them, so this is the honest test: it shows whether the model learned the pattern or only memorised the rows it was shown. It is measured every so often, so it has fewer points.',
    },
    {
      title: 'Both lines fall',
      text: 'It is learning. The model does better on rows it has never seen, not just the ones it practised on.',
    },
    {
      title: 'Train falls, valid rises',
      text: 'It is memorising (called overfitting): getting better at the practice rows and worse at new ones. Train for fewer iterations, use a lower learning rate, or give it more rows.',
    },
    {
      title: 'Both stay flat',
      text: 'It is hardly learning. Try a higher learning rate or more iterations, or check that the rows really are different from what the model already does.',
    },
    {
      title: 'Zigzags and jumps',
      text: 'Some wobble is normal, because each step reads different rows. Big jumps up mean the steps are too large: lower the learning rate.',
    },
    {
      title: 'The numbers themselves',
      text: 'Compare a run with itself, start to end, or two runs on the same dataset and model. A loss of 1.5 on one dataset and 1.0 on another says nothing about which model is better: some text is simply harder to guess.',
    },
  ],
  prefer: [
    {
      title: 'Loss, here',
      text: 'How clearly the model prefers the chosen answer over the rejected one. It starts near 0.69, which means no preference at all: a coin toss. Lower means it gives the chosen answers higher odds than the rejected ones, compared with where it started.',
    },
    {
      title: 'Iteration',
      text: 'One step of training: the model reads a few pairs, compares how likely it finds each answer, and nudges its numbers to lean toward the chosen one.',
    },
    {
      title: 'Train (solid line)',
      text: 'The loss on the pairs it learns from. It goes down as the model leans their way.',
    },
    {
      title: 'Valid (dashed line, with dots)',
      text: 'The loss on the pairs held out. Training never sees them, so this shows whether the model learned your taste in general or only the pairs it was shown.',
    },
    {
      title: 'Both fall below 0.69',
      text: 'It is learning your preference, including on pairs it has never seen.',
    },
    {
      title: 'Train falls fast toward 0, valid stays or rises',
      text: 'It is memorising the training pairs. With few pairs this happens quickly: add pairs, train fewer iterations, or lower the learning rate.',
    },
    {
      title: 'Stays near 0.69',
      text: 'No preference is forming. The chosen and rejected answers may be too alike, or the learning rate too low.',
    },
    {
      title: 'Too low is a warning too',
      text: 'A loss near zero can mean the model has pushed so hard toward the chosen answers that its writing gets worse. Always chat with the result and compare it with the original.',
    },
  ],
}

export interface LossReading {
  verdict: string
  details: string[]
}

type Point = { iter: number; trainLoss?: number; valLoss?: number }

const f = (n: number) => n.toFixed(2)
const pct = (a: number, b: number) => Math.round(((a - b) / a) * 100)

/**
 * This run's curve, read in a few sentences: how far each line moved, and
 * what that suggests (learning, memorising, flat, unsteady). An estimate from
 * the shape, not a judgement of the model: the closing line says to chat with it.
 */
export function readLoss(points: Point[], kind: 'train' | 'prefer', live: boolean): LossReading | null {
  const train = points.filter((p) => p.trainLoss !== undefined).map((p) => ({ iter: p.iter, v: p.trainLoss! }))
  const val = points.filter((p) => p.valLoss !== undefined).map((p) => ({ iter: p.iter, v: p.valLoss! }))
  if (train.length < 2 && val.length < 2) return null

  const details: string[] = []
  const t0 = train[0]?.v
  const t1 = train.at(-1)?.v
  if (t0 !== undefined && t1 !== undefined && train.length > 1)
    details.push(`Train went from ${f(t0)} to ${f(t1)} (${t1 <= t0 ? `${pct(t0, t1)}% lower` : `${-pct(t0, t1)}% higher`}).`)
  const v0 = val[0]?.v
  const v1 = val.at(-1)?.v
  const best = val.reduce<{ iter: number; v: number } | null>((b, p) => (!b || p.v < b.v ? p : b), null)
  if (v0 !== undefined && v1 !== undefined && val.length > 1) {
    details.push(`Valid went from ${f(v0)} to ${f(v1)}${best && best.v < v1 - 0.005 ? `, lowest ${f(best.v)} at iteration ${best.iter}` : ''}.`)
  }
  if (kind === 'prefer' && t1 !== undefined) details.push(`0.69 is where it started: no preference. ${t1 < 0.69 ? 'Below it, the model leans toward the chosen answers.' : ''}`.trim())

  // Big upward jumps in train, relative to its range: steps too large.
  const range = t0 !== undefined && t1 !== undefined ? Math.max(Math.abs(t0 - t1), 0.05) : 0.05
  const jumps = train.slice(1).filter((p, i) => p.v - train[i].v > range * 0.5).length

  let verdict: string
  const prefix = live ? 'So far: ' : ''
  const trainDrop = t0 !== undefined && t1 !== undefined ? (t0 - t1) / t0 : 0
  if (val.length >= 2 && best && v1 !== undefined && v1 > best.v * 1.05 && trainDrop > 0.05) {
    verdict = `${prefix}it learned, then started memorising. Valid was lowest at iteration ${best.iter} and has risen since, while train kept falling. Fewer iterations (about ${best.iter}) would likely give a better model.`
  } else if (val.length >= 2 && v0 !== undefined && v1 !== undefined && v1 < v0 * 0.97) {
    verdict = `${prefix}it is learning: valid, the rows it never trained on, went down too.`
  } else if (trainDrop < 0.05) {
    verdict = `${prefix}it hardly learned: the loss barely moved. Try a higher learning rate or more iterations.`
  } else if (val.length < 2) {
    verdict = `${prefix}train went down. There aren't enough valid points yet to say whether it learned or memorised.`
  } else {
    verdict = `${prefix}train went down but valid did not: it may be memorising rather than learning. More rows, or fewer iterations, usually help.`
  }
  if (jumps >= 2) details.push(`Train jumped up ${jumps} times. Some wobble is normal, since each step reads different rows; if the jumps grow, lower the learning rate.`)
  details.push(live ? 'Still running: the picture can change.' : 'The chart is a guide. Chat with the result next to the original to see what changed.')
  return { verdict, details }
}
