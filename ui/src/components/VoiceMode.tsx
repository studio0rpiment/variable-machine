import { useEffect, useRef, useState } from 'react'
import { useRoutePage } from '../lib/routePage'
import { HF_BASES } from '@shared/library'
import { NODES, WIRES, W, H, stretchWire } from './FlowMap'
import { MAX_PX, mapWidth, stripZoom } from '../lib/mapWidth'
import CommandPreview from './CommandPreview'
import Loading from './Loading'
import { Icon } from '../icons'
import { startGuide } from '../lib/guide'
import { runCommand } from '../lib/helper'
import { useHelperState } from '../hooks/useHelper'
import { APPROACHES, chooseVoice, toggleText, useVoiceChoices, type Approach } from '../lib/voiceChoices'
import { say } from '../text/say'
import type { Project, Step, VoiceFacts } from './ProjectsPanel'
import PackedOptions from './PackedOptions'

/**
 * Project mode for a character's voice. The schematic is the Start map's top
 * band, every box where the Start map has it: the route the decisions draw is
 * lit, numbered step by step, and every other box stays as a faint outline, so
 * the student sees where the project sits in all of Variable Machine. As the
 * page scrolls, the map folds, a px of height for each px scrolled, into a strip
 * that stays at the top: each box of the route keeps its x and slides to one
 * of three rows, and the boxes off the route fade. Under it,
 * the decisions: each option says what it costs and what it changes, and
 * choosing one redraws the route.
 */

/** The language models' band of the Start map: what a voice can use. */
const BAND = new Set(['models', 'words', 'modelfile', 'data', 'train', 'prefer', 'merge', 'adapters', 'chat', 'share'])
const VIEW = { x: 30, y: 30, w: 1170, h: 440 }
/** each box's name as the Start map shows it, for the folded line */
const NAMES: Record<string, string> = Object.fromEntries(NODES.map((n) => [n.id, n.name ?? n.id]))

/** The wires each approach lights, as the Start map draws them (from → to). */
const LIT: Record<Approach, [string, string][]> = {
  modelfile: [['models', 'modelfile'], ['modelfile', 'chat']],
  imitate: [['words', 'data'], ['data', 'train'], ['models', 'train'], ['train', 'adapters'], ['adapters', 'chat']],
  prefer: [['models', 'chat'], ['chat', 'data'], ['data', 'prefer'], ['prefer', 'adapters'], ['adapters', 'chat']],
  blend: [['words', 'data'], ['data', 'train'], ['models', 'train'], ['train', 'adapters'], ['adapters', 'merge'], ['merge', 'adapters'], ['adapters', 'chat']],
}

type State = 'done' | 'now' | 'waiting'
const STATE_WORDS: Record<State, () => string> = { done: () => say('projects.step.done'), now: () => say('projects.schematic.now'), waiting: () => say('projects.schematic.waiting') }

/** Each approach in words: its name, its tab, and what it costs and changes. */
const APPROACH_WORDS: Record<Approach, () => { name: string; tab: string; time: string; disk: string; needs: string; changes: string }> = {
  modelfile: () => ({
    name: say('projects.voice.approach.modelfile'),
    tab: say('projects.voice.approach.modelfile.tab'),
    time: say('projects.voice.approach.modelfile.time'),
    disk: say('projects.voice.approach.modelfile.disk'),
    needs: say('projects.voice.approach.modelfile.needs'),
    changes: say('projects.voice.approach.modelfile.changes'),
  }),
  imitate: () => ({
    name: say('projects.voice.approach.imitate'),
    tab: say('projects.voice.approach.imitate.tab'),
    time: say('projects.voice.approach.imitate.time'),
    disk: say('projects.voice.approach.imitate.disk'),
    needs: say('projects.voice.approach.imitate.needs'),
    changes: say('projects.voice.approach.imitate.changes'),
  }),
  prefer: () => ({
    name: say('projects.voice.approach.prefer'),
    tab: say('projects.voice.approach.prefer.tab'),
    time: say('projects.voice.approach.prefer.time'),
    disk: say('projects.voice.approach.prefer.disk'),
    needs: say('projects.voice.approach.prefer.needs'),
    changes: say('projects.voice.approach.prefer.changes'),
  }),
  blend: () => ({
    name: say('projects.voice.approach.blend'),
    tab: say('projects.voice.approach.blend.tab'),
    time: say('projects.voice.approach.blend.time'),
    disk: say('projects.voice.approach.blend.disk'),
    needs: say('projects.voice.approach.blend.needs'),
    changes: say('projects.voice.approach.blend.changes'),
  }),
}
const stateOf = (steps: Step[], i: number): State => {
  const now = steps.findIndex((s) => !s.done)
  return steps[i].done ? 'done' : i === now ? 'now' : 'waiting'
}

