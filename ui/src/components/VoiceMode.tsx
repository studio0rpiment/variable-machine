import { useEffect, useRef, useState } from 'react'
import { HF_BASES } from '@shared/library'
import { NODES, WIRES, W, H } from './FlowMap'
import CommandPreview from './CommandPreview'
import { runCommand } from '../lib/helper'
import { useHelperState } from '../hooks/useHelper'
import { startGuide } from '../lib/guide'
import { APPROACHES, chooseVoice, toggleText, useVoiceChoices, type Approach } from '../lib/voiceChoices'
import { say } from '../text/say'
import type { Project, Step, VoiceFacts } from './ProjectsPanel'

/**
 * Project mode for a character's voice. The schematic is the Start map's top
 * band, every box where the Start map has it: the route the decisions draw is
 * lit, numbered step by step, and every other box stays as a faint outline, so
 * the student sees where the project sits in all of Variable Machine. Once the
 * page scrolls, the map folds into a strip of the route's boxes, as flat as they go. Under it,
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

export default function VoiceMode({ project, step }: { project: Project; step: number }) {
  const facts = project.voice!
  const [folded, setFolded] = useState(false)
  const self = useRef<HTMLDivElement>(null)
  // fold into a line once most of the map has scrolled away; the line takes no room, so nothing under it moves
  useEffect(() => {
    const main = self.current?.closest('.shell__main')
    if (!main) return
    const onScroll = () => setFolded(main.scrollTop > (self.current?.querySelector('.voice-band')?.clientHeight ?? 200) * 0.6)
    onScroll()
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [])
  const go = (n: number) => startGuide(project.id, n, facts.steps[n - 1].tab, true)

  return (
    <>
      {/* a direct child of the scrolling page, so it stays at the top as the rest scrolls */}
      <div className="voice-mode__line" aria-hidden={!folded}>
        {folded && <RouteStrip facts={facts} open={step} go={go} />}
      </div>
      <div ref={self} className={`voice-mode ${folded ? 'is-folded' : ''}`.trim()}>
        <StartBand project={project} facts={facts} open={step} go={go} />
      </div>
    </>
  )
}

/** Sizes of the folded strip, in px of its viewBox (the svg is sized in rem at 1px = 1/16 rem). */
const S = { w: 104, h: 26, gap: 30, row: 36, pad: 4 }
const INPUTS = ['words', 'models']

/**
 * The route folded, for while the page is scrolled: the same boxes, as flat as
 * they go. The inputs the route starts from (your words, a base model) sit one
 * above the other at the left; every other box on the route sits on one line
 * between them, in the order the route reaches it. A wire that runs forward to
 * the next box is straight; one that skips a box or runs back arcs round. The
 * box of the open step is green; a click opens a box's step.
 */
