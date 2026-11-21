import { useEffect, useMemo, useState } from 'react'
import { asNow, classify, SIZE, type GestureModel, type Tracker } from '@shared/gesture'
import { runCommand } from '../lib/helper'
import { readFile } from '../lib/workspace'
import { startGuide } from '../lib/guide'
import { choose, useGestureChoices } from '../lib/gestureChoices'
import { say } from '../text/say'
import type { GestureFacts, Project } from './ProjectsPanel'

/**
 * Project mode, for a card with a schematic: the schematic of that project
 * alone, in place of the tabs. Its input on the left, its steps, its output on
 * the right; each step is done, now (the first not done) or waiting, as the
 * workspace says, and a click opens it. A decision hangs under the box it sits
 * on, with its options and the chosen one: a choice that changes the steps
 * after it. Under the open step, the simulation follows one example from the
 * camera to the OSC message. Built for the gesture controller first.
 */
export default function ProjectMode({ project, step }: { project: Project; step: number }) {
  const facts = project.gesture
  if (!facts) return null
  return <GestureSchematic project={project} facts={facts} open={step} />
}

/** The simulation, shown under the open step's parts. */
export function ProjectSim({ project }: { project: Project }) {
  return project.gesture ? <GestureSim facts={project.gesture} /> : null
}

// ---- the schematic ----

const BOX_W = 140
const BOX_H = 44
const TOP = 46
const STEP_X = (i: number) => 180 + i * 170
const OUT_X = 1030

const TRACKER_WORDS: Record<Tracker, () => string> = { hands: () => say('projects.schematic.hands'), body: () => say('projects.schematic.body') }

type State = 'done' | 'now' | 'waiting'

/** One option of a decision: chosen or not; pressing it chooses it, unless the decision is fixed. */
function Option({ x, y, label, on, fixed, onPick }: { x: number; y: number; label: string; on: boolean; fixed?: boolean; onPick: () => void }) {
  const live = !fixed && !on
  return (
    <text
      x={x}
      y={y}
      className={`schematic__option ${on ? 'is-on' : ''} ${live ? 'is-live' : ''}`.trim()}
      role="radio"
      aria-checked={on}
      aria-disabled={fixed || undefined}
      tabIndex={live ? 0 : -1}
      onClick={() => live && onPick()}
      onKeyDown={(e) => live && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())}
    >
      {on ? `● ${label}` : `○ ${label}`}
    </text>
  )
}

/** A decision: a diamond on a line from its box, its question, and its options in a row. */
function Decision({ x, y, from, question, children, note }: { x: number; y: number; from: number; question: string; children: React.ReactNode; note?: string }) {
  return (
    <g className="schematic__decision" role="radiogroup" aria-label={question}>
      <line x1={x} y1={from} x2={x} y2={y - 12} className="schematic__stem" />
      <polygon points={`${x},${y - 12} ${x + 12},${y} ${x},${y + 12} ${x - 12},${y}`} className="schematic__diamond" />
      <text x={x + 20} y={y - 4} className="schematic__question">
        {question}
        {note && <tspan className="schematic__note">{`  ${note}`}</tspan>}
      </text>
      {children}
    </g>
  )
}