/** Sizes of the folded strip, in units of the Start map's viewBox. */
const F = { h: 30, gap: 22, pad: 8, level: (k: number) => 7 + 5 * k }
/** The strip's window on a laptop, in the map's units, and how close in it goes on a narrow screen (as Make Your Own's: lib/mapWidth). */
const STRIP_ZOOM = { base: 820, min: 520 }

/** A number that eases to its target over a third of a second, so the folded view glides from step to step. */
export function useGlide(target: number) {
  const [now, setNow] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let frame = 0
    const tick = (time: number) => {
      const k = clamp((time - start) / 350)
      const v = a + (target - a) * (1 - (1 - k) ** 3)
      from.current = v
      setNow(v)
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return now
}
const INPUTS = ['words', 'models']
/** boxes with a decision on the page, so a click on one scrolls to it even when no step sits there */
const DECIDED = new Set(['models', 'words', 'data', 'prefer'])
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number) => Math.min(1, Math.max(0, x))

/** The wires the route lights: a route that trains a voice first (prefer on your trained voice) lights the imitate wires too. */
const litWires = (facts: VoiceFacts) =>
  facts.approach === 'prefer' && facts.steps.some((st) => st.node === 'words') ? [...LIT.imitate, ...LIT.prefer] : LIT[facts.approach]

/**
 * Where each box of the route goes when the map folds: the same x as on the
 * Start map, and one of three rows. The two inputs the route starts from keep
 * their order on the Start map: a base model on the top row, your words on the
 * bottom one. Every other box sits on the middle row, unless a box already
 * holds its x there, and then it moves to the bottom row. A lone input leads
 * the middle row.
 */
function foldLayout(facts: VoiceFacts, lit: [string, string][]) {
  const order: string[] = []
  for (const id of [...lit.flat(), ...facts.steps.map((st) => st.node ?? '')]) if (id && BAND.has(id) && !order.includes(id)) order.push(id)
  const two = INPUTS.every((id) => order.includes(id))
  const x = (id: string) => NODES.find((n) => n.id === id)!.x
  const row: Record<string, number> = {}
  for (const id of order) {
    if (two && id === 'models') row[id] = 0
    else if (two && id === 'words') row[id] = 2
    else row[id] = order.some((o) => o !== id && row[o] === 1 && x(o) === x(id)) ? 2 : 1
  }
  // only the rows in use, packed
  const used = [...new Set(Object.values(row))].sort()
  const middle = used.length === 1
  // a one-row strip arcs its wires round above and below; more rows arc through the gaps
  // wires along one row that cannot run straight: back to an earlier box, or past a box between
  const between = (a: string, b: string) => order.some((o) => o !== a && o !== b && row[o] === row[a] && x(o) > Math.min(x(a), x(b)) && x(o) < Math.max(x(a), x(b)))
  const backs = lit.filter(([a, b]) => row[a] === row[b] && x(b) < x(a))
  const skips = lit.filter(([a, b]) => row[a] === row[b] && x(b) > x(a) && between(a, b))
  const over = middle && backs.length ? F.level(backs.length - 1) : 0
  const under = middle && skips.length ? F.level(skips.length - 1) : 0
  // rows far enough apart for the wires that run back over the middle row
  const gap = Math.max(F.gap, backs.length ? F.level(backs.length - 1) + 10 : 0)
  const top = VIEW.y + F.pad + over
  const y = Object.fromEntries(order.map((id) => [id, top + used.indexOf(row[id]) * (F.h + gap)]))
  const height = F.pad * 2 + over + under + used.length * F.h + (used.length - 1) * gap
  return { order, row, x, y, height, backs, skips }
}

