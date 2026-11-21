import { useEffect, useRef, useState } from 'react'
import { NODES, WIRES, W, H, stretchWire } from './FlowMap'
import { MAX_PX, mapWidth, stripZoom } from '../lib/mapWidth'
import { Choice, Decision, useGlide } from './VoiceMode'
import { useHelperState } from '../hooks/useHelper'
import { useRoutePage } from '../lib/routePage'
import { chooseDream, chooseSet, EMBEDDERS, LIBRARY, QUALITIES, qualityLabel, READER_BASES, toggleText, useDreamChoices, WRITERS, type LibraryText } from '../lib/dreamChoices'
import { say } from '../text/say'
import type { Project, Step } from './ProjectsPanel'

/**
 * Project mode for the dream reading. Its schematic is the Start map, opened
 * up, as the research bot's is: the project opens on the Start map, the dream
 * reading's route lit (your photos → ready-made models → used as they are),
 * and in about a second it unfolds. Your photos become the cards and the deck;
 * your words become the guide texts; MODELS opens into the five models it can
 * use, each a choice; the deck and the guide texts meet in the interpretation,
 * which the variations are drawn from, and the room shows both. As the page
 * scrolls the schematic folds, a px of height per px scrolled, into a strip of
 * two rows that stays at the top.
 */

type P = [number, number]
interface Box {
  name: string
  /** where the Start map has it; a box opened out of another has none */
  a?: P
  /** where the dream's schematic has it */
  b: P
  /** where the folded strip has it */
  s: P
  from?: string
  kind?: 'input' | 'model'
  head?: string
  role?: string
  caption?: string
}