function GestureSchematic({ project, facts, open }: { project: Project; facts: GestureFacts; open: number }) {
  const { source } = useGestureChoices()
  const [busy, setBusy] = useState('')
  const now = project.steps.findIndex((s) => !s.done)
  const state = (i: number): State => (project.steps[i].done ? 'done' : i === now ? 'now' : 'waiting')
  const go = (n: number) => startGuide(project.id, n, project.steps[n - 1].tab, true)
  const names = Object.keys(facts.counts).filter((l) => facts.counts[l] > 0)
  const example = facts.exampleSets.find((x) => x.tracker === facts.tracker)
  /** the boxes' short names: the card's step names are too long for a box */
  const boxNames = [say('projects.schematic.box1'), say('projects.schematic.box2'), say('projects.schematic.box3'), say('projects.schematic.box4'), say('projects.schematic.box5')]
  const stateWord = { done: say('projects.step.done'), now: say('projects.schematic.now'), waiting: say('projects.schematic.waiting') }

  /** what each box says under it: its state, then what the workspace has */
  const captions = [
    say('projects.schematic.tracker', { what: TRACKER_WORDS[facts.tracker]() }),
    facts.made ? facts.set : say('projects.schematic.newSet'),
    facts.example ? say('projects.schematic.recordedAlready') : names.length ? names.map((l) => `${l} ${facts.counts[l]}`).join(' · ') : say('projects.gesture.none'),
    facts.trained ? say('projects.schematic.trained', { correct: facts.trained.check.correct, heldOut: facts.trained.check.heldOut }) : say('projects.schematic.untrained'),
    facts.sent ? say('projects.schematic.sent') : say('projects.schematic.port'),
  ]

  const copyExample = async (folder: string) => {
    setBusy(folder)
    const ok = await runCommand(`gesture example ${folder}`)
    setBusy('')
    if (ok) choose('set', folder)
  }
  const mid = (i: number) => STEP_X(i) + BOX_W / 2
  const from = TOP + BOX_H + 38 // under a box's two caption lines

  return (
    <figure className="schematic" aria-label={say('projects.schematic.label', { project: project.title })}>
      <svg viewBox="0 0 1180 280" className="schematic__svg">
        <defs>
          <marker id="schematic-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="schematic__tip" />
          </marker>
        </defs>
        <text x={20} y={26} className="schematic__column">
          {say('projects.schematic.input')}
        </text>
        <text x={STEP_X(0)} y={26} className="schematic__column">
          {say('projects.schematic.steps')}
        </text>
        <text x={OUT_X} y={26} className="schematic__column">
          {say('projects.schematic.output')}
        </text>

        {/* the input: the camera, which only ever passes on points */}
        <rect x={20} y={TOP} width={130} height={BOX_H} className="schematic__box schematic__box--input" />
        <text x={34} y={TOP + 27} className="schematic__input">
          {say('projects.schematic.camera')}
        </text>
        <text x={20} y={TOP + BOX_H + 18} className="schematic__caption">
          {say('projects.schematic.cameraAbout')}
        </text>

        {/* the wires: in, step to step, out; with the example set, its recorded gestures go round step 3 */}
        <polyline points={`150,${TOP + 22} ${STEP_X(0)},${TOP + 22}`} className="schematic__wire" markerEnd="url(#schematic-end)" />
        {project.steps.slice(0, -1).map((_, i) =>
          facts.example && (i === 1 || i === 2) ? null : (
            <polyline key={i} points={`${STEP_X(i) + BOX_W},${TOP + 22} ${STEP_X(i + 1)},${TOP + 22}`} className="schematic__wire" markerEnd="url(#schematic-end)" />
          ),
        )}
        {facts.example && (
          <g className="schematic__wire is-route">
            <polyline points={`${mid(1)},${TOP} ${mid(1)},${TOP - 12} ${mid(3)},${TOP - 12} ${mid(3)},${TOP}`} markerEnd="url(#schematic-end)" />
            <text x={mid(2)} y={TOP - 17} textAnchor="middle" className="schematic__label">
              {say('projects.schematic.skip')}
            </text>
          </g>
        )}
        <polyline points={`${STEP_X(4) + BOX_W},${TOP + 22} ${OUT_X - 6},${TOP + 22}`} className="schematic__wire" markerEnd="url(#schematic-end)" />

        {/* the steps */}
        {project.steps.map((s, i) => {
          const st = state(i)
          const skipped = facts.example && i === 2
          return (
            <a
              key={s.name}
              href={`?project=${project.id}&step=${i + 1}&mode=project#${s.tab}`}
              className={`schematic__step is-${st} ${open === i + 1 ? 'is-open' : ''} ${skipped ? 'is-skipped' : ''}`.trim()}
              aria-current={open === i + 1 ? 'step' : undefined}
              aria-label={`${i + 1} ${s.name}: ${stateWord[st]}`}
              onClick={(e) => {
                e.preventDefault()
                go(i + 1)
              }}
            >
              <title>{s.name}</title>
              <rect x={STEP_X(i)} y={TOP} width={BOX_W} height={BOX_H} className="schematic__box" />
              <text x={STEP_X(i) + 12} y={TOP + 27} className="schematic__name">
                {`${i + 1} ${boxNames[i]}`}
              </text>
              <text x={STEP_X(i)} y={TOP + BOX_H + 17} className="schematic__caption schematic__state">
                {skipped ? say('projects.schematic.skipped') : stateWord[st]}
              </text>
              <text x={STEP_X(i)} y={TOP + BOX_H + 31} className="schematic__caption">
                {captions[i]}
              </text>
            </a>
          )
        })}

        {/* the output: the student's patch, listening */}
        <rect x={OUT_X - 6} y={TOP - 6} width={BOX_W + 12} height={BOX_H + 12} className={`schematic__use ${facts.sent ? 'is-done' : ''}`.trim()} />
        <rect x={OUT_X} y={TOP} width={BOX_W} height={BOX_H} className="schematic__box schematic__box--input" />
        <text x={OUT_X + 14} y={TOP + 27} className="schematic__input">
          {say('projects.schematic.patch')}
        </text>
        <text x={OUT_X - 6} y={TOP + BOX_H + 24} className="schematic__caption">
          {say('projects.schematic.patchAbout')}
        </text>

        {/* the decisions, each under the box it sits on */}
        <Decision x={mid(0)} y={156} from={from} question={say('projects.decision.follows')} note={facts.made ? say('projects.decision.fixed') : undefined}>
          {(['hands', 'body'] as const).map((t, k) => (
            <Option key={t} x={mid(0) + 20 + k * 76} y={170} label={TRACKER_WORDS[t]()} on={facts.tracker === t} fixed={facts.made} onPick={() => choose('tracker', t)} />
          ))}
        </Decision>
        <Decision x={mid(1)} y={206} from={from} question={say('projects.decision.whose')}>
          <Option
            x={mid(1) + 20}
            y={220}
            label={busy ? say('projects.decision.copying') : say('projects.decision.example')}
            on={facts.example}
            fixed={!example || !!busy}
            onPick={() => {
              if (!example) return
              void copyExample(example.folder)
              go(2)
            }}
          />
          <Option
            x={mid(1) + 150}
            y={220}
            label={say('projects.decision.own')}
            on={!facts.example}
            onPick={() => {
              choose('set', '')
              go(2)
            }}
          />
        </Decision>
        <Decision x={mid(2)} y={156} from={from} question={say('projects.decision.names')}>
          <text x={mid(2) + 20} y={170} className="schematic__option is-on schematic__names" onClick={() => go(3)}>
            {names.length ? names.join(' · ') : say('projects.decision.namesNone')}
          </text>
        </Decision>
        <Decision x={mid(2) + 84} y={246} from={from + 70} question={say('projects.decision.source')}>
          {(['camera', 'photo'] as const).map((x, k) => (
            <Option key={x} x={mid(2) + 104 + k * 104} y={260} label={x === 'camera' ? say('projects.decision.camera') : say('projects.decision.photo')} on={source === x} onPick={() => choose('source', x)} />
          ))}
        </Decision>
        <polygon points={`${OUT_X + 2},218 ${OUT_X + 9},225 ${OUT_X + 2},232 ${OUT_X - 5},225`} className="schematic__diamond" />
        <text x={OUT_X + 16} y={229} className="schematic__key">
          {say('projects.schematic.key1')}
        </text>
        <text x={OUT_X - 6} y={246} className="schematic__key">
          {say('projects.schematic.key2')}
        </text>
        <text x={OUT_X - 6} y={262} className="schematic__key">
          {say('projects.schematic.key3')}
        </text>
      </svg>
    </figure>
  )
}