/**
 * The schematic over a voice route's page. `step` is the step the address
 * opens at: the page starts there. As the page scrolls, the step in view is
 * reported (onStep) and its box, or the box of the decision in view, is lit.
 */
export default function VoiceMode({ project, step, onStep, whole, onZoom }: { project: Project; step: number; onStep: (n: number) => void; whole: boolean; onZoom: () => void }) {
  const facts = project.voice!
  const lit = litWires(facts)
  const fold = foldLayout(facts, lit)
  // the svg's width in px, as last measured: the strip's height in px follows from it
  const pxRef = useRef(MAX_PX)
  const { space, self, scroll, focus, stepNow, width, pick } = useRoutePage({ step, project: project.id, onStep, stripPx: () => (fold.height * pxRef.current) / stripZoom(pxRef.current, STRIP_ZOOM.base, STRIP_ZOOM.min), line: 'voice-mode__line' })
  // folded, the view closes in on the open step's box and its neighbours; it glides when another step opens
  // the box lit and zoomed to: the section in view's, if it is on the route, or else the open step's
  const lightId = focus && fold.order.includes(focus) ? focus : facts.steps[stepNow - 1]?.node
  const node = NODES.find((n) => n.id === lightId)
  // the map runs the window's whole width; wider than MAX_PX, its boxes keep their size and its wires get longer (lib/mapWidth)
  const px = width || MAX_PX
  const { w: VW, zoom, sx } = mapWidth(px, VIEW.w, STRIP_ZOOM)
  const zoomX = Math.min(VIEW.x + VW - zoom, Math.max(VIEW.x, (node ? sx(node.x) + W / 2 : VIEW.x) - zoom / 2))
  // FULL / ZOOM, in the header: the whole route, or zoomed in on the step
  const zx = useGlide(whole ? VIEW.x : zoomX)
  const zw = useGlide(whole ? VW : zoom)
  pxRef.current = px
  const open = (VIEW.h * px) / VW
  // each px scrolled takes a px off the map's height: solve for how far folded that is, as the view narrows and its height shrinks
  const want = Math.max((fold.height * px) / zw, open - scroll)
  const t = clamp((want * VW - px * VIEW.h) / (px * (fold.height - VIEW.h) - want * (zw - VW)))
  const view = { x: lerp(VIEW.x, zx, t), w: lerp(VW, zw, t), h: lerp(VIEW.h, fold.height, t) }

  return (
    <>
      {/* a direct child of the scrolling page, so it stays at the top as the rest scrolls */}
      <div className="voice-mode__line">
        <div ref={self} className="voice-band__frame">
          <Schematic project={project} facts={facts} lit={lit} fold={fold} t={t} view={view} sx={sx} open={stepNow} light={lightId} pick={(box) => { if (whole) onZoom() /* FULL closes back to the zoomed strip */; pick(box) }} />
        </div>
      </div>
      {/* holds the open map's place in the page; the map draws over it */}
      <div ref={space} className="voice-mode" style={{ height: `${open / 16}rem` }} />
    </>
  )
}

type Fold = ReturnType<typeof foldLayout>

/**
 * The schematic, from the Start map's band (t = 0) to the folded strip (t = 1).
 * Every box on the route keeps its x and slides to its row; the rest fade.
 * The Start map's own wires fade out early, and the route's wires, drawn from
 * where the boxes are, take over, so a wire never leaves its boxes.
 */