const VIEW = { x: 30, y: 30, w: 1170, h: 540 }
const F = { h: 30, row1: 38, row2: 82, row3: 126, height: 90 }
/** the trained card's strip has a third row, for the training lane */
const stripH = (trained: boolean) => (trained ? 134 : F.height)
/** The strip's window on a laptop, in the map's units, and how close in it goes on a narrow screen (as Make Your Own's: lib/mapWidth). */
const STRIP_ZOOM = { base: 820, min: 520 }
const at = (id: string): P => {
  const n = NODES.find((x) => x.id === id)!
  return [n.x, n.y]
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

/** The Start map's boxes in view that the dream reading doesn't use: they fade as it unfolds. The trained reader uses data, train, adapters and share. */
const OFF = ['modelfile', 'data', 'train', 'prefer', 'merge', 'adapters', 'chat', 'share', 'reading-list', 'papers', 'pictures', 'made-images']
const TRAINED_USES = ['data', 'train', 'adapters', 'share']
/** The Start map's names for the boxes the dream's own boxes start from. */
const START: Record<string, string> = { photos: 'cards', words: 'texts', segmentation: 'room' }

function boxes(trained: boolean): Record<string, Box> {
  const B: Record<string, Box> = {
    models: { name: 'models', a: at('models'), b: [60, 60], s: [520, F.row2], head: say('projects.dream.box.headModels') },
    siglip: { name: 'siglip', from: 'models', b: [280, 120], s: [520, F.row2], kind: 'model', role: say('projects.dream.box.roleSiglip') },
    embed: { name: '', from: 'models', b: [280, 505], s: [520, F.row2], kind: 'model', role: say('projects.dream.box.roleEmbed') },
    writer: { name: '', from: 'models', b: [520, 60], s: [520, F.row2], kind: 'model', role: say('projects.dream.box.roleWriter') },
    kandinsky: { name: 'kandinsky', from: 'models', b: [760, 60], s: [520, F.row2], kind: 'model', role: say('projects.dream.box.roleKandinsky') },
    // in the trained card the prior sits beside Kandinsky and feeds it, so the style and the drawings have the space under it
    prior: { name: 'kandinsky-prior', from: 'models', b: trained ? [1000, 60] : [930, 130], s: [520, F.row2], kind: 'model', role: say('projects.dream.box.rolePrior') },
    cards: { name: say('projects.dream.box.cards'), a: at('photos'), b: [60, 260], s: [60, F.row1], kind: 'input', caption: say('projects.dream.box.capCards') },
    deck: { name: say('projects.dream.box.deck'), from: 'cards', b: [280, 260], s: [280, F.row1], caption: say('projects.dream.box.capDeck') },
    texts: { name: say('projects.dream.box.texts'), a: at('words'), b: [60, 420], s: [60, F.row2], kind: 'input', caption: say('projects.dream.box.capTexts') },
    guide: { name: say('projects.dream.box.guide'), from: 'texts', b: [280, 420], s: [280, F.row2], caption: say('projects.dream.box.capGuide') },
    interpret: { name: say('projects.dream.box.interpret'), from: 'cards', b: [520, 340], s: [520, F.row1], caption: say('projects.dream.box.capInterpret') },
    draw: { name: say('projects.dream.box.draw'), from: 'cards', b: [760, 340], s: [760, F.row1], caption: say('projects.dream.box.capDraw') },
    room: { name: say('projects.dream.box.room'), a: at('segmentation'), b: [1000, 340], s: [1000, F.row1], caption: say('projects.dream.box.capRoom') },
  }
  if (trained) {
    B.writer.role = say('projects.dreamTrained.box.roleTeacher')
    Object.assign(B, {
      rows: { name: say('projects.dreamTrained.box.rows'), a: at('data'), b: [520, 470], s: [280, F.row3], caption: say('projects.dreamTrained.box.capRows') },
      train: { name: 'train', a: at('train'), b: [690, 470], s: [460, F.row3], caption: say('projects.dreamTrained.box.capTrain') },
      adapters: { name: 'export', a: at('adapters'), b: [860, 470], s: [640, F.row3], caption: say('projects.dreamTrained.box.capExport') },
      share: { name: 'package', a: at('share'), b: [1040, 470], s: [820, F.row3], caption: say('projects.dreamTrained.box.capShare') },
      drawings: { name: say('projects.dreamTrained.box.drawings'), from: 'cards', b: [1000, 200], s: [1000, F.row2], kind: 'input', caption: say('projects.dreamTrained.box.capDrawings') },
      style: { name: say('projects.dreamTrained.box.style'), from: 'cards', b: [760, 200], s: [760, F.row2], caption: say('projects.dreamTrained.box.capStyle') },
    } satisfies Record<string, Box>)
  }
  for (const id of OFF) {
    if (trained && TRAINED_USES.includes(id)) continue
    const [x, y] = at(id)
    B[id] = { name: NODES.find((n) => n.id === id)!.name ?? id, a: [x, y], b: [x, y], s: [x, y] }
  }
  return B
}

/** The boxes a click on a model takes to: the decision that chooses it. */
const DECIDED_AT: Record<string, string> = { siglip: 'models', embed: 'models', writer: 'models', kandinsky: 'models', prior: 'models' }

type State = 'done' | 'now' | 'waiting'
const stateOf = (steps: Step[], i: number): State => {
  const now = steps.findIndex((s) => !s.done)
  return steps[i].done ? 'done' : i === now ? 'now' : 'waiting'
}

/** The schematic over the dream reading's page: unfolds when opened, folds into the strip as the page scrolls. */
export default function DreamMode({ project, step, onStep, whole, onZoom }: { project: Project; step: number; onStep: (n: number) => void; whole: boolean; onZoom: () => void }) {
  const facts = project.dream!
  const c = useDreamChoices()
  const trained = !!facts.trained
  const on = new Set([
    'models', 'siglip', 'embed', 'kandinsky', 'cards', 'deck', 'texts', 'guide', 'interpret', 'draw', 'room',
    ...(trained || c.writer !== 'none' ? ['writer'] : []),
    ...(c.drawWith === 'prior' || c.cards === 'demo' ? ['prior'] : []),
    ...(trained ? ['rows', 'train', 'adapters', 'share', ...(c.style === 'drawings' ? ['drawings', 'style'] : [])] : []),
  ])
  const pxRef = useRef(MAX_PX)
  const { space, self, scroll, focus, stepNow, width, pick } = useRoutePage({ step, project: project.id, onStep, stripPx: () => (stripH(trained) * pxRef.current) / stripZoom(pxRef.current, STRIP_ZOOM.base, STRIP_ZOOM.min), line: 'voice-mode__line' })
  const [u, setU] = useState(0)
  const [played, setPlayed] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const k = clamp((time - start - 250) / 1400)
      setU(k)
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [played])

  const B = boxes(trained)
  const lightId = focus && on.has(focus) ? focus : facts.steps[stepNow - 1]?.node
  const lit = lightId ? B[lightId] : undefined
  // the map runs the window's whole width; wider than MAX_PX, its boxes keep their size and its wires get longer (lib/mapWidth)
  const px = width || MAX_PX
  const { w: VW, zoom, sx } = mapWidth(px, VIEW.w, STRIP_ZOOM)
  const zoomX = Math.min(VIEW.x + VW - zoom, Math.max(VIEW.x, (lit ? sx(lit.s[0]) + W / 2 : VIEW.x) - zoom / 2))
  const zx = useGlide(whole ? VIEW.x : zoomX)
  const zw = useGlide(whole ? VW : zoom)
  pxRef.current = px
  const open = (VIEW.h * px) / VW
  const FH = stripH(trained)
  const want = Math.max((FH * px) / zw, open - scroll)
  const f = clamp((want * VW - px * VIEW.h) / (px * (FH - VIEW.h) - want * (zw - VW)))
  const v = { x: lerp(VIEW.x, zx, f), w: lerp(VW, zw, f), h: lerp(VIEW.h, FH, f) }

  return (
    <>
      <div className="voice-mode__line">
        <div ref={self} className="voice-band__frame">
          <Schematic project={project} B={B} on={on} u={u} f={f} view={v} sx={sx} light={lightId} pick={(box) => { if (whole) onZoom(); pick(DECIDED_AT[box] ?? box) }} />
          {f < 0.5 && u === 1 && (
            <button type="button" className="text-button research-band__replay" onClick={() => setPlayed((n) => n + 1)} style={{ opacity: 1 - f * 2 }}>
              {say('projects.research.mode.replay')}
            </button>
          )}
        </div>
      </div>
      <div ref={space} className="voice-mode" style={{ height: `${open / 16}rem` }} />
    </>
  )
}

