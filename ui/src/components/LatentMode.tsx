import { useRef } from 'react'
import { NODES, WIRES, W, H, stretchWire } from './FlowMap'
import { MAX_PX, mapWidth, stripZoom } from '../lib/mapWidth'
import { Choice, Decision, useGlide } from './VoiceMode'
import { useHelperState } from '../hooks/useHelper'
import { useRoutePage } from '../lib/routePage'
import { BUILT_DIFFUSIONS, chooseLatent, DIFFUSIONS, MEDIA_TEXTS, PICTURES, toggleMediaText, useLatentChoices, WALKS, type Diffusion, type MediaText, type Pictures, type Walk } from '../lib/latentChoices'
import { say } from '../text/say'
import type { LatentFacts, Project, Step } from './ProjectsPanel'

/**
 * Project mode for the latent image. Its schematic is the Start map, with the
 * route lit on the boxes the Start map already has (your photos, your words,
 * the ready-made model, which here is Kandinsky 2.2, a diffusion model) and
 * five boxes it adds: crop, the latent image, the decoder trained on the set,
 * the gallery page, and the room, the installation's own page, where the
 * route ends. The boxes off the route stay as
 * faint outlines, so the student sees where the project sits in all of
 * Variable Machine. As the page scrolls the map folds, a px of height per px
 * scrolled, into a strip of two rows that stays at the top: the pictures'
 * line above, the texts and the decoder below.
 */

type P = [number, number]
interface Box {
  name: string
  /** where it sits on the open map: the Start map's place, for a box the Start map has */
  a: P
  /** where the folded strip has it */
  s: P
  /** a box this project adds to the Start map */
  added?: boolean
  input?: boolean
  caption?: () => string
}

const VIEW = { x: 30, y: 60, w: 1170, h: 520 }
/** the folded strip: two rows, the pictures' line and, under it, the texts and the decoder */
const F = { h: 30, row1: VIEW.y + 8, row2: VIEW.y + 52, height: 90 }
/** The strip's window on a laptop, in the map's units, and how close in it goes on a narrow screen (as Make Your Own's: lib/mapWidth). */
const STRIP_ZOOM = { base: 820, min: 520 }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const at = (id: string): P => {
  const n = NODES.find((x) => x.id === id)!
  return [n.x, n.y]
}
const named = (id: string) => NODES.find((n) => n.id === id)?.name ?? id

/** The route's boxes: the Start map's own, then the ones this project adds, placed where the Start map has room. */
const ROUTE: Record<string, Box> = {
  photos: { name: named('photos'), a: at('photos'), s: [60, F.row1], input: true, caption: () => say('projects.latent.mode.capPhotos') },
  crop: { name: say('projects.latent.mode.boxCrop'), a: [300, 510], s: [300, F.row1], added: true, caption: () => say('projects.latent.mode.capCrop') },
  'made-images': { name: named('made-images'), a: at('made-images'), s: [590, F.row1], caption: () => say('projects.latent.mode.capModel') },
  latent: { name: say('projects.latent.mode.boxLatent'), a: [820, 510], s: [820, F.row1], added: true, caption: () => say('projects.latent.mode.capLatent') },
  gallery: { name: say('projects.latent.mode.boxGallery'), a: [1000, 420], s: [820, F.row2], added: true, caption: () => say('projects.latent.mode.capGallery') },
  // where the Start map has segmentation, a ready-made model's use: the room is this one's
  room: { name: say('projects.latent.mode.boxRoom'), a: [1000, 510], s: [1000, F.row1], added: true, caption: () => say('projects.latent.mode.capRoom') },
  words: { name: named('words'), a: at('words'), s: [60, F.row2], input: true, caption: () => say('projects.latent.mode.capWords') },
  decoder: { name: say('projects.latent.mode.boxDecoder'), a: [590, 420], s: [590, F.row2], added: true, caption: () => say('projects.latent.mode.capDecoder') },
}
/** The Start map's other boxes in the open view: faint, to show where the project sits. */
const OTHERS = NODES.filter((n) => !(n.id in ROUTE) && n.id !== 'segmentation' && n.y + H <= VIEW.y + VIEW.h && n.y >= VIEW.y - 10)
/** boxes with a decision on the page, so a click on one scrolls to it even when no step sits there */
const DECIDED = new Set(['photos', 'words', 'made-images', 'decoder', 'latent', 'gallery'])