function Schematic({ project, facts, lit, fold, t, view, sx, open, light, pick }: { project: Project; facts: VoiceFacts; lit: [string, string][]; fold: Fold; t: number; view: { x: number; w: number; h: number }; sx: (x: number) => number; open: number; light?: string; pick: (box: string) => void }) {
  const onRoute = new Set(fold.order)
  const stepsAt = (id: string) => facts.steps.map((s, i) => ({ s, i })).filter((x) => x.s.node === id)
  const nodeState = (id: string): State | null => {
    const at = stepsAt(id)
    if (!at.length) return null
    const states = at.map((x) => stateOf(facts.steps, x.i))
    return states.includes('now') ? 'now' : states.every((x) => x === 'done') ? 'done' : 'waiting'
  }
  const isLit = (from: string, to: string) => lit.some(([a, b]) => a === from && b === to)
  const boxH = lerp(H, F.h, t)
  const pos = (id: string) => {
    const n = NODES.find((m) => m.id === id)!
    return { x: sx(n.x), y: onRoute.has(id) ? lerp(n.y, fold.y[id], t) : n.y }
  }
  const early = clamp(1 - t * 3)

  // the route's wires, from where the boxes are now
  const wire = (a: string, b: string) => {
    const A = pos(a)
    const B = pos(b)
    const h = boxH
    const sameRow = fold.row[a] === fold.row[b]
    const back = fold.backs.some(([p, q]) => p === a && q === b)
    const skip = fold.skips.some(([p, q]) => p === a && q === b)
    if (sameRow && (back || skip)) {
      const k = (back ? fold.backs : fold.skips).findIndex(([p, q]) => p === a && q === b)
      const y = back ? Math.min(A.y, B.y) - F.level(k) : Math.max(A.y, B.y) + h + F.level(k)
      const from = A.x + W / 2 + (back ? -12 : 12)
      const to = B.x + W / 2 + (back ? 12 : -12)
      return `M${from},${back ? A.y : A.y + h} V${y} H${to} V${back ? B.y : B.y + h}`
    }
    if (sameRow) {
      const mid = (A.x + W + B.x) / 2
      return `M${A.x + W},${A.y + h / 2} H${mid} V${B.y + h / 2} H${B.x}`
    }
    const below = fold.row[b] > fold.row[a]
    // across rows: along its own row first, if nothing on that row is in the way
    const clear = !fold.order.some((o) => o !== a && o !== b && fold.row[o] === fold.row[a] && sx(fold.x(o)) > A.x && sx(fold.x(o)) < B.x + W / 2)
    if (B.x > A.x + W && clear) return `M${A.x + W},${A.y + h / 2} H${B.x + W / 2 + 14} V${below ? B.y : B.y + h}`
    // otherwise down or up first, entering low on the box's side so it meets no wire along that row
    return `M${A.x + W / 2 - 14},${below ? A.y + h : A.y} V${B.y + h * 0.75} H${B.x > A.x ? B.x : B.x + W}`
  }

  return (
    <figure className="voice-band" aria-label={t === 1 ? say('projects.voice.mode.line') : say('projects.schematic.label', { project: project.title })}>
      <svg viewBox={`${view.x} ${VIEW.y} ${view.w} ${view.h}`} className="voice-band__svg">
        <defs>
          <marker id="voice-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="voice-band__tip" />
          </marker>
        </defs>
        {/* the Start map's wires, as it draws them; they give way to the route's as the map folds */}
        {early > 0 &&
          WIRES.filter((w) => BAND.has(w.from) && BAND.has(w.to)).map((w) => stretchWire(w, sx)).map((w) => {
            const on = isLit(w.from, w.to)
            return (
              <g key={`${w.from}-${w.to}-${w.label}`} className={`voice-band__wire ${on ? 'is-lit' : ''}`.trim()} style={{ opacity: early }}>
                <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#voice-end)" />
                {on && (
                  <text x={w.at[0]} y={w.at[1]} textAnchor={w.anchor ?? 'start'} className="voice-band__label">
                    {w.label}
                  </text>
                )}
              </g>
            )
          })}
        {t > 0 &&
          lit.map(([a, b]) => (
            <path key={`${a}-${b}`} d={wire(a, b)} className="voice-band__route" style={{ opacity: clamp(t * 3) }} markerEnd="url(#voice-end)" />
          ))}
        {NODES.filter((n) => BAND.has(n.id)).map((n) => {
          const at = stepsAt(n.id)
          const st = nodeState(n.id)
          const on = onRoute.has(n.id)
          const isOpen = at.some((x) => x.i + 1 === open)
          // green: the box of the section in view, which is the open step's until a decision scrolls under the strip
          const isLit = n.id === light
          const target = at.find((x) => !x.s.done) ?? at[0]
          const p = pos(n.id)
          if (!on && t === 1) return null
          // a box on the route with a step or a decision takes you to its section
          const can = on && (!!target || DECIDED.has(n.id))
          return (
            <g
              key={n.id}
              className={`voice-band__node ${on ? 'is-on' : ''} ${st ? `is-${st}` : ''} ${isLit ? 'is-open' : ''} ${can ? 'is-step' : ''}`.trim()}
              style={on ? undefined : { opacity: 0.22 * (1 - t) }}
              role={can ? 'button' : undefined}
              tabIndex={can ? 0 : undefined}
              aria-current={isOpen ? 'step' : undefined}
              aria-label={target ? `${at.map((x) => x.i + 1).join(', ')} ${target.s.name}` : can ? NAMES[n.id] : undefined}
              onClick={() => can && pick(n.id)}
              onKeyDown={(e) => can && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(n.id))}
            >
              <title>{target ? target.s.name : n.id === 'chat' ? say('projects.voice.mode.out') : NAMES[n.id]}</title>
              <rect x={p.x} y={p.y} width={W} height={boxH} className={`voice-band__box ${n.kind === 'input' ? 'is-input' : ''}`.trim()} />
              <text x={p.x + 12} y={p.y + boxH / 2 + 5} className="voice-band__name">
                {n.name ?? n.id}
              </text>
              {at.length > 0 && (
                <text x={p.x + W - 10} y={p.y + boxH / 2 + 5} textAnchor="end" className="voice-band__num">
                  {st === 'done' && !isOpen && t === 1 ? '✓' : at.map((x) => x.i + 1).join(' · ')}
                </text>
              )}
              {on && early > 0 && (
                <text x={p.x} y={p.y + boxH + 16} className="voice-band__caption" style={{ opacity: early }}>
                  {st ? STATE_WORDS[st]() : n.id === 'chat' ? say('projects.voice.mode.out') : ''}
                </text>
              )}
            </g>
          )
        })}
        {/* the approach: a fork where the routes leave the models box */}
        {early > 0 && (
          <g className="voice-band__fork" style={{ opacity: early }}>
            <polygon points={`${sx(72)},146 ${sx(82)},156 ${sx(72)},166 ${sx(62)},156`} />
            <text x={sx(90)} y={161}>
              {`◇ ${APPROACH_WORDS[facts.approach]().name}`}
            </text>
          </g>
        )}
      </svg>
    </figure>
  )
}