// ---- the simulation ----

/** One example as the model saw it in its check: what it was, and what it was named. */
interface Run {
  label: string
  /** which example of that gesture it was, from 1 */
  nth: number
  v: number[]
  votes: Record<string, number>
  got: string
  confidence: number
}

/**
 * The examples set aside when the set was trained, each named by the rest, as
 * `gesture train` checks them (every fifth example of each gesture; shared/gesture.ts).
 */
function setAside(m: GestureModel): Run[] {
  const seen: Record<string, number> = {}
  const keep: GestureModel['examples'] = []
  const aside: { label: string; nth: number; v: number[] }[] = []
  for (const e of m.examples) {
    seen[e.label] = (seen[e.label] ?? 0) + 1
    if (seen[e.label] % 5 === 0) aside.push({ label: e.label, nth: seen[e.label], v: e.v })
    else keep.push(e)
  }
  return aside.map((a) => {
    const g = classify({ k: m.k, examples: keep, labels: m.labels }, a.v)
    return { ...a, votes: g.votes, got: g.label, confidence: g.confidence }
  })
}

const STATIONS = 4

/**
 * Follow one example from the camera to the OSC message: the points, the
 * stored example, the neighbours voting, the name sent. Before training it
 * says what will happen; after, it replays an example set aside in training.
 * One station at a time (step ›), or all of them in turn (play).
 */