type State = 'done' | 'now' | 'waiting'
const stateOf = (steps: Step[], i: number): State => {
  const now = steps.findIndex((s) => !s.done)
  return steps[i].done ? 'done' : i === now ? 'now' : 'waiting'
}

/** The boxes and wires the decisions draw. */
function drawn(facts: LatentFacts, museum: boolean, decoder: boolean) {
  const on = new Set(['photos', 'made-images', 'latent', 'gallery', 'room', 'words', ...(museum ? [] : ['crop']), ...(decoder ? ['decoder'] : [])])
  for (const st of facts.steps) if (st.node) on.add(st.node)
  const wires: { a: string; b: string; label: () => string }[] = [
    ...(museum ? [{ a: 'photos', b: 'made-images', label: () => say('projects.latent.mode.wireEncode') }] : [{ a: 'photos', b: 'crop', label: () => '' }, { a: 'crop', b: 'made-images', label: () => say('projects.latent.mode.wireEncode') }]),
    { a: 'made-images', b: 'latent', label: () => say('projects.latent.mode.wireDecode') },
    ...(decoder ? [{ a: 'made-images', b: 'decoder', label: () => '' }, { a: 'decoder', b: 'latent', label: () => '' }] : []),
    { a: 'latent', b: 'gallery', label: () => say('projects.latent.mode.wireMeasure') },
    { a: 'latent', b: 'room', label: () => '' },
    { a: 'words', b: 'room', label: () => say('projects.latent.mode.wireBeside') },
  ]
  return { on, wires }
}

/** The schematic over the latent image's page: the Start map, folding into the strip as the page scrolls. */
export default function LatentMode({ project, step, onStep, whole, onZoom }: { project: Project; step: number; onStep: (n: number) => void; whole: boolean; onZoom: () => void }) {
  const facts = project.latent!
  const c = useLatentChoices()
  const route = drawn(facts, c.pictures === 'museum', c.look === 'set')
  const pxRef = useRef(MAX_PX)
  const { space, self, scroll, focus, stepNow, width, pick } = useRoutePage({ step, project: project.id, onStep, stripPx: () => (F.height * pxRef.current) / stripZoom(pxRef.current, STRIP_ZOOM.base, STRIP_ZOOM.min), line: 'voice-mode__line' })
  // the box lit and zoomed to: the section in view's, if it is on the route, or else the open step's
  const lightId = focus && route.on.has(focus) ? focus : facts.steps[stepNow - 1]?.node
  const lit = lightId ? ROUTE[lightId] : undefined
  // the map runs the window's whole width; wider than MAX_PX, its boxes keep their size and its wires get longer (lib/mapWidth)
  const px = width || MAX_PX
  const { w: VW, zoom, sx } = mapWidth(px, VIEW.w, STRIP_ZOOM)
  const zoomX = Math.min(VIEW.x + VW - zoom, Math.max(VIEW.x, (lit ? sx(lit.s[0]) + W / 2 : VIEW.x) - zoom / 2))
  const zx = useGlide(whole ? VIEW.x : zoomX)
  const zw = useGlide(whole ? VW : zoom)
  pxRef.current = px
  const open = (VIEW.h * px) / VW
  // each px scrolled takes a px off the map's height (as voice's does)
  const want = Math.max((F.height * px) / zw, open - scroll)
  const f = clamp((want * VW - px * VIEW.h) / (px * (F.height - VIEW.h) - want * (zw - VW)))
  const v = { x: lerp(VIEW.x, zx, f), w: lerp(VW, zw, f), h: lerp(VIEW.h, F.height, f) }

  return (
    <>
      <div className="voice-mode__line">
        <div ref={self} className="voice-band__frame">
          <Schematic project={project} facts={facts} route={route} f={f} view={v} sx={sx} light={lightId} pick={(box) => { if (whole) onZoom() /* FULL closes back to the zoomed strip */; pick(box) }} />
        </div>
      </div>
      <div ref={space} className="voice-mode" style={{ height: `${open / 16}rem` }} />
    </>
  )
}