const GB = (bytes: number) => (bytes / 2 ** 30).toFixed(1)

/** The decisions under the schematic: the approach as a fork of four, then the ones its route has. */
export function VoiceDecisions({ project }: { project: Project }) {
  const facts = project.voice!
  const c = useVoiceChoices()
  const { status } = useHelperState()
  const memory = status?.memoryGB ?? 16
  const training = c.approach !== 'modelfile'
  const preferFromVoice = c.approach === 'prefer' && c.preferFrom === 'voice'
  const needsText = c.approach === 'imitate' || c.approach === 'blend' || preferFromVoice
  const pick = (a: Approach) => {
    chooseVoice('approach', a)
    startGuide(project.id, 1, 'data', true)
  }

  return (
    <section className="voice-decisions" aria-label={say('projects.voice.decisions')}>
      <div className="voice-fork" data-box="models" role="radiogroup" aria-label={say('projects.voice.decision.approach')}>
        <h3 className="label voice-decision__q">{`◇ ${say('projects.voice.decision.approach')}`}</h3>
        <PackedOptions>
          {APPROACHES.map((a) => {
            const w = APPROACH_WORDS[a]()
            return (
            <button key={a} type="button" role="radio" aria-checked={c.approach === a} className={`voice-option ${c.approach === a ? 'is-on' : ''}`.trim()} onClick={() => pick(a)}>
              <span className="voice-option__name">{`${c.approach === a ? '●' : '○'} ${w.name}`}</span>
              <span className="label label--muted">{w.tab}</span>
              <dl className="voice-option__costs">
                <dt>{say('projects.voice.cost.time')}</dt>
                <dd>{w.time}</dd>
                <dt>{say('projects.voice.cost.disk')}</dt>
                <dd>{w.disk}</dd>
                <dt>{say('projects.voice.cost.needs')}</dt>
                <dd>{w.needs}</dd>
                <dt>{say('projects.voice.cost.changes')}</dt>
                <dd>{w.changes}</dd>
              </dl>
            </button>
            )
          })}
        </PackedOptions>
      </div>

      <PackedOptions className="voice-subs">
        <Decision box="models" q={say('projects.voice.decision.base')}>
          {training
            ? HF_BASES.map((b) => {
                const big = b.params === '1.7B'
                return (
                  <Choice key={b.id} on={c.trainBase === b.id} onPick={() => chooseVoice('trainBase', b.id)} name={b.params === '360M' ? 'SmolLM2-360M' : 'SmolLM2-1.7B'}>
                    {big ? say('projects.voice.base.large', { memory }) : say('projects.voice.base.small')}
                    {big && memory < 16 && <span className="voice-choice__warn">{` ${say('projects.voice.base.tooBig', { memory })}`}</span>}
                  </Choice>
                )
              })
            : [...new Set(['smollm2:360m', 'qwen3:4b', ...facts.ollama.map((m) => m.name)])].map((name) => {
                const m = facts.ollama.find((x) => x.name === name || x.name === `${name}:latest`)
                const gb = m ? Number(GB(m.size)) : name === 'qwen3:4b' ? 2.5 : name === 'smollm2:360m' ? 0.7 : 0
                return (
                  <Choice key={name} on={c.modelfileBase === name} onPick={() => chooseVoice('modelfileBase', name)} name={name}>
                    {m ? say('projects.voice.base.here', { gb }) : say('projects.voice.base.pull', { gb })}
                    {gb * 2 > memory && <span className="voice-choice__warn">{` ${say('projects.voice.base.tooBig', { memory })}`}</span>}
                  </Choice>
                )
              })}
        </Decision>

        {c.approach === 'prefer' && (
          <Decision box="prefer" q={say('projects.voice.decision.from')}>
            <Choice on={c.preferFrom === 'base'} onPick={() => chooseVoice('preferFrom', 'base')} name={say('projects.voice.from.base')}>
              {say('projects.voice.from.base.about')}
            </Choice>
            <Choice on={c.preferFrom === 'voice'} onPick={() => chooseVoice('preferFrom', 'voice')} name={say('projects.voice.from.voice')}>
              {say('projects.voice.from.voice.about')}
            </Choice>
          </Decision>
        )}

        {needsText && (
          <Decision box="words" q={say('projects.voice.decision.texts')} many>
            {facts.texts.length === 0 && <p className="label label--muted">{say('projects.voice.texts.none')}</p>}
            {facts.texts.map((t) => (
              <Choice key={t.id} many on={c.texts.includes(t.id)} onPick={() => toggleText(t.id)} name={t.id}>
                {t.id.startsWith('uploads/') ? say('projects.voice.texts.yours') : say('projects.voice.texts.book', { source: t.source ?? 'raw' })}
              </Choice>
            ))}
            <p className="label label--muted">{say('projects.voice.texts.more')}</p>
          </Decision>
        )}

        {needsText && (
          <Decision box="data" q={say('projects.voice.decision.rows')}>
            <Choice on={c.rows === 'draft'} onPick={() => chooseVoice('rows', 'draft')} name={say('projects.voice.rows.draft')}>
              {say('projects.voice.rows.draft.about')}
            </Choice>
            <Choice on={c.rows === 'corrections'} onPick={() => chooseVoice('rows', 'corrections')} name={say('projects.voice.rows.corrections')}>
              {say('projects.voice.rows.corrections.about')}
            </Choice>
          </Decision>
        )}
      </PackedOptions>
    </section>
  )
}

