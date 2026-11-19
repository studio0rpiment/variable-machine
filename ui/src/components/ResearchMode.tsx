import { useEffect, useRef, useState } from 'react'
import { HF_BASES } from '@shared/library'
import { NODES, WIRES, W, H } from './FlowMap'
import { Choice, Decision, useGlide } from './VoiceMode'
import { useHelperState } from '../hooks/useHelper'
import { useRoutePage } from '../lib/routePage'
import { BUILT_SOURCES, chooseResearch, FIELD_LIST, LIBRARY_LIST, RANKERS, ROLE_MODELS, SOURCES, toggleIn, toggleSource, useResearchChoices, type Field, type Library, type Source } from '../lib/researchChoices'
import { say } from '../text/say'
import type { Project, ResearchFacts, Step } from './ProjectsPanel'

/**
 * Project mode for the research bot. Its schematic is the Start map, opened
 * up: the project opens on the Start map's top band, the research bot's route
 * lit, and in about a second it unfolds. The boxes off the route fade, the
 * route's boxes keep their x and slide to their rows, PAPERS opens into its
 * sources and the pipeline that reads them (search code → rank → screen → you
 * decide → reading list), and MODELS opens into one model per role. A point
 * of view, when the route makes one, runs along the bottom on the Start map's
 * own boxes (data, train or prefer, adapters, share). As the page scrolls the
 * schematic folds, a px of height per px scrolled, into a strip of two rows
 * that stays at the top: the sources fold back into PAPERS and the models into
 * MODELS.
 */

type P = [number, number]
interface Box {
  name: string
  /** where the Start map has it; a box opened out of another has none */
  a?: P
  /** where the research bot's schematic has it */
  b: P
  /** where the folded strip has it */
  s: P
  /** the box it opens out of */
  from?: string
  kind?: 'input' | 'code' | 'model'
  /** a box that opens: its name becomes the head of what it holds */
  head?: string
  role?: string
  source?: Source
  caption?: string
}