function GestureSim({ facts }: { facts: GestureFacts }) {
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [which, setWhich] = useState(0)
  const trainedAt = facts.trained ? `${facts.trained.examples}:${facts.trained.k}` : ''

  useEffect(() => {
    setRuns([])
    setWhich(0)
    if (!trainedAt || !facts.set) return
    void readFile(`gestures/${facts.set}/model.json`).then((t) => {
      const m = t ? (JSON.parse(t) as GestureModel) : null
      if (!m) return
      // examples recorded when a hands set followed one hand only, as a hands set has them now
      m.examples = m.examples.map((e) => ({ ...e, v: asNow(e.v) }))
      setRuns(setAside(m))
      setAt(0)
    })
  }, [facts.set, trainedAt])

  useEffect(() => {
    if (!playing) return
    if (at >= STATIONS - 1) return setPlaying(false)
    const id = setTimeout(() => setAt((a) => a + 1), 1100)
    return () => clearTimeout(id)
  }, [playing, at])

  const run = runs[which]
  const k = facts.trained?.k ?? 5
  const name = facts.set || say('projects.sim.yourSet')
  const firstName = Object.keys(facts.counts)[0] ?? say('projects.sim.aName')
  const hands = facts.tracker === 'hands'
  const two = !!run && hands && run.v[127] === 3

  const stations: { title: string; text: string }[] = run
    ? [
        { title: say('projects.sim.points'), text: hands ? (two ? say('projects.sim.points.two') : say('projects.sim.points.one')) : say('projects.sim.points.body') },
        { title: say('projects.sim.stored'), text: say('projects.sim.stored.real', { n: run.v.length, first: run.v.slice(3, 7).map((x) => x.toFixed(2)).join(' ') }) },
        {
          title: say('projects.sim.vote'),
          text: say('projects.sim.vote.real', {
            votes: Object.entries(run.votes)
              .sort((a, b) => b[1] - a[1])
              .map(([l, n]) => `${l} ${n}`)
              .join(' · '),
            k,
          }),
        },
        { title: say('projects.sim.sent'), text: `/vm/${name} "${run.got}" ${run.confidence.toFixed(2)}` },
      ]
    : [
        { title: say('projects.sim.points'), text: hands ? say('projects.sim.points.hands') : say('projects.sim.points.body') },
        { title: say('projects.sim.stored'), text: say('projects.sim.stored.will', { n: SIZE[facts.tracker] }) },
        { title: say('projects.sim.vote'), text: say('projects.sim.vote.will', { k }) },
        { title: say('projects.sim.sent'), text: `/vm/${name} "${firstName}" 0.80` },
      ]

  const result = useMemo(() => {
    if (!run) return facts.trained ? say('projects.sim.reading') : say('projects.sim.before.result')
    const right = runs.filter((r) => r.got === r.label).length
    return run.got === run.label
      ? say('projects.sim.after.right', { got: run.got, k, right, of: runs.length })
      : say('projects.sim.after.wrong', { got: run.got, label: run.label, right, of: runs.length })
  }, [run, runs, facts.trained, k])

  const restart = () => (setAt(0), setPlaying(false))

  return (
    <section className="sim" aria-label={say('projects.sim.label')}>
      <div className="sim__head">
        <span className="label sim__title">{say('projects.sim.title')}</span>
        <span className="label label--muted">{run ? say('projects.sim.after', { nth: run.nth, label: run.label, aside: runs.length }) : say('projects.sim.before')}</span>
        <span className="sim__ways">
          {at < STATIONS - 1 ? (
            <button type="button" className="text-button" onClick={() => (setPlaying(false), setAt((a) => a + 1))}>
              {say('projects.sim.step')}
            </button>
          ) : (
            <button type="button" className="text-button" onClick={restart}>
              {say('projects.sim.again')}
            </button>
          )}
          <button type="button" className="text-button" onClick={() => (at >= STATIONS - 1 && setAt(0), setPlaying((p) => !p))} aria-pressed={playing}>
            {playing ? say('projects.sim.pause') : say('projects.sim.play')}
          </button>
          {runs.length > 1 && (
            <button type="button" className="text-button" onClick={() => (setWhich((w) => (w + 1) % runs.length), restart())}>
              {say('projects.sim.another')}
            </button>
          )}
        </span>
      </div>
      <ol className="sim__stations">
        {stations.map((s, i) => (
          <li key={s.title} className={`sim__station ${i === at ? 'is-at' : ''} ${i < at ? 'is-past' : ''}`.trim()} aria-current={i === at ? 'step' : undefined}>
            <span className="label sim__station-title">{`${i + 1} · ${s.title}`}</span>
            <span className={i === 3 ? 'sim__osc' : ''}>{i <= at ? s.text : ''}</span>
          </li>
        ))}
      </ol>
      <p className="label label--muted sim__result">{at === STATIONS - 1 ? result : say('projects.sim.underWay')}</p>
    </section>
  )
}