function Schematic({ project, B, on, u, f, view, sx, light, pick }: { project: Project; B: Record<string, Box>; on: Set<string>; u: number; f: number; view: { x: number; w: number; h: number }; sx: (x: number) => number; light?: string; pick: (box: string) => void }) {
  const c = useDreamChoices()
  const steps = project.dream!.steps
  const trained = !!project.dream!.trained
  const kA = ease(clamp(u / 0.45))
  const kB = ease(clamp((u - 0.4) / 0.6))
  const fold = ease(f)
  const boxH = lerp(H, F.h, f)
  // a point as drawn, on the wider map
  const X = (p: P): P => [sx(p[0]), p[1]]
  const pos = (id: string): P => {
    const b = B[id]
    const [a, bb, s] = [b.a && X(b.a), X(b.b), X(b.s)]
    let p: P
    if (b.from) {
      const q = pos(b.from)
      p = [lerp(q[0], bb[0], kB), lerp(q[1], bb[1], kB)]
    } else if (!on.has(id)) p = a ?? bb
    else p = [lerp(a![0], bb[0], kA), lerp(a![1], bb[1], kA)]
    if (b.kind === 'model') return [lerp(p[0], pos(b.from!)[0], fold), lerp(p[1], pos(b.from!)[1], fold)]
    return [lerp(p[0], s[0], fold), lerp(p[1], s[1], fold)]
  }
  const opacity = (id: string) => {
    const b = B[id]
    if (b.from) {
      const shown = clamp((u - 0.42) * 4)
      const folds = b.kind === 'model' ? 1 - clamp(f * 2) : 1
      return on.has(id) ? shown * folds : b.kind === 'model' ? shown * folds * 0.3 : 0
    }
    return on.has(id) ? 1 : lerp(0.22, 0, clamp(u / 0.35))
  }
  const early = clamp(1 - u * 3) * (1 - clamp(f * 3))
  const late = clamp((u - 0.7) * 3.3)
  const opened = late * (1 - clamp(f * 2))
  const R = (id: string): P => [pos(id)[0] + W, pos(id)[1] + boxH / 2]
  const L = (id: string): P => [pos(id)[0], pos(id)[1] + boxH / 2]
  const stepsAt = (id: string) => steps.map((s, i) => ({ s, i })).filter((x) => x.s.node === id)
  const nodeState = (id: string): State | null => {
    const at_ = stepsAt(id)
    if (!at_.length) return null
    const st = at_.map((x) => stateOf(steps, x.i))
    return st.includes('now') ? 'now' : st.every((x) => x === 'done') ? 'done' : 'waiting'
  }
  const line = (pts: P[], cls: string, o: number, key: string) => o > 0.01 && <polyline key={key} points={pts.map((p) => p.join(',')).join(' ')} className={cls} style={{ opacity: o }} markerEnd={cls.includes('use') ? undefined : 'url(#dream-end)'} />
  const modelName = (id: string) => (id === 'writer' ? (trained ? c.teacher : c.writer) : id === 'embed' ? c.embed : B[id].name)
  const elbow = (a: string, b: string, x: number): P[] => [R(a), [x, R(a)[1]], [x, L(b)[1]], L(b)]

  const wires = [
    line([R('cards'), L('deck')], 'voice-band__route', late, 'cards-deck'),
    line([R('texts'), L('guide')], 'voice-band__route', late, 'texts-guide'),
    line(elbow('deck', 'interpret', lerp(sx(475), sx(470), f)), 'voice-band__route', late, 'deck-interpret'),
    line(elbow('guide', 'interpret', sx(490)), 'voice-band__route', late, 'guide-interpret'),
    line([R('interpret'), L('draw')], 'voice-band__route', late, 'interpret-draw'),
    line([R('draw'), L('room')], 'voice-band__route', late, 'draw-room'),
  ]
  if (trained) {
    // the training lane: the readings become rows, the rows a model, the model reads again; the drawings become the style Kandinsky draws in
    wires.push(line([[pos('interpret')[0] + 75, pos('interpret')[1] + boxH], [pos('interpret')[0] + 75, pos('rows')[1]]], 'voice-band__route', late * (1 - clamp(f * 2)), 'interpret-rows'))
    wires.push(line([R('rows'), L('train')], 'voice-band__route', late, 'rows-train'))
    wires.push(line([R('train'), L('adapters')], 'voice-band__route', late, 'train-adapters'))
    wires.push(line([R('adapters'), L('share')], 'voice-band__route', late, 'adapters-share'))
    wires.push(line([[pos('adapters')[0] + 75, pos('adapters')[1]], [pos('adapters')[0] + 75, lerp(430, pos('interpret')[1] + boxH + 4, f)], [pos('interpret')[0] + 130, lerp(430, pos('interpret')[1] + boxH + 4, f)], [pos('interpret')[0] + 130, pos('interpret')[1] + boxH]], 'voice-band__route', late * (1 - clamp(f * 2)), 'reader-interpret'))
    if (on.has('style')) {
      wires.push(line([L('drawings'), R('style')], 'voice-band__route', late, 'drawings-style'))
      wires.push(line([[pos('style')[0] + 75, pos('style')[1] + boxH], [pos('style')[0] + 75, pos('draw')[1]]], 'voice-band__route', late * (1 - clamp(f * 2)), 'style-draw'))
    }
  }
  const uses: (readonly [string, string])[] = [['siglip', 'deck'], ['embed', 'guide'], ['writer', 'interpret'], [on.has('style') && trained ? 'kandinsky-style' : 'kandinsky', 'draw'], [trained ? 'prior-kandinsky' : 'prior', 'draw']]
  for (const [m0, to0] of uses) {
    // trained: Kandinsky draws through the style (its LoRA), and the prior feeds Kandinsky from the side
    const m = m0.replace(/-.*/, '')
    if (!on.has(m)) continue
    if (m0 === 'kandinsky-style') {
      wires.push(line([[pos('kandinsky')[0] + 40, pos('kandinsky')[1] + boxH], [pos('style')[0] + 40, pos('style')[1]]], 'voice-band__route research-band__use', opened, 'kandinsky-style'))
      continue
    }
    if (m0 === 'prior-kandinsky') {
      wires.push(line([L('prior'), R('kandinsky')], 'voice-band__route research-band__use', opened, 'prior-kandinsky'))
      continue
    }
    const to = to0
    const p = pos(m)
    // the passage finder sits under the passages, so its wire goes up
    const pts: P[] = m === 'embed' ? [[p[0] + 40, p[1]], [pos(to)[0] + 40, pos(to)[1] + boxH]] : [[p[0] + 40, p[1] + boxH], [pos(to)[0] + (m === 'prior' ? 100 : 40), pos(to)[1]]]
    wires.push(line(pts, 'voice-band__route research-band__use', opened, `${m}-${to}`))
  }

  return (
    <figure className="voice-band research-band" aria-label={say('projects.schematic.label', { project: project.title })}>
      <svg viewBox={`${view.x} ${VIEW.y} ${view.w} ${view.h}`} className="voice-band__svg">
        <defs>
          <marker id="dream-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="voice-band__tip" />
          </marker>
        </defs>
        {/* the Start map's own wires, the route's lit: your photos → ready-made models → used as they are; they go as it unfolds */}
        {early > 0 &&
          WIRES.filter((w) => B[START[w.from] ?? w.from] && B[START[w.to] ?? w.to]).map((w) => stretchWire(w, sx)).map((w) => {
            const lit = (w.from === 'photos' && w.to === 'made-images') || (w.from === 'made-images' && w.to === 'segmentation')
            return (
              <g key={`${w.from}-${w.to}-${w.label}`} className={`voice-band__wire ${lit ? 'is-lit' : ''}`.trim()} style={{ opacity: early }}>
                <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#dream-end)" />
                {lit && (
                  <text x={w.at[0]} y={w.at[1]} textAnchor={w.anchor ?? 'start'} className="voice-band__label">
                    {w.label}
                  </text>
                )}
              </g>
            )
          })}
        {wires}
        {opened > 0.01 && (
          <g style={{ opacity: opened }} className="research-band__lanes">
            <text x={sx(280)} y={52} className="research-band__lane">
              {say('projects.dream.box.laneModels')}
            </text>
            <text x={sx(280)} y={252} className="research-band__lane">
              {say('projects.dream.box.laneCards')}
            </text>
            <text x={sx(280)} y={412} className="research-band__lane">
              {say('projects.dream.box.laneTexts')}
            </text>
            {trained && (
              <text x={sx(690)} y={462} className="research-band__lane">
                {say('projects.dreamTrained.box.laneTrain')}
              </text>
            )}
          </g>
        )}
        {Object.entries(B).map(([id, b]) => {
          const o = opacity(id)
          if (o <= 0.01) return null
          const [x, y] = pos(id)
          const at_ = stepsAt(id)
          const st = nodeState(id)
          const isOn = on.has(id)
          const isLit = id === light
          const can = isOn && (at_.length > 0 || id in DECIDED_AT)
          const headness = b.head ? clamp((u - 0.5) * 3) * (1 - clamp(f * 2)) : 0
          const target = at_.find((x_) => !x_.s.done) ?? at_[0]
          return (
            <g
              key={id}
              className={`voice-band__node ${isOn ? 'is-on' : ''} ${st ? `is-${st}` : ''} ${isLit && headness < 0.5 ? 'is-open' : ''} ${can ? 'is-step' : ''} ${b.kind ? `research-band__${b.kind}` : ''}`.trim()}
              style={{ opacity: o }}
              role={can ? 'button' : undefined}
              tabIndex={can ? 0 : undefined}
              aria-label={target ? `${at_.map((x_) => x_.i + 1).join(', ')} ${target.s.name}` : can ? b.name || modelName(id) : undefined}
              onClick={() => can && pick(id)}
              onKeyDown={(e) => can && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(id))}
            >
              <title>{target ? target.s.name : (b.role ?? b.name)}</title>
              {headness > 0 && (
                <text x={x} y={y + boxH / 2 + 5} className={`research-band__lane ${isLit ? 'is-lit' : ''}`.trim()} style={{ opacity: headness }}>
                  {b.head}
                </text>
              )}
              <g style={{ opacity: 1 - headness }}>
                <rect x={x} y={y} width={W} height={boxH} className={`voice-band__box ${b.kind === 'input' ? 'is-input' : ''}`.trim()} />
                <text x={x + 12} y={y + boxH / 2 + 5} className="voice-band__name">
                  {b.kind === 'model' ? modelName(id) : b.name}
                </text>
              </g>
              {at_.length > 0 && (
                <text x={headness > 0.5 ? x + W + 44 : x + W - 10} y={y + boxH / 2 + 5} textAnchor="end" className="voice-band__num" style={headness > 0.5 ? { fill: 'var(--act)' } : undefined}>
                  {st === 'done' && f === 1 ? '✓' : at_.map((x_) => x_.i + 1).join('·')}
                </text>
              )}
              {(b.caption || b.role) && opened > 0.01 && isOn && (
                <text x={b.role ? x + W - 6 : x} y={y + boxH + 14} textAnchor={b.role ? 'end' : 'start'} className="voice-band__caption" style={{ opacity: opened }}>
                  {b.role ?? b.caption}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

const GB = (bytes: number) => (bytes / 2 ** 30).toFixed(1)
const SIZE: Record<string, number> = { 'qwen3:4b': 2.5, 'qwen3:1.7b': 1.4, 'nomic-embed-text': 0.3, 'mxbai-embed-large': 0.7 }

/** Each guide text from the library, in words: literal keys, so the build can check every one is used. */
const TEXT_ABOUT: Record<LibraryText, () => [string, string]> = {
  'zhougong-jiemeng': () => [say('projects.dream.text.zhougong'), say('projects.dream.text.zhougong.about')],
  'wangfu-menglie': () => [say('projects.dream.text.wangfu'), say('projects.dream.text.wangfu.about')],
  'liezi-zh': () => [say('projects.dream.text.lieziZh'), say('projects.dream.text.lieziZh.about')],
  'liezi-dreams': () => [say('projects.dream.text.liezi'), say('projects.dream.text.liezi.about')],
  zhuangzi: () => [say('projects.dream.text.zhuangzi'), say('projects.dream.text.zhuangzi.about')],
  'freud-dreams': () => [say('projects.dream.text.freud'), say('projects.dream.text.freud.about')],
  'jung-unconscious': () => [say('projects.dream.text.jung'), say('projects.dream.text.jung.about')],
  kuunmong: () => [say('projects.dream.text.kuunmong'), say('projects.dream.text.kuunmong.about')],
  'dream-incubation': () => [say('projects.dream.text.incubation'), say('projects.dream.text.incubation.about')],
}

/** The decisions under the schematic: the cards, the guide texts, the models, how the variations are drawn, and when. */
export function DreamDecisions({ project }: { project: Project }) {
  const facts = project.dream!
  const c = useDreamChoices()
  const { status } = useHelperState()
  const memory = status?.memoryGB ?? 16
  const size = (m: string) => {
    const here = facts.ollama.find((x) => x.name === m || x.name === `${m}:latest`)
    return here ? Number(GB(here.size)) : (SIZE[m] ?? 0)
  }
  const trained = !!facts.trained
  const modelRow = (role: 'writer' | 'embed' | 'teacher' | 'base', name: string, what: string, models: string[]) => (
    <div className="research-role">
      <span className="research-role__name">{name}</span>
      <span className="research-role__what">{what}</span>
      <span className="research-role__models">
        {models.map((m) => {
          const gb = size(m)
          const here = m === 'none' || role === 'base' || facts.ollama.some((x) => x.name === m || x.name === `${m}:latest`)
          return (
            <button key={m} type="button" role="radio" aria-checked={c[role] === m} className={`research-role__model ${c[role] === m ? 'is-on' : ''}`.trim()} onClick={() => chooseDream(role, m)} title={role === 'base' ? say('projects.dreamTrained.base.title', { base: m }) : m === 'none' ? say('projects.dream.writer.none') : here ? say('projects.voice.base.here', { gb }) : say('projects.voice.base.pull', { gb })}>
              {role === 'base' ? m.replace(/^.*\//, '').replace(/-Instruct$/, '') : m}
            </button>
          )
        })}
      </span>
    </div>
  )
  const setsBig = facts.sets.filter((s) => s.pictures >= 2 && !s.folder.startsWith(`${c.demo}-`))

  return (
    <section className="voice-decisions" aria-label={say('projects.dream.decisions')}>
      <div className="voice-subs">
        <Decision box="cards" q={say('projects.dream.decision.cards')}>
          <Choice on={c.cards === 'own'} onPick={() => chooseDream('cards', 'own')} name={say('projects.dream.cards.own')}>
            {say('projects.dream.cards.own.about')}
          </Choice>
          <Choice on={c.cards === 'demo'} onPick={() => chooseDream('cards', 'demo')} name={say('projects.dream.cards.demo')}>
            {say('projects.dream.cards.demo.about')}
          </Choice>
          {c.cards === 'own' && (
            <div className="dream-sets">
              {QUALITIES.map((q) => (
                <label key={q} className="dream-sets__row">
                  <span className="label">{qualityLabel(q, c)}</span>
                  <select value={c.sets[q]} onChange={(e) => chooseSet(q, e.target.value)}>
                    <option value="">{say('projects.dream.cards.pick')}</option>
                    {setsBig.map((s) => (
                      <option key={s.folder} value={s.folder}>{`${s.folder} (${s.pictures})`}</option>
                    ))}
                  </select>
                </label>
              ))}
              <p className="research-note">{say('projects.dream.cards.own.note')}</p>
            </div>
          )}
        </Decision>
        <Decision box="texts" q={say('projects.dream.decision.texts')} many>
          {LIBRARY.map((t) => {
            const [name, about] = TEXT_ABOUT[t]()
            return (
              <Choice key={t} many on={c.library.includes(t)} onPick={() => toggleText('library', t)} name={name}>
                {about}
                {!facts.raw.includes(t) && <span className="label label--muted">{` ${say('projects.dream.text.notIn')}`}</span>}
              </Choice>
            )
          })}
          {facts.uploads.map((u) => (
            <Choice key={u} many on={c.own.includes(u)} onPick={() => toggleText('own', u)} name={u.replace(/^uploads\//, '')}>
              {say('projects.dream.text.own')}
            </Choice>
          ))}
          <p className="research-note">{say('projects.dream.texts.note')}</p>
        </Decision>
      </div>

      <div className="voice-subs">
        <Decision box="models" q={say('projects.dream.decision.models')}>
          {trained ? (
            <>
              {modelRow('teacher', say('projects.dreamTrained.box.roleTeacher'), say('projects.dreamTrained.teacher.does'), WRITERS.filter((w) => w !== 'none'))}
              {modelRow('base', say('projects.dreamTrained.base.name'), say('projects.dreamTrained.base.does'), READER_BASES)}
            </>
          ) : (
            modelRow('writer', say('projects.dream.box.roleWriter'), say('projects.dream.writer.does'), WRITERS)
          )}
          {modelRow('embed', say('projects.dream.box.roleEmbed'), say('projects.dream.embed.does'), EMBEDDERS)}
          <p className="research-note">{say('projects.dream.models.note', { memory })}</p>
        </Decision>
        {trained && (
          <Decision box="rows" q={say('projects.dreamTrained.decision.rows')}>
            <Choice on={c.rows === 'read'} onPick={() => chooseDream('rows', 'read')} name={say('projects.dreamTrained.rows.read')}>
              {say('projects.dreamTrained.rows.read.about')}
            </Choice>
            <Choice on={c.rows === 'keep'} onPick={() => chooseDream('rows', 'keep')} name={say('projects.dreamTrained.rows.keep')}>
              {say('projects.dreamTrained.rows.keep.about')}
            </Choice>
          </Decision>
        )}
        <Decision box="draw" q={trained ? say('projects.dreamTrained.decision.diffusion') : say('projects.dream.decision.draw')}>
          <Choice on={c.drawWith === 'cards'} onPick={() => chooseDream('drawWith', 'cards')} name={say('projects.dream.draw.cards')}>
            {say('projects.dream.draw.cards.about')}
          </Choice>
          <Choice on={c.drawWith === 'prior'} onPick={() => chooseDream('drawWith', 'prior')} name={say('projects.dream.draw.prior')}>
            {say('projects.dream.draw.prior.about')}
          </Choice>
          {trained && (
            <>
              <Choice on={false} onPick={() => {}} name={say('projects.dreamTrained.diffusion.sd15')} off={say('projects.dreamTrained.diffusion.sd15.off')}>
                {say('projects.dreamTrained.diffusion.sd15.about')}
              </Choice>
              <Choice on={false} onPick={() => {}} name={say('projects.dreamTrained.diffusion.flux')} off={say('projects.dreamTrained.diffusion.flux.off')}>
                {say('projects.dreamTrained.diffusion.flux.about')}
              </Choice>
            </>
          )}
        </Decision>
        {trained && (
          <Decision box="style" q={say('projects.dreamTrained.decision.style')}>
            <Choice on={c.style === 'none'} onPick={() => chooseDream('style', 'none')} name={say('projects.dreamTrained.style.none')}>
              {say('projects.dreamTrained.style.none.about')}
            </Choice>
            <Choice on={c.style === 'drawings'} onPick={() => chooseDream('style', 'drawings')} name={say('projects.dreamTrained.style.drawings')}>
              {say('projects.dreamTrained.style.drawings.about')}
            </Choice>
            {c.style === 'drawings' && (
              <div className="dream-sets">
                <label className="dream-sets__row">
                  <span className="label">{say('projects.dreamTrained.style.set')}</span>
                  <select value={c.drawings} onChange={(e) => chooseDream('drawings', e.target.value)}>
                    {!facts.sets.some((x) => x.folder === c.drawings) && <option value={c.drawings}>{`${c.drawings} (0)`}</option>}
                    {facts.sets.filter((x) => !x.folder.startsWith(`${c.demo}-`)).map((x) => (
                      <option key={x.folder} value={x.folder}>{`${x.folder} (${x.pictures})`}</option>
                    ))}
                  </select>
                </label>
                <p className="research-note">{say('projects.dreamTrained.style.note')}</p>
              </div>
            )}
          </Decision>
        )}
        <Decision box="draw" q={say('projects.dream.decision.variations')}>
          {[1, 2, 4].map((n) => (
            <Choice key={n} on={c.variations === n} onPick={() => chooseDream('variations', n)} name={say('projects.dream.variations.n', { n })}>
              {say('projects.dream.variations.about', { minutes: Math.round((256 * n * 20) / 60) })}
            </Choice>
          ))}
        </Decision>
        {!trained && (
        <Decision box="interpret" q={say('projects.dream.decision.ahead')}>
          <Choice on={c.ahead === 'all'} onPick={() => chooseDream('ahead', 'all')} name={say('projects.dream.ahead.all')}>
            {say('projects.dream.ahead.all.about')}
          </Choice>
          <Choice on={c.ahead === 'live'} onPick={() => chooseDream('ahead', 'live')} name={say('projects.dream.ahead.live')}>
            {say('projects.dream.ahead.live.about')}
          </Choice>
        </Decision>
        )}
        <Decision box="interpret" q={say('projects.dream.decision.language')}>
          <Choice on={!c.chinese} onPick={() => chooseDream('chinese', false)} name={say('projects.dream.language.en')}>
            {say('projects.dream.language.en.about')}
          </Choice>
          <Choice on={c.chinese} onPick={() => chooseDream('chinese', true)} name={say('projects.dream.language.zh')}>
            {say('projects.dream.language.zh.about')}
          </Choice>
        </Decision>
        <Decision box="room" q={say('projects.dream.decision.words')}>
          <Choice on={!c.readWords} onPick={() => chooseDream('readWords', false)} name={say('projects.dream.words.keep')}>
            {say('projects.dream.words.keep.about')}
          </Choice>
          <Choice on={c.readWords} onPick={() => chooseDream('readWords', true)} name={say('projects.dream.words.read')}>
            {say('projects.dream.words.read.about')}
          </Choice>
        </Decision>
      </div>
    </section>
  )
}