const VIEW = { x: 30, y: 30, w: 1170, h: 440 }
/** the folded strip: two rows, the pipeline and the point of view */
const F = { h: 30, row1: 38, row2: 82, height: 90 }
const ZOOM = 820
const at = (id: string): P => {
  const n = NODES.find((x) => x.id === id)!
  return [n.x, n.y]
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

/** The boxes of the Start map's band that the research bot doesn't use: they fade as it unfolds. */
const OFF = ['words', 'pictures', 'modelfile', 'merge', 'chat']

function boxes(): Record<string, Box> {
  const B: Record<string, Box> = {
    models: { name: 'models', a: at('models'), b: [60, 80], s: [60, F.row2], head: say('projects.research.mode.headModels') },
    papers: { name: 'papers', a: at('papers'), b: [60, 140], s: [60, F.row1], kind: 'input', head: say('projects.research.mode.headPapers') },
    search: { name: 'search code', from: 'papers', b: [300, 200], s: [300, F.row1], kind: 'code', caption: say('projects.research.mode.capSearch') },
    rank: { name: 'rank', from: 'papers', b: [470, 200], s: [470, F.row1], caption: say('projects.research.mode.capRank') },
    screen: { name: 'screen', from: 'papers', b: [640, 200], s: [640, F.row1], caption: say('projects.research.mode.capScreen') },
    you: { name: 'you decide', from: 'papers', b: [820, 200], s: [820, F.row1], caption: say('projects.research.mode.capYou') },
    list: { name: 'reading list', a: at('reading-list'), b: [1000, 200], s: [1000, F.row1], caption: say('projects.research.mode.capList') },
    writer: { name: '', from: 'models', b: [300, 80], s: [60, F.row2], kind: 'model', role: say('projects.research.role.writer') },
    ranker: { name: 'nomic-embed-text', from: 'models', b: [470, 80], s: [60, F.row2], kind: 'model', role: say('projects.research.role.ranker') },
    screener: { name: '', from: 'models', b: [640, 80], s: [60, F.row2], kind: 'model', role: say('projects.research.role.screener') },
    summariser: { name: '', from: 'models', b: [1000, 80], s: [60, F.row2], kind: 'model', role: say('projects.research.role.summariser') },
    data: { name: 'data', a: at('data'), b: [300, 340], s: [300, F.row2], caption: say('projects.research.mode.capData') },
    train: { name: 'train', a: at('train'), b: [590, 340], s: [590, F.row2], caption: say('projects.research.mode.capTrain') },
    prefer: { name: 'prefer', a: at('prefer'), b: [590, 340], s: [590, F.row2], caption: say('projects.research.mode.capPrefer') },
    adapters: { name: 'adapters', a: at('adapters'), b: [820, 340], s: [820, F.row2], caption: say('projects.research.mode.capAdapters') },
    share: { name: 'share', a: at('share'), b: [1000, 340], s: [1000, F.row2], caption: say('projects.research.mode.capShare') },
  }
  SOURCES.forEach((src, i) => (B[`src-${src}`] = { name: SOURCE_NAME[src](), from: 'papers', b: [60, 196 + 45 * i], s: [60, F.row1], kind: 'input', source: src }))
  for (const id of OFF) {
    const [x, y] = at(id)
    B[id] = { name: NODES.find((n) => n.id === id)!.name ?? id, a: [x, y], b: [x, y], s: [x, y] }
  }
  return B
}

const SOURCE_NAME: Record<Source, () => string> = {
  scholarship: () => say('projects.research.source.scholarship'),
  patents: () => say('projects.research.source.patents'),
  archives: () => say('projects.research.source.archives'),
  newspapers: () => say('projects.research.source.newspapers'),
  europeana: () => say('projects.research.source.europeana'),
  feeds: () => say('projects.research.source.feeds'),
}

/** Each source, each role, each option, in words: literal keys, so the build can check every one is used. */
const SOURCE_ABOUT: Record<Source, () => string> = {
  scholarship: () => say('projects.research.source.scholarship.about'),
  patents: () => say('projects.research.source.patents.about'),
  archives: () => say('projects.research.source.archives.about'),
  newspapers: () => say('projects.research.source.newspapers.about'),
  europeana: () => say('projects.research.source.europeana.about'),
  feeds: () => say('projects.research.source.feeds.about'),
}
const ROLE: Record<'writer' | 'screener' | 'summariser', () => string> = {
  writer: () => say('projects.research.role.writer'),
  screener: () => say('projects.research.role.screener'),
  summariser: () => say('projects.research.role.summariser'),
}
const TAKE = {
  list: () => ({ name: say('projects.research.take.list'), tab: say('projects.research.take.list.tab'), time: say('projects.research.take.list.time'), disk: say('projects.research.take.list.disk'), needs: say('projects.research.take.list.needs'), changes: say('projects.research.take.list.changes') }),
  view: () => ({ name: say('projects.research.take.view'), tab: say('projects.research.take.view.tab'), time: say('projects.research.take.view.time'), disk: say('projects.research.take.view.disk'), needs: say('projects.research.take.view.needs'), changes: say('projects.research.take.view.changes') }),
}
const FIELDS: Record<Field, () => [string, string]> = {
  humanities: () => [say('projects.research.field.humanities'), say('projects.research.field.humanities.about')],
  sciences: () => [say('projects.research.field.sciences'), say('projects.research.field.sciences.about')],
  technology: () => [say('projects.research.field.technology'), say('projects.research.field.technology.about')],
}
const LIBRARY: Record<Library, () => [string, string]> = {
  proxy: () => [say('projects.research.library.proxy'), say('projects.research.library.proxy.about')],
  keys: () => [say('projects.research.library.keys'), say('projects.research.library.keys.about')],
  copies: () => [say('projects.research.library.copies'), say('projects.research.library.copies.about')],
}
const TOP: [number, () => string][] = [
  [40, () => say('projects.research.top.40')],
  [100, () => say('projects.research.top.100')],
  [200, () => say('projects.research.top.200')],
]

/** The boxes a click on a model or a source takes to: the decision that chooses it. */
const DECIDED_AT: Record<string, string> = { writer: 'models', ranker: 'models', screener: 'models', summariser: 'models' }

type State = 'done' | 'now' | 'waiting'
const stateOf = (steps: Step[], i: number): State => {
  const now = steps.findIndex((s) => !s.done)
  return steps[i].done ? 'done' : i === now ? 'now' : 'waiting'
}

/** The boxes and wires a route uses, from the decisions. */
function drawn(facts: ResearchFacts, view: boolean, overrides: boolean, pack: boolean, summaries: boolean, sources: Source[]) {
  const on = new Set(['models', 'papers', 'search', 'rank', 'screen', 'you', 'list', 'writer', 'ranker', 'screener', ...sources.map((s) => `src-${s}`)])
  if (summaries) on.add('summariser')
  if (view) for (const id of ['data', overrides ? 'prefer' : 'train', 'adapters', ...(pack ? ['share'] : [])]) on.add(id)
  // the Start map's own wires the route lights, before it unfolds
  const start: [string, string][] = [['papers', 'reading-list']]
  if (view) start.push(['papers', 'data'], overrides ? ['data', 'prefer'] : ['data', 'train'], ...(overrides ? [] : [['models', 'train'] as [string, string]]), [overrides ? 'prefer' : 'train', 'adapters'])
  if (view && pack) start.push(['adapters', 'share'])
  return { on, start, facts }
}

/** The schematic over the research bot's page: unfolds when opened, folds into the strip as the page scrolls. */
export default function ResearchMode({ project, step, onStep, whole, onZoom }: { project: Project; step: number; onStep: (n: number) => void; whole: boolean; onZoom: () => void }) {
  const facts = project.research!
  const c = useResearchChoices()
  const view = c.take === 'view'
  const route = drawn(facts, view, c.trainFrom === 'overrides', c.folderOfItsOwn, c.summaries, c.sources)
  const pxRef = useRef(VIEW.w)
  const { space, self, scroll, focus, stepNow, width, pick } = useRoutePage({ step, project: project.id, onStep, stripPx: () => (F.height * pxRef.current) / ZOOM, line: 'voice-mode__line' })
  // the unfolding, from the Start map's band to the research bot's schematic: once when the project opens, and again on asking
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

  const B = boxes()
  // the box lit and zoomed to: the section in view's, if it is on the route, or else the open step's
  const lightId = focus && route.on.has(focus) ? focus : facts.steps[stepNow - 1]?.node
  const lit = lightId ? B[lightId] : undefined
  const zoomX = Math.min(VIEW.x + VIEW.w - ZOOM, Math.max(VIEW.x, (lit ? lit.s[0] + W / 2 : VIEW.x) - ZOOM / 2))
  const zx = useGlide(whole ? VIEW.x : zoomX)
  const zw = useGlide(whole ? VIEW.w : ZOOM)
  const px = Math.min(width, 53 * 16) || VIEW.w
  pxRef.current = px
  const open = (VIEW.h * px) / VIEW.w
  // each px scrolled takes a px off the map's height (as voice's does)
  const want = Math.max((F.height * px) / zw, open - scroll)
  const f = clamp((want * VIEW.w - px * VIEW.h) / (px * (F.height - VIEW.h) - want * (zw - VIEW.w)))
  const v = { x: lerp(VIEW.x, zx, f), w: lerp(VIEW.w, zw, f), h: lerp(VIEW.h, F.height, f) }

  return (
    <>
      <div className="voice-mode__line">
        <div ref={self} className="voice-band__frame">
          <Schematic project={project} B={B} route={route} u={u} f={f} view={v} light={lightId} pick={(box) => { if (whole) onZoom() /* FULL closes back to the zoomed strip */; pick(DECIDED_AT[box] ?? box) }} />
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

type Route = ReturnType<typeof drawn>

function Schematic({ project, B, route, u, f, view, light, pick }: { project: Project; B: Record<string, Box>; route: Route; u: number; f: number; view: { x: number; w: number; h: number }; light?: string; pick: (box: string) => void }) {
  const c = useResearchChoices()
  const steps = route.facts.steps
  const kA = ease(clamp(u / 0.45))
  const kB = ease(clamp((u - 0.4) / 0.6))
  const fold = ease(f)
  const boxH = lerp(H, F.h, f)
  // where a box is: from the Start map to its row (first the route settles, then papers and models open), then into the strip
  const pos = (id: string): P => {
    const b = B[id]
    let p: P
    if (b.from) {
      const q = pos(b.from)
      const open = (k: number): P => [lerp(q[0], b.b[0], k), lerp(q[1], b.b[1], k)]
      p = open(kB)
    } else if (!route.on.has(id)) p = b.a ?? b.b
    else {
      const k = id === 'papers' ? kB : kA
      p = [lerp(b.a![0], b.b[0], k), lerp(b.a![1], b.b[1], k)]
    }
    if (b.from && (b.kind === 'model' || b.source)) return [lerp(p[0], pos(b.from)[0], fold), lerp(p[1], pos(b.from)[1], fold)]
    return [lerp(p[0], b.s[0], fold), lerp(p[1], b.s[1], fold)]
  }
  /** opened-out boxes appear once their parent has moved; those that fold back go as the strip forms */
  const opacity = (id: string) => {
    const b = B[id]
    // every source shows: the ones searched in full, the rest faint (not chosen, or not built yet)
    const on = route.on.has(id) || !!b.source
    if (b.from) {
      const shown = clamp((u - 0.42) * 4)
      const folds = b.kind === 'model' || b.source ? 1 - clamp(f * 2) : 1
      return on ? shown * folds * (b.source && !route.on.has(id) ? 0.35 : 1) : 0
    }
    return on ? 1 : lerp(0.22, 0, clamp(u / 0.35))
  }
  const early = clamp(1 - u * 3) * (1 - clamp(f * 3))
  const late = clamp((u - 0.7) * 3.3)
  const opened = late * (1 - clamp(f * 2))
  const stripped = clamp(f * 2 - 1)
  const R = (id: string): P => [pos(id)[0] + W, pos(id)[1] + boxH / 2]
  const L = (id: string): P => [pos(id)[0], pos(id)[1] + boxH / 2]
  const view_ = c.take === 'view'
  const learn = c.trainFrom === 'overrides' ? 'prefer' : 'train'
  const stepsAt = (id: string) => steps.map((s, i) => ({ s, i })).filter((x) => x.s.node === id)
  const nodeState = (id: string): State | null => {
    const at_ = stepsAt(id)
    if (!at_.length) return null
    const st = at_.map((x) => stateOf(steps, x.i))
    return st.includes('now') ? 'now' : st.every((x) => x === 'done') ? 'done' : 'waiting'
  }
  const line = (pts: P[], cls: string, o: number, key: string) => o > 0.01 && <polyline key={key} points={pts.map((p) => p.join(',')).join(' ')} className={cls} style={{ opacity: o }} markerEnd={cls.includes('use') ? undefined : 'url(#research-end)'} />
  const modelName = (id: string) => (id === 'writer' ? c.writer : id === 'screener' ? (route.facts.view && route.facts.steps.at(-1)?.done ? route.facts.view : c.screener) : id === 'summariser' ? c.summariser : id === 'ranker' ? c.ranker : B[id].name)

  // the wires of the opened schematic and of the strip, drawn from where the boxes are
  const wires = []
  for (const s of c.sources) {
    const id = `src-${s}`
    wires.push(line([R(id), [250, R(id)[1]], [250, L('search')[1]], L('search')], 'voice-band__route', opened * (BUILT_SOURCES.has(s) ? 1 : 0.35), id))
  }
  wires.push(line([R('papers'), L('search')], 'voice-band__route', stripped, 'papers-search'))
  for (const [a, b] of [['search', 'rank'], ['rank', 'screen'], ['screen', 'you'], ['you', 'list']]) wires.push(line([R(a), L(b)], 'voice-band__route', late, `${a}-${b}`))
  for (const [m, to] of [['writer', 'search'], ['ranker', 'rank'], ['screener', 'screen'], ...(c.summaries ? [['summariser', 'list']] : [])]) {
    const p = pos(m)
    wires.push(line([[p[0] + 40, p[1] + boxH], [pos(to)[0] + 40, pos(to)[1]]], 'voice-band__route research-band__use', opened, `${m}-${to}`))
  }
  if (view_) {
    const y = pos('you')
    const d = pos('data')
    const mid = (y[1] + boxH + d[1]) / 2
    wires.push(line([[y[0] + 75, y[1] + boxH], [y[0] + 75, mid], [d[0] + 75, mid], [d[0] + 75, d[1]]], 'voice-band__route', late, 'you-data'))
    wires.push(line([R('data'), L(learn)], 'voice-band__route', late, 'data-learn'))
    wires.push(line([R(learn), L('adapters')], 'voice-band__route', late, 'learn-adapters'))
    if (c.folderOfItsOwn) wires.push(line([R('adapters'), L('share')], 'voice-band__route', late, 'adapters-share'))
    // the point of view becomes the screener
    const ad = pos('adapters')
    const sc = pos('screener')
    wires.push(line([[ad[0], ad[1] + boxH / 2], [805, ad[1] + boxH / 2], [805, 60], [sc[0] + 110, 60], [sc[0] + 110, sc[1]]], 'voice-band__route research-band__use', opened, 'view-screener'))
    const sn = pos('screen')
    const m2 = (sn[1] + boxH + ad[1]) / 2
    wires.push(line([[ad[0] + 40, ad[1]], [ad[0] + 40, m2], [sn[0] + 110, m2], [sn[0] + 110, sn[1] + boxH]], 'voice-band__route research-band__use', stripped * late, 'view-screen'))
  }

  return (
    <figure className="voice-band research-band" aria-label={say('projects.schematic.label', { project: project.title })}>
      <svg viewBox={`${view.x} ${VIEW.y} ${view.w} ${view.h}`} className="voice-band__svg">
        <defs>
          <marker id="research-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="voice-band__tip" />
          </marker>
        </defs>
        {/* the Start map's own wires on the band, the route's lit; they go as it unfolds */}
        {early > 0 &&
          WIRES.filter((w) => B[w.from === 'reading-list' ? 'list' : w.from] && B[w.to === 'reading-list' ? 'list' : w.to]).map((w) => {
            const on = route.start.some(([a, b]) => a === w.from && b === w.to)
            return (
              <g key={`${w.from}-${w.to}-${w.label}`} className={`voice-band__wire ${on ? 'is-lit' : ''}`.trim()} style={{ opacity: early }}>
                <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#research-end)" />
                {on && (
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
            <text x={300} y={72} className="research-band__lane">
              {say('projects.research.mode.laneModels')}
            </text>
            <text x={300} y={192} className="research-band__lane">
              {say('projects.research.mode.lanePapers')}
            </text>
            {view_ && (
              <>
                <text x={300} y={332} className="research-band__lane">
                  {say('projects.research.mode.laneView')}
                </text>
                <text x={812} y={56} className="voice-band__label">
                  {say('projects.research.mode.becomes')}
                </text>
              </>
            )}
          </g>
        )}
        {Object.entries(B).map(([id, b]) => {
          const o = opacity(id)
          if (o <= 0.01) return null
          const [x, y] = pos(id)
          const at_ = stepsAt(id)
          const st = nodeState(id)
          const on = route.on.has(id)
          const isLit = id === light
          const built = !b.source || BUILT_SOURCES.has(b.source)
          const searched = !b.source || route.on.has(id)
          const can = on && built && (at_.length > 0 || ['papers', 'models', 'search', 'screen', 'list', 'data', 'train', 'prefer', 'share', 'writer', 'ranker', 'screener', 'summariser'].includes(id) || !!b.source)
          // a box that opens: its name becomes the head of the column or row it holds, and comes back as the strip forms
          const headness = b.head ? clamp((u - 0.5) * 3) * (1 - clamp(f * 2)) : 0
          const target = at_.find((x_) => !x_.s.done) ?? at_[0]
          return (
            <g
              key={id}
              className={`voice-band__node ${on && searched ? 'is-on' : ''} ${st ? `is-${st}` : ''} ${isLit && headness < 0.5 ? 'is-open' : ''} ${can ? 'is-step' : ''} ${b.kind ? `research-band__${b.kind}` : ''}`.trim()}
              style={{ opacity: o }}
              role={can ? 'button' : undefined}
              tabIndex={can ? 0 : undefined}
              aria-label={target ? `${at_.map((x_) => x_.i + 1).join(', ')} ${target.s.name}` : can ? b.name || modelName(id) : undefined}
              onClick={() => can && pick(b.source ? 'papers' : id)}
              onKeyDown={(e) => can && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(b.source ? 'papers' : id))}
            >
              <title>{target ? target.s.name : b.role ?? b.name}</title>
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
                  {st === 'done' && f === 1 ? '✓' : at_.length > 2 ? `${at_[0].i + 1}…${at_.at(-1)!.i + 1}` : at_.map((x_) => x_.i + 1).join('·')}
                </text>
              )}
              {(b.caption || b.role) && opened > 0.01 && on && (
                <text x={b.role ? x + W - 6 : x} y={y + boxH + 14} textAnchor={b.role ? 'end' : 'start'} className="voice-band__caption" style={{ opacity: opened }}>
                  {b.role ?? b.caption}
                </text>
              )}
              {id === 'papers' && headness > 0 && (
                <text x={x} y={y + boxH / 2 + 22} className="voice-band__caption" style={{ opacity: headness }}>
                  {say('projects.research.mode.soon')}
                </text>
              )}
              {on && early > 0 && (id === 'papers' || id === 'list') && (
                <text x={x} y={y - 7} className="research-band__new" style={{ opacity: early }}>
                  {say('projects.research.mode.newBox')}
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
/** Download sizes, for the models a role can be when they aren't here yet. */
const SIZE: Record<string, number> = { 'qwen3:4b': 2.5, 'qwen3:1.7b': 1.4, 'nomic-embed-text': 0.3, 'mxbai-embed-large': 0.7 }

/** The decisions under the schematic, in three groups: what you take away, what it finds, who reads it; and the point of view, when the route makes one. */
export function ResearchDecisions({ project }: { project: Project }) {
  const facts = project.research!
  const c = useResearchChoices()
  const { status } = useHelperState()
  const memory = status?.memoryGB ?? 16
  const view = c.take === 'view'
  const take = (t: 'list' | 'view') => chooseResearch('take', t)
  const size = (m: string) => {
    const here = facts.ollama.find((x) => x.name === m || x.name === `${m}:latest`)
    return here ? Number(GB(here.size)) : (SIZE[m] ?? 0)
  }
  const modelRow = (role: 'writer' | 'screener' | 'summariser' | 'secondScreener' | 'ranker', what: string, name = ROLE[role as 'writer']?.(), models = ROLE_MODELS) => (
    <div className="research-role">
      <span className="research-role__name">{name}</span>
      <span className="research-role__what">{what}</span>
      <span className="research-role__models">
        {models.map((m) => {
          const gb = size(m)
          const here = facts.ollama.some((x) => x.name === m || x.name === `${m}:latest`)
          return (
            <button key={m} type="button" role="radio" aria-checked={c[role] === m} className={`research-role__model ${c[role] === m ? 'is-on' : ''}`.trim()} onClick={() => chooseResearch(role, m)} title={here ? say('projects.voice.base.here', { gb }) : say('projects.voice.base.pull', { gb })}>
              {m}
              {gb * 2 > memory && <span className="voice-choice__warn">{' !'}</span>}
            </button>
          )
        })}
      </span>
    </div>
  )

  return (
    <section className="voice-decisions" aria-label={say('projects.research.decisions')}>
      <div className="voice-fork" data-box="list" role="radiogroup" aria-label={say('projects.research.decision.take')}>
        <h3 className="label voice-decision__q">{`◇ ${say('projects.research.decision.take')}`}</h3>
        <div className="voice-fork__options">
          {(['list', 'view'] as const).map((t) => {
            const w = TAKE[t]()
            return (
              <button key={t} type="button" role="radio" aria-checked={c.take === t} className={`voice-option ${c.take === t ? 'is-on' : ''}`.trim()} onClick={() => take(t)}>
                <span className="voice-option__name">{`${c.take === t ? '●' : '○'} ${w.name}`}</span>
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
        <Decision box="search" q={say('projects.research.decision.folder')}>
          <Choice on={!c.folder} onPick={() => chooseResearch('folder', '')} name={say('projects.research.folder.new')}>
            {say('projects.research.folder.newAbout')}
          </Choice>
          {facts.folders.map((name) => (
            <Choice key={name} on={c.folder === name} onPick={() => chooseResearch('folder', name)} name={name}>
              {say('projects.research.folder.here')}
            </Choice>
          ))}
        </Decision>
      </div>

      <h3 className="label label--muted research-group">{say('projects.research.group.find')}</h3>
      <div className="voice-subs">
        <Decision box="papers" q={say('projects.research.decision.sources')} many>
          {SOURCES.map((s) => (
            <Choice key={s} many on={c.sources.includes(s)} onPick={() => toggleSource(s)} name={SOURCE_NAME[s]()} off={BUILT_SOURCES.has(s) ? undefined : say('projects.research.notBuilt')}>
              {SOURCE_ABOUT[s]()}
              {!BUILT_SOURCES.has(s) && <span className="voice-choice__warn">{` ${say('projects.research.notBuilt')}`}</span>}
            </Choice>
          ))}
          <p className="research-note">{say('projects.research.sources.combine')}</p>
        </Decision>
        <Decision box="papers" q={say('projects.research.decision.fields')} many>
          {FIELD_LIST.map((k) => {
            const [name, about] = FIELDS[k]()
            return (
              <Choice key={k} many on={c.fields.includes(k)} onPick={() => toggleIn('fields', k)} name={name}>
                {about}
              </Choice>
            )
          })}
          <p className="research-note">{say('projects.research.fields.about')}</p>
        </Decision>
        <Decision box="papers" q={say('projects.research.decision.library')} many>
          {LIBRARY_LIST.map((k) => {
            const [name, about] = LIBRARY[k]()
            return (
              <Choice key={k} many on={c.library.includes(k)} onPick={() => toggleIn('library', k)} name={name}>
                {about}
              </Choice>
            )
          })}
          <p className="research-note">{say('projects.research.library.never')}</p>
        </Decision>
      </div>

      <h3 className="label label--muted research-group">{say('projects.research.group.read')}</h3>
      <div className="voice-subs">
        <Decision box="models" q={say('projects.research.decision.models')}>
          {modelRow('writer', say('projects.research.role.writer.does'))}
          {modelRow('ranker', say('projects.research.role.ranker.does'), say('projects.research.role.ranker'), RANKERS)}
          {modelRow('screener', say('projects.research.role.screener.does'))}
          {c.second && modelRow('secondScreener', say('projects.research.role.second.does'), say('projects.research.role.second'))}
          {c.summaries && modelRow('summariser', say('projects.research.role.summariser.does'))}
          <p className="research-note">{say('projects.research.models.memory', { memory })}</p>
        </Decision>
        <Decision box="screen" q={say('projects.research.decision.top')}>
          {TOP.map(([n, about]) => (
            <Choice key={n} on={c.top === n} onPick={() => chooseResearch('top', n)} name={say('projects.research.top.n', { n })}>
              {about()}
            </Choice>
          ))}
        </Decision>
        <Decision box="screen" q={say('projects.research.decision.compare')}>
          <Choice on={!c.second} onPick={() => chooseResearch('second', false)} name={say('projects.research.compare.no')}>
            {say('projects.research.compare.no.about')}
          </Choice>
          <Choice on={c.second} onPick={() => chooseResearch('second', true)} name={say('projects.research.compare.yes')}>
            {say('projects.research.compare.yes.about')}
          </Choice>
        </Decision>
        <Decision box="list" q={say('projects.research.decision.summaries')}>
          <Choice on={!c.summaries} onPick={() => chooseResearch('summaries', false)} name={say('projects.research.summaries.none')}>
            {say('projects.research.summaries.none.about')}
          </Choice>
          <Choice on={c.summaries && !c.fullText} onPick={() => (chooseResearch('summaries', true), chooseResearch('fullText', false))} name={say('projects.research.summaries.abstracts')}>
            {say('projects.research.summaries.abstracts.about')}
          </Choice>
          <Choice on={c.summaries && c.fullText} onPick={() => (chooseResearch('summaries', true), chooseResearch('fullText', true))} name={say('projects.research.summaries.full')}>
            {say('projects.research.summaries.full.about')}
          </Choice>
        </Decision>
      </div>

      {view && (
        <>
          <h3 className="label label--muted research-group">{say('projects.research.group.view')}</h3>
          <div className="voice-subs">
            <Decision box="data" q={say('projects.research.decision.whose')}>
              <Choice on={c.whose === 'mine'} onPick={() => chooseResearch('whose', 'mine')} name={say('projects.research.whose.mine')}>
                {say('projects.research.whose.mine.about')}
              </Choice>
              <Choice on={c.whose === 'class'} onPick={() => chooseResearch('whose', 'class')} name={say('projects.research.whose.class')}>
                {say('projects.research.whose.class.about')}
              </Choice>
            </Decision>
            <Decision box="data" q={say('projects.research.decision.trainFrom')}>
              <Choice on={c.trainFrom === 'all'} onPick={() => chooseResearch('trainFrom', 'all')} name={say('projects.research.trainFrom.all')}>
                {say('projects.research.trainFrom.all.about')}
              </Choice>
              <Choice on={c.trainFrom === 'overrides'} onPick={() => chooseResearch('trainFrom', 'overrides')} name={say('projects.research.trainFrom.overrides')}>
                {say('projects.research.trainFrom.overrides.about')}
              </Choice>
            </Decision>
            <Decision box={c.trainFrom === 'all' ? 'train' : 'prefer'} q={say('projects.research.decision.base')}>
              {HF_BASES.map((b) => {
                const big = b.params === '1.7B'
                return (
                  <Choice key={b.id} on={c.base === b.id} onPick={() => chooseResearch('base', b.id)} name={big ? 'SmolLM2-1.7B' : 'SmolLM2-360M'}>
                    {big ? say('projects.voice.base.large', { memory }) : say('projects.voice.base.small')}
                    {big && memory < 16 && <span className="voice-choice__warn">{` ${say('projects.voice.base.tooBig', { memory })}`}</span>}
                  </Choice>
                )
              })}
            </Decision>
            <Decision box="share" q={say('projects.research.decision.runs')}>
              <Choice on={!c.folderOfItsOwn} onPick={() => chooseResearch('folderOfItsOwn', false)} name={say('projects.research.runs.here')}>
                {say('projects.research.runs.here.about')}
              </Choice>
              <Choice on={c.folderOfItsOwn} onPick={() => chooseResearch('folderOfItsOwn', true)} name={say('projects.research.runs.folder')}>
                {say('projects.research.runs.folder.about')}
              </Choice>
            </Decision>
          </div>
        </>
      )}
    </section>
  )
}