type Route = ReturnType<typeof drawn>

function Schematic({ project, facts, route, f, view, sx, light, pick }: { project: Project; facts: LatentFacts; route: Route; f: number; view: { x: number; w: number; h: number }; sx: (x: number) => number; light?: string; pick: (box: string) => void }) {
  const steps = facts.steps
  const boxH = lerp(H, F.h, f)
  const early = clamp(1 - f * 3)
  const pos = (id: string): P => {
    const b = ROUTE[id]
    return [lerp(sx(b.a[0]), sx(b.s[0]), f), lerp(b.a[1], b.s[1], f)]
  }
  const stepsAt = (id: string) => steps.map((s, i) => ({ s, i })).filter((x) => x.s.node === id)
  const nodeState = (id: string): State | null => {
    const at_ = stepsAt(id)
    if (!at_.length) return null
    const st = at_.map((x) => stateOf(steps, x.i))
    return st.includes('now') ? 'now' : st.every((x) => x === 'done') ? 'done' : 'waiting'
  }
  // the texts' wire runs under the decoder's row, clear of every box, past the gallery's right and into the room's side
  const corridor = lerp(405, F.row2 + F.h + 4, f)
  // a wire from one box to the other: straight along a row or up a column, or along and then into the other box's top or bottom
  const wire = (a: string, b: string) => {
    const [ax, ay] = pos(a)
    const [bx, by] = pos(b)
    const down = by > ay
    if (a === 'words') return `M${ax + W},${ay + boxH / 2} H${sx(255)} V${corridor} H${bx + W + 20} V${by + boxH / 2} H${bx + W}`
    // up a column: at the box's right, clear of the caption under the upper box
    if (Math.abs(ax - bx) < 1) return `M${ax + W - 20},${down ? ay + boxH : ay} V${down ? by : by + boxH}`
    if (Math.abs(ay - by) < 1) return `M${ax + W},${ay + boxH / 2} H${bx}`
    // down to a box: into its top; up to one: through the gap before it, into its side
    if (down) return `M${ax + W},${ay + boxH / 2} H${bx + W / 2} V${by}`
    return `M${ax + W},${ay + boxH / 2} H${bx - 15} V${by + boxH / 2} H${bx}`
  }
  /** where a wire's words go: over a wire along a row, beside one up a column, over the corridor for the texts */
  const labelAt = (a: string, b: string): [number, number, 'start' | 'middle' | 'end'] => {
    const [ax, ay] = pos(a)
    const [bx, by] = pos(b)
    if (a === 'words') return [sx(880), corridor - 6, 'middle']
    if (Math.abs(ax - bx) < 1) return [ax + W - 12, (ay + by + boxH) / 2 + 4, 'start']
    if (Math.abs(ay - by) < 1) return [(ax + W + bx) / 2, ay + boxH / 2 - 7, 'middle']
    return by > ay ? [bx + W / 2 + 8, (ay + by + boxH) / 2 + 4, 'start'] : [bx - 19, (ay + by + boxH) / 2 + 4, 'end']
  }

  return (
    <figure className="voice-band research-band" aria-label={say('projects.schematic.label', { project: project.title })}>
      <svg viewBox={`${view.x} ${VIEW.y} ${view.w} ${view.h}`} className="voice-band__svg">
        <defs>
          <marker id="latent-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="voice-band__tip" />
          </marker>
        </defs>
        {/* the Start map's own wires among the faint boxes; they go as the map folds */}
        {early > 0 &&
          WIRES.filter((w) => OTHERS.some((n) => n.id === w.from) && OTHERS.some((n) => n.id === w.to)).map((w) => stretchWire(w, sx)).map((w) => (
            <g key={`${w.from}-${w.to}-${w.label}`} className="voice-band__wire" style={{ opacity: early }}>
              <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#latent-end)" />
            </g>
          ))}
        {early > 0 &&
          OTHERS.map((n) => (
            <g key={n.id} className="voice-band__node" style={{ opacity: 0.22 * early }}>
              <rect x={sx(n.x)} y={n.y} width={W} height={H} className="voice-band__box" />
              <text x={sx(n.x) + 12} y={n.y + H / 2 + 5} className="voice-band__name">
                {n.name ?? n.id}
              </text>
            </g>
          ))}
        {/* the route's wires, drawn from where the boxes are */}
        {route.wires.map(({ a, b, label }) => {
          const l = label()
          const [lx, ly, anchor] = labelAt(a, b)
          return (
            <g key={`${a}-${b}`}>
              <path d={wire(a, b)} className="voice-band__route" markerEnd="url(#latent-end)" />
              {l && early > 0 && (
                <text x={lx} y={ly} textAnchor={anchor} className="voice-band__label" style={{ opacity: early }}>
                  {l}
                </text>
              )}
            </g>
          )
        })}
        {Object.entries(ROUTE).map(([id, b]) => {
          const on = route.on.has(id)
          if (!on && (b.added || f > 0.6)) return null
          const [x, y] = pos(id)
          const at_ = stepsAt(id)
          const st = nodeState(id)
          const isLit = id === light
          const can = on && (at_.length > 0 || DECIDED.has(id))
          const target = at_.find((x_) => !x_.s.done) ?? at_[0]
          return (
            <g
              key={id}
              className={`voice-band__node ${on ? 'is-on' : ''} ${st ? `is-${st}` : ''} ${isLit ? 'is-open' : ''} ${can ? 'is-step' : ''}`.trim()}
              style={on ? undefined : { opacity: 0.22 * early }}
              role={can ? 'button' : undefined}
              tabIndex={can ? 0 : undefined}
              aria-label={target ? `${at_.map((x_) => x_.i + 1).join(', ')} ${target.s.name}` : can ? b.name : undefined}
              onClick={() => can && pick(id)}
              onKeyDown={(e) => can && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(id))}
            >
              <title>{target ? target.s.name : b.name}</title>
              <rect x={x} y={y} width={W} height={boxH} className={`voice-band__box ${b.input ? 'is-input' : ''}`.trim()} />
              <text x={x + 12} y={y + boxH / 2 + 5} className="voice-band__name">
                {b.name}
              </text>
              {at_.length > 0 && (
                <text x={x + W - 10} y={y + boxH / 2 + 5} textAnchor="end" className="voice-band__num">
                  {st === 'done' && f === 1 ? '✓' : at_.map((x_) => x_.i + 1).join('·')}
                </text>
              )}
              {on && b.caption && early > 0 && (
                <text x={x} y={y + boxH + 15} className="voice-band__caption" style={{ opacity: early }}>
                  {b.caption()}
                </text>
              )}
              {on && b.added && early > 0 && (
                <text x={x} y={y - 7} className="research-band__new" style={{ opacity: early }}>
                  {say('projects.latent.mode.newBox')}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

/** Each kind of pictures in words: its name, its tab, and what it costs and changes. Literal keys, so the build can check every one is used. */
const PICTURE_WORDS: Record<Pictures, () => { name: string; tab: string; time: string; disk: string; needs: string; changes: string }> = {
  example: () => ({ name: say('projects.latent.pictures.example'), tab: say('projects.latent.pictures.example.tab'), time: say('projects.latent.pictures.example.time'), disk: say('projects.latent.pictures.example.disk'), needs: say('projects.latent.pictures.example.needs'), changes: say('projects.latent.pictures.example.changes') }),
  grid: () => ({ name: say('projects.latent.pictures.grid'), tab: say('projects.latent.pictures.grid.tab'), time: say('projects.latent.pictures.grid.time'), disk: say('projects.latent.pictures.grid.disk'), needs: say('projects.latent.pictures.grid.needs'), changes: say('projects.latent.pictures.grid.changes') }),
  single: () => ({ name: say('projects.latent.pictures.single'), tab: say('projects.latent.pictures.single.tab'), time: say('projects.latent.pictures.single.time'), disk: say('projects.latent.pictures.single.disk'), needs: say('projects.latent.pictures.single.needs'), changes: say('projects.latent.pictures.single.changes') }),
  museum: () => ({ name: say('projects.latent.pictures.museum'), tab: say('projects.latent.pictures.museum.tab'), time: say('projects.latent.pictures.museum.time'), disk: say('projects.latent.pictures.museum.disk'), needs: say('projects.latent.pictures.museum.needs'), changes: say('projects.latent.pictures.museum.changes') }),
}
const DIFFUSION_WORDS: Record<Diffusion, () => [string, string]> = {
  kandinsky: () => [say('projects.latent.diffusion.kandinsky'), say('projects.latent.diffusion.kandinsky.about')],
  taesd: () => [say('projects.latent.diffusion.taesd'), say('projects.latent.diffusion.taesd.about')],
}
const WALK_WORDS: Record<Walk, () => [string, string]> = {
  theme: () => [say('projects.latent.walk.theme'), say('projects.latent.walk.theme.about')],
  words: () => [say('projects.latent.walk.words'), say('projects.latent.walk.words.about')],
  sentence: () => [say('projects.latent.walk.sentence'), say('projects.latent.walk.sentence.about')],
  picture: () => [say('projects.latent.walk.picture'), say('projects.latent.walk.picture.about')],
}
const TEXT_WORDS: Record<MediaText, () => [string, string]> = {
  benjamin: () => [say('projects.latent.text.benjamin'), say('projects.latent.text.benjamin.about')],
  barthes: () => [say('projects.latent.text.barthes'), say('projects.latent.text.barthes.about')],
  baudrillard: () => [say('projects.latent.text.baudrillard'), say('projects.latent.text.baudrillard.about')],
  lacan: () => [say('projects.latent.text.lacan'), say('projects.latent.text.lacan.about')],
  holmes: () => [say('projects.latent.text.holmes'), say('projects.latent.text.holmes.about')],
  plato: () => [say('projects.latent.text.plato'), say('projects.latent.text.plato.about')],
}

/** The decisions under the schematic: the pictures as a fork of four, then the diffusion model, the texts, the look, and what it is measured against. */
export function LatentDecisions({ project }: { project: Project }) {
  const facts = project.latent!
  const c = useLatentChoices()
  const { status } = useHelperState()
  const memory = status?.memoryGB ?? 16
  /** someone's own screenshots: a set to name, and private */
  const screenshots = c.pictures === 'grid' || c.pictures === 'single'

  return (
    <section className="voice-decisions" aria-label={say('projects.latent.decisions')}>
      <div className="voice-fork" data-box="photos" role="radiogroup" aria-label={say('projects.latent.decision.pictures')}>
        <h3 className="label voice-decision__q">{`◇ ${say('projects.latent.decision.pictures')}`}</h3>
        <div className="voice-fork__options">
          {PICTURES.map((p) => {
            const w = PICTURE_WORDS[p]()
            return (
              <button key={p} type="button" role="radio" aria-checked={c.pictures === p} className={`voice-option ${c.pictures === p ? 'is-on' : ''}`.trim()} onClick={() => chooseLatent('pictures', p)}>
                <span className="voice-option__name">{`${c.pictures === p ? '●' : '○'} ${w.name}`}</span>
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
        {screenshots && <p className="research-note">{say('projects.latent.pictures.private')}</p>}
      </div>

      <div className="voice-subs">
        {screenshots && (
          <Decision box="photos" q={say('projects.latent.decision.set')}>
            <label className="field">
              <span className="label label--muted">{say('projects.latent.set.name')}</span>
              <input type="text" value={c.set} onChange={(e) => chooseLatent('set', e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '-'))} spellCheck={false} />
            </label>
            <p className="research-note">{say('projects.latent.set.about', { set: c.set || 'screenshots' })}</p>
          </Decision>
        )}

        <Decision box="made-images" q={say('projects.latent.decision.diffusion')}>
          {DIFFUSIONS.map((d) => {
            const [name, about] = DIFFUSION_WORDS[d]()
            return (
              <Choice key={d} on={c.diffusion === d} onPick={() => chooseLatent('diffusion', d)} name={name} off={BUILT_DIFFUSIONS.has(d) ? undefined : say('projects.latent.notBuilt')}>
                {about}
                {d === 'kandinsky' && memory < 16 && <span className="voice-choice__warn">{` ${say('projects.latent.diffusion.tooSmall', { memory })}`}</span>}
                {!BUILT_DIFFUSIONS.has(d) && <span className="voice-choice__warn">{` ${say('projects.latent.notBuilt')}`}</span>}
              </Choice>
            )
          })}
        </Decision>

        <Decision box="words" q={say('projects.latent.decision.texts')} many>
          {MEDIA_TEXTS.map((t) => {
            const [name, about] = TEXT_WORDS[t.id]()
            return (
              <Choice key={t.id} many on={c.texts.includes(t.id)} onPick={() => toggleMediaText(t.id)} name={name}>
                {about}
              </Choice>
            )
          })}
          <Choice many on={c.own} onPick={() => chooseLatent('own', !c.own)} name={say('projects.latent.text.own')}>
            {say('projects.latent.text.own.about')}
            {facts.own.length > 0 && <span className="label label--muted">{` ${say('projects.latent.text.own.here', { names: facts.own.join(', ') })}`}</span>}
          </Choice>
          <p className="research-note">{say('projects.latent.texts.library')}</p>
        </Decision>

        <Decision box={c.look === 'set' ? 'decoder' : 'latent'} q={say('projects.latent.decision.look')}>
          <Choice on={c.look === 'web'} onPick={() => chooseLatent('look', 'web')} name={say('projects.latent.look.web')}>
            {say('projects.latent.look.web.about')}
          </Choice>
          <Choice on={c.look === 'set'} onPick={() => chooseLatent('look', 'set')} name={say('projects.latent.look.set')}>
            {say('projects.latent.look.set.about')}
          </Choice>
        </Decision>

        <Decision box="latent" q={say('projects.latent.decision.walk')}>
          {WALKS.map((w) => {
            const [name, about] = WALK_WORDS[w]()
            return (
              <Choice key={w} on={c.walk === w} onPick={() => chooseLatent('walk', w)} name={name}>
                {about}
              </Choice>
            )
          })}
          {c.walk === 'theme' && (
            <label className="field">
              <span className="label label--muted">{say('projects.latent.walk.themeField')}</span>
              <input type="number" min={1} max={12} value={c.theme} onChange={(e) => chooseLatent('theme', Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
            </label>
          )}
          {c.walk === 'sentence' && (
            <label className="field">
              <span className="label label--muted">{say('projects.latent.walk.sentenceField')}</span>
              <input type="text" value={c.sentence} maxLength={200} placeholder={say('projects.latent.walk.sentencePlaceholder')} onChange={(e) => chooseLatent('sentence', e.target.value)} />
            </label>
          )}
          {c.walk === 'picture' && (
            <label className="field">
              <span className="label label--muted">{say('projects.latent.walk.pictureField')}</span>
              <input type="number" min={1} value={c.picture} onChange={(e) => chooseLatent('picture', Math.max(1, Number(e.target.value) || 1))} />
            </label>
          )}
          <p className="research-note">{say('projects.latent.walk.note')}</p>
        </Decision>

        <Decision box="gallery" q={say('projects.latent.decision.against')}>
          <Choice on={!c.against} onPick={() => chooseLatent('against', '')} name={facts.collection}>
            {say('projects.latent.against.itself')}
          </Choice>
          {facts.sets.map((s) => (
            <Choice key={s} on={c.against === s} onPick={() => chooseLatent('against', s)} name={s}>
              {say('projects.latent.against.other')}
            </Choice>
          ))}
        </Decision>
      </div>
    </section>
  )
}