/** A decision; `box` is the Start map box it changes, lit on the schematic while the decision is in view. */
export function Decision({ q, many, box, children }: { q: string; many?: boolean; box: string; children: React.ReactNode }) {
  return (
    <div className="voice-decision" data-box={box} role={many ? 'group' : 'radiogroup'} aria-label={q}>
      <h3 className="label voice-decision__q">{`◇ ${q}`}</h3>
      {children}
    </div>
  )
}

/** A choice in a decision; `off` says why it can't be chosen yet (not built), and it shows but does nothing. */
export function Choice({ on, onPick, name, many, off, children }: { on: boolean; onPick: () => void; name: string; many?: boolean; off?: string; children: React.ReactNode }) {
  return (
    <button type="button" role={many ? 'checkbox' : 'radio'} aria-checked={on} aria-disabled={!!off || undefined} title={off} className={`voice-choice ${on ? 'is-on' : ''} ${off ? 'is-off' : ''}`.trim()} onClick={() => !off && onPick()}>
      <span className="voice-choice__mark">{many ? (on ? '■' : '□') : on ? '●' : '○'}</span>
      <span className="voice-choice__name">{name}</span>
      <span className="voice-choice__what">{children}</span>
    </button>
  )
}

/** The open step: its name, what it has made, and its commands, over the tab it uses. */
export function VoiceStep({ step, n }: { step: Step; n: number }) {
  const [busy, setBusy] = useState('')
  const run = async (line: string) => {
    setBusy(line)
    await runCommand(line)
    setBusy('')
  }
  return (
    <div className="voice-step" data-box={step.node}>
      <h2 className="label project-open">{say('projects.mode.open', { n, name: step.name })}</h2>
      {step.result && <span className="label label--muted">{step.result}</span>}
      {step.link && (
        <a className="text-link" href={step.link.path.startsWith('#') ? step.link.path : `/api/workspace/file?path=${encodeURIComponent(step.link.path)}`} target="_blank" rel="noreferrer">
          {step.link.label}
        </a>
      )}
      {step.show && (
        <div className="voice-step__show">
          {step.show.map((p) => (
            <figure key={p.path}>
              <img src={`/api/workspace/file?path=${encodeURIComponent(p.path)}`} alt={p.label} />
              <figcaption className="label label--muted">{p.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {step.soon ? (
        <span className="label label--muted">{say('projects.latent.notBuilt')}</span>
      ) : step.commands.length > 0 ? (
        <div className="voice-step__commands">
          {step.commands.map((c) => (
            <CommandPreview key={c} command={c} onRun={() => void run(c)} disabled={c.includes('<') || !!busy} running={busy === c} label={say('projects.step.run')} />
          ))}
          {/* the wait, while it lasts: the spiral turns; the terminal below has the command's own lines */}
          {busy && <Loading label={say('projects.step.running', { command: busy })} about={step.about} />}
        </div>
      ) : (
        <span className="label label--muted">{say('projects.voice.mode.inTab')}</span>
      )}
    </div>
  )
}

/** FULL / ZOOM, for the header: the folded schematic shows the whole route, or zooms in on the step in view. */
export function ZoomToggle({ whole, onToggle, titles }: { whole: boolean; onToggle: () => void; titles?: { full: string; zoom: string } }) {
  const t = titles ?? { full: say('projects.voice.mode.fullTitle'), zoom: say('projects.voice.mode.zoomTitle') }
  return (
    <button type="button" className="voice-band__zoom text-button" onClick={onToggle} title={whole ? t.zoom : t.full}>
      {/* the hand-drawn triangle as a disclosure: ▶ while zoomed in, turning to ▼ when the whole route shows */}
      <Icon name="triangle-a" direction="r90" size={0.7} className={`voice-band__toggle ${whole ? 'is-whole' : ''}`.trim()} />
      {whole ? say('projects.voice.mode.zoom') : say('projects.voice.mode.full')}
    </button>
  )
}
