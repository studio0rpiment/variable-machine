/**
 * Gestures (the moves kind): points the camera finds on a hand or a body,
 * turned into numbers that say the shape, and a k-nearest-neighbours model
 * that names the shape from your own recorded examples. Plain TypeScript,
 * shared by the page (live test) and the helper (`gesture train`), so the
 * model the terminal trains is the one the page runs.
 *
 * k-NN, because it is the one a student can explain back: a new pose is
 * compared with every example you recorded, and the k closest vote. Training
 * is keeping the examples (instant); what it learns is exactly what you showed.
 */

export type Tracker = 'hands' | 'body'
export interface Point {
  x: number
  y: number
  z: number
}

/**
 * The shape, not the place: points relative to a centre, scaled by a body
 * length, so the same gesture made nearer the camera or further left reads
 * the same. Hands: from the wrist (point 0), by wrist to middle knuckle (9).
 * Body: from the middle of the hips (23, 24), by shoulder width (11, 12).
 * Hands are 21 points, a body 33; each gives x, y and z.
 */
export function normalize(points: Point[], tracker: Tracker): number[] {
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 })
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  const centre = tracker === 'hands' ? points[0] : mid(points[23], points[24])
  const scale = (tracker === 'hands' ? dist(points[0], points[9]) : dist(points[11], points[12])) || 1
  return points.flatMap((p) => [(p.x - centre.x) / scale, (p.y - centre.y) / scale, (p.z - centre.z) / scale])
}

export const POINTS: Record<Tracker, number> = { hands: 21, body: 33 }

export interface Example {
  label: string
  v: number[]
}

export interface GestureModel {
  name: string
  tracker: Tracker
  k: number
  labels: string[]
  examples: Example[]
  /** farther than this from every example, the answer is none (see reachOf); models trained before it work it out on loading */
  reach?: number
}

/** The answer when a pose is far from every example: none of the gestures (or no hand or body in the picture). */
export const NONE = 'none'


const distance = (a: number[], b: number[]) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(q * (s.length - 1))] : 0
}

/**
 * How far a pose may be from its nearest example and still be one of the
 * gestures. Two distances from the examples themselves: how close each example
 * is to its nearest example of the same gesture (a gesture made again), and how
 * close it is to the nearest example of another gesture (a different gesture).
 * The line goes halfway between the two (most of the first, the nearest tenth of
 * the second), never closer than one and a half times the first and never
 * farther than three times it (with two gestures far apart, halfway would let a
 * third gesture between them through). A pose that is none of them is then
 * answered none. On the example set, 1 in 23 known poses set aside came out
 * none, and every pose of a gesture left out of training did.
 */
export function reachOf(examples: Example[]): number {
  const same: number[] = []
  const other: number[] = []
  for (const e of examples) {
    let s = Infinity
    let o = Infinity
    for (const f of examples) {
      if (f === e) continue
      const d = distance(e.v, f.v)
      if (f.label === e.label) s = Math.min(s, d)
      else o = Math.min(o, d)
    }
    if (Number.isFinite(s)) same.push(s)
    if (Number.isFinite(o)) other.push(o)
  }
  const again = quantile(same, 0.9)
  const different = other.length ? quantile(other, 0.1) : again * 3
  return Math.min(again * 3, Math.max(again * 1.5, (again + different) / 2))
}

/**
 * The k closest examples vote. Confidence is the share of the votes the
 * winner got, so 1 means all k agreed. When even the closest example is
 * farther than the model's reach, the answer is none, with confidence 0.
 */
export function classify(m: Pick<GestureModel, 'k' | 'examples' | 'labels' | 'reach'>, v: number[]): { label: string; confidence: number; votes: Record<string, number> } {
  const near = m.examples
    .map((e) => ({ label: e.label, d: distance(e.v, v) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, m.k)
  if (m.reach !== undefined && near.length && near[0].d > m.reach) return { label: NONE, confidence: 0, votes: {} }
  const votes: Record<string, number> = {}
  for (const n of near) votes[n.label] = (votes[n.label] ?? 0) + 1
  const [label, count] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  return { label, confidence: near.length ? count / near.length : 0, votes }
}

export interface Check {
  /** examples set aside: every fifth of each label */
  heldOut: number
  correct: number
  /** confusion[made][named]: how often a gesture that was made was named as each */
  confusion: Record<string, Record<string, number>>
}

/**
 * Check, then keep everything: every fifth example of each label is set aside
 * and named by the rest, which shows how well it tells your gestures apart on
 * examples it hasn't kept; then the model keeps all of them.
 */
export function train(name: string, tracker: Tracker, examples: Example[], k: number): { model: GestureModel; check: Check } {
  const labels = [...new Set(examples.map((e) => e.label))].sort()
  const seen: Record<string, number> = {}
  const keep: Example[] = []
  const aside: Example[] = []
  for (const e of examples) {
    seen[e.label] = (seen[e.label] ?? 0) + 1
    ;(seen[e.label] % 5 === 0 ? aside : keep).push(e)
  }
  const confusion: Record<string, Record<string, number>> = Object.fromEntries(labels.map((l) => [l, Object.fromEntries(labels.map((m) => [m, 0]))]))
  let correct = 0
  for (const e of aside) {
    const got = classify({ k, examples: keep, labels }, e.v).label
    if (got) confusion[e.label][got] += 1
    if (got === e.label) correct++
  }
  return { model: { name, tracker, k, labels, examples, reach: reachOf(examples) }, check: { heldOut: aside.length, correct, confusion } }
}