function RouteStrip({ facts, open, go }: { facts: VoiceFacts; open: number; go: (n: number) => void }) {
  const lit = litWires(facts)
  const inputs = INPUTS.filter((id) => lit.some(([a]) => a === id) || facts.steps.some((st) => st.node === id))
  const two = inputs.length === 2
  // the line: every box the route reaches, in the order the wires reach it; a lone input leads it
  const line: string[] = two ? [] : [...inputs]
  for (const id of [...lit.flat(), ...facts.steps.map((st) => st.node ?? '')]) if (id && !line.includes(id) && !(two && INPUTS.includes(id))) line.push(id)
  const left = two ? S.w + S.gap : 0
  const midY = two ? S.row : 0
  const at: Record<string, { x: number; y: number }> = {}
  line.forEach((id, i) => (at[id] = { x: left + i * (S.w + S.gap), y: midY }))
  if (two) {
    at.words = { x: 0, y: 0 }
    at.models = { x: 0, y: 2 * S.row }
  }
  const vw = left + line.length * (S.w + S.gap) - S.gap
  // wires that arc round the line, each a level further out so none lie on another
  const isArc = (a: string, b: string) => !!at[a] && !!at[b] && !(two && INPUTS.includes(a)) && !(at[b].y === at[a].y && at[b].x === at[a].x + S.w + S.gap)
  const backs = lit.filter(([a, b]) => isArc(a, b) && at[b].x < at[a].x)
  const skips = lit.filter(([a, b]) => isArc(a, b) && at[b].x > at[a].x)
  const level = (k: number) => 7 + 6 * k
  const over = two ? 0 : backs.length ? level(backs.length - 1) : 0
  const under = two ? 0 : skips.length ? level(skips.length - 1) : 0
  const vh = (two ? 2 * S.row : 0) + S.h
  const top = -S.pad - over
  const height = vh + 2 * S.pad + over + under

  const path = (a: string, b: string) => {
    const A = at[a]
    const B = at[b]
    if (!A || !B) return ''
    const midA = A.y + S.h / 2
    const midB = B.y + S.h / 2
    // from an input to the line: right of the input, then up or down to the box's middle, then in
    if (two && INPUTS.includes(a)) {
      const x = A.x + S.w
      const turn = B.x === left ? x + S.gap / 2 : B.x + S.w / 2
      return B.x === left ? `M${x},${midA} H${turn} V${midB} H${B.x}` : `M${x},${midA} H${turn} V${a === 'words' ? B.y : B.y + S.h}`
    }
    if (A.y === B.y && B.x === A.x + S.w + S.gap) return `M${A.x + S.w},${midA} H${B.x}`
    // round the line: a step back arcs over the top, a skip forward under the bottom
    const back = B.x < A.x
    const k = (back ? backs : skips).findIndex(([x, z]) => x === a && z === b)
    const y = back ? A.y - level(k) : A.y + S.h + level(k)
    const from = A.x + S.w / 2 + (back ? -10 : 10)
    const to = B.x + S.w / 2 + (back ? 10 : -10)
    return `M${from},${back ? A.y : A.y + S.h} V${y} H${to} V${back ? B.y : B.y + S.h}`
  }

  const stepsAt = (id: string) => facts.steps.map((st, i) => ({ st, i })).filter((x) => x.st.node === id)
  return (
    <nav className="route-strip" aria-label={say('projects.voice.mode.line')}>
      <svg viewBox={`${-S.pad} ${top} ${vw + 2 * S.pad} ${height}`} style={{ width: `${(vw + 2 * S.pad) / 16}rem`, height: `${height / 16}rem` }} className="route-strip__svg">
        <defs>
          <marker id="strip-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="voice-band__tip" />
          </marker>
        </defs>
        {lit.map(([a, b]) => (
          <path key={`${a}-${b}`} d={path(a, b)} className="route-strip__wire" markerEnd="url(#strip-end)" />
        ))}
        {Object.entries(at).map(([id, p]) => {
          const steps = stepsAt(id)
          const states = steps.map((x) => stateOf(facts.steps, x.i))
          const st: State | null = !steps.length ? null : states.includes('now') ? 'now' : states.every((x) => x === 'done') ? 'done' : 'waiting'
          const isOpen = steps.some((x) => x.i + 1 === open)
          const target = steps.find((x) => !x.st.done) ?? steps[0]
          return (
            <g
              key={id}
              className={`route-strip__node ${st ? `is-${st}` : ''} ${isOpen ? 'is-open' : ''} ${target ? 'is-step' : ''}`.trim()}
              role={target ? 'button' : undefined}
              tabIndex={target ? 0 : undefined}
              aria-current={isOpen ? 'step' : undefined}
              aria-label={target ? `${steps.map((x) => x.i + 1).join(', ')} ${target.st.name}` : NAMES[id]}
              onClick={() => target && go(target.i + 1)}
              onKeyDown={(e) => target && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go(target.i + 1))}
            >
              <title>{target ? target.st.name : id === 'chat' ? say('projects.voice.mode.out') : NAMES[id]}</title>
              <rect x={p.x} y={p.y} width={S.w} height={S.h} className="route-strip__box" />
              <text x={p.x + 8} y={p.y + S.h / 2 + 4} className="route-strip__name">
                {NAMES[id] ?? id}
              </text>
              {steps.length > 0 && (
                <text x={p.x + S.w - 7} y={p.y + S.h / 2 + 4} textAnchor="end" className="route-strip__num">
                  {st === 'done' && !isOpen ? '✓' : steps.map((x) => x.i + 1).join('·')}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </nav>
  )
}

/** The wires the route lights: a route that trains a voice first (prefer on your trained voice) lights the imitate wires too. */
const litWires = (facts: VoiceFacts) =>
  facts.approach === 'prefer' && facts.steps.some((st) => st.node === 'words') ? [...LIT.imitate, ...LIT.prefer] : LIT[facts.approach]

/** The Start map's top band, with the route lit and numbered. */
function StartBand({ project, facts, open, go }: { project: Project; facts: VoiceFacts; open: number; go: (n: number) => void }) {
  // a route that trains a voice first (prefer on your trained voice) lights the imitate wires too
  const lit = litWires(facts)
  const onRoute = new Set(facts.steps.map((s) => s.node).concat(lit.flat()))
  const stepsAt = (id: string) => facts.steps.map((s, i) => ({ s, i })).filter((x) => x.s.node === id)
  const nodeState = (id: string): State | null => {
    const at = stepsAt(id)
    if (!at.length) return null
    const states = at.map((x) => stateOf(facts.steps, x.i))
    return states.includes('now') ? 'now' : states.every((x) => x === 'done') ? 'done' : 'waiting'
  }
  const isLit = (from: string, to: string) => lit.some(([a, b]) => a === from && b === to)

  return (
    <figure className="voice-band" aria-label={say('projects.schematic.label', { project: project.title })}>
      <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="voice-band__svg">
        <defs>
          <marker id="voice-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="voice-band__tip" />
          </marker>
        </defs>
        {WIRES.filter((w) => BAND.has(w.from) && BAND.has(w.to)).map((w) => {
          const on = isLit(w.from, w.to)
          return (
            <g key={`${w.from}-${w.to}-${w.label}`} className={`voice-band__wire ${on ? 'is-lit' : ''}`.trim()}>
              <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#voice-end)" />
              {on && (
                <text x={w.at[0]} y={w.at[1]} textAnchor={w.anchor ?? 'start'} className="voice-band__label">
                  {w.label}
                </text>
              )}
            </g>
          )
        })}
        {NODES.filter((n) => BAND.has(n.id)).map((n) => {
          const at = stepsAt(n.id)
          const st = nodeState(n.id)
          const on = onRoute.has(n.id)
          const isOpen = at.some((x) => x.i + 1 === open)
          const target = at.find((x) => !x.s.done) ?? at[0]
          return (
            <g
              key={n.id}
              className={`voice-band__node ${on ? 'is-on' : ''} ${st ? `is-${st}` : ''} ${isOpen ? 'is-open' : ''} ${target ? 'is-step' : ''}`.trim()}
              role={target ? 'button' : undefined}
              tabIndex={target ? 0 : undefined}
              aria-label={target ? `${at.map((x) => x.i + 1).join(', ')} ${target.s.name}` : undefined}
              onClick={() => target && go(target.i + 1)}
              onKeyDown={(e) => target && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go(target.i + 1))}
            >
              <rect x={n.x} y={n.y} width={W} height={H} className={`voice-band__box ${n.kind === 'input' ? 'is-input' : ''}`.trim()} />
              <text x={n.x + 12} y={n.y + H / 2 + 5} className="voice-band__name">
                {n.name ?? n.id}
              </text>
              {at.length > 0 && (
                <text x={n.x + W - 10} y={n.y + H / 2 + 5} textAnchor="end" className="voice-band__num">
                  {at.map((x) => x.i + 1).join(' · ')}
                </text>
              )}
              {on && (
                <text x={n.x} y={n.y + H + 16} className="voice-band__caption">
                  {st ? STATE_WORDS[st]() : n.id === 'chat' ? say('projects.voice.mode.out') : ''}
                </text>
              )}
            </g>
          )
        })}
        {/* the approach: a fork where the routes leave the models box */}
        <g className="voice-band__fork">
          <polygon points="72,146 82,156 72,166 62,156" />
          <text x={90} y={161}>
            {`◇ ${APPROACH_WORDS[facts.approach]().name}`}
          </text>
        </g>
      </svg>
    </figure>
  )
}

// ---- the decisions ----

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
      <div className="voice-fork" role="radiogroup" aria-label={say('projects.voice.decision.approach')}>
        <h3 className="label voice-decision__q">{`◇ ${say('projects.voice.decision.approach')}`}</h3>
        <div className="voice-fork__options">
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
        </div>
      </div>

      <div className="voice-subs">
        <Decision q={say('projects.voice.decision.base')}>
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
          <Decision q={say('projects.voice.decision.from')}>
            <Choice on={c.preferFrom === 'base'} onPick={() => chooseVoice('preferFrom', 'base')} name={say('projects.voice.from.base')}>
              {say('projects.voice.from.base.about')}
            </Choice>
            <Choice on={c.preferFrom === 'voice'} onPick={() => chooseVoice('preferFrom', 'voice')} name={say('projects.voice.from.voice')}>
              {say('projects.voice.from.voice.about')}
            </Choice>
          </Decision>
        )}

        {needsText && (
          <Decision q={say('projects.voice.decision.texts')} many>
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
          <Decision q={say('projects.voice.decision.rows')}>
            <Choice on={c.rows === 'draft'} onPick={() => chooseVoice('rows', 'draft')} name={say('projects.voice.rows.draft')}>
              {say('projects.voice.rows.draft.about')}
            </Choice>
            <Choice on={c.rows === 'corrections'} onPick={() => chooseVoice('rows', 'corrections')} name={say('projects.voice.rows.corrections')}>
              {say('projects.voice.rows.corrections.about')}
            </Choice>
          </Decision>
        )}
      </div>
    </section>
  )
}

function Decision({ q, many, children }: { q: string; many?: boolean; children: React.ReactNode }) {
  return (
    <div className="voice-decision" role={many ? 'group' : 'radiogroup'} aria-label={q}>
      <h3 className="label voice-decision__q">{`◇ ${q}`}</h3>
      {children}
    </div>
  )
}

function Choice({ on, onPick, name, many, children }: { on: boolean; onPick: () => void; name: string; many?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" role={many ? 'checkbox' : 'radio'} aria-checked={on} className={`voice-choice ${on ? 'is-on' : ''}`.trim()} onClick={onPick}>
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
    <div className="voice-step">
      <h2 className="label project-open">{say('projects.mode.open', { n, name: step.name })}</h2>
      {step.result && <span className="label label--muted">{step.result}</span>}
      {step.commands.length > 0 ? (
        <div className="voice-step__commands">
          {step.commands.map((c) => (
            <CommandPreview key={c} command={c} onRun={() => void run(c)} disabled={c.includes('<') || !!busy} running={busy === c} label={say('projects.step.run')} />
          ))}
        </div>
      ) : (
        <span className="label label--muted">{say('projects.voice.mode.inTab')}</span>
      )}
    </div>
  )
}
