import { useCallback, useEffect, useRef, useState } from 'react'
import { Explained } from '../explain/Explained'
import type { ExplainId } from '../explain/text'

/**
 * The Start map: every tab as a node, wires for what flows between them, laid
 * out like node-based programming (a patch, a circuit). Nodes are links to
 * their tabs. Wires run in straight lines and 45° bends, each labelled with
 * what travels along it. Coordinates are in the SVG's own units; it scales as
 * one picture, so the angles stay 45°.
 */

const W = 150 // node width
/** Everything drawn, in the SVG's units: what "fit" shows. */
const CONTENT = { x: 40, y: 20, w: 1156, h: 830 } // the bottom 70 are room for the echo
const MIN_W = 360 // closest zoom, in units across
const MAX_W = 4000 // furthest
const H = 44 // node height

interface Node {
  id: string
  n?: string
  x: number
  y: number
  caption: string
  /** shown in the box, when it isn't the id */
  name?: string
  /** the tab it opens, when it isn't a tab itself */
  to?: string
  /** its flag, when it isn't the tab's (panel.<id>) */
  flag?: ExplainId
  /**
   * input: what you bring (your words, photos, movements): plain, muted.
   * made: a model its makers trained, used as it is: dotted.
   * use: where a model is used: an outer outline round the box.
   * Chat is a use too, doubled: two models side by side.
   */
  kind?: 'input' | 'made' | 'use'
  dest?: boolean
}

/**
 * Five columns, left to right: what you bring, preparing it, how a model
 * learns, making it a model, using it. The language models fill the top band
 * (the change loop); each other kind is one row below, which skips the columns
 * it doesn't need: segmentation and speech are used as their makers trained
 * them, and a gesture model is trained from your own examples in seconds.
 */
const COLUMNS: [number, string][] = [[60, 'bring'], [300, 'prepare'], [590, 'how it learns'], [820, 'make it a model'], [1000, 'use it']]

const NODES: Node[] = [
  { id: 'models', n: '1', x: 60, y: 80, caption: 'every kind starts here' },
  { id: 'words', name: 'your words', x: 60, y: 190, caption: 'questions and answers', kind: 'input', to: 'data', flag: 'map.words' },
  { id: 'pictures', name: 'photos + words', x: 60, y: 300, caption: 'what each photo shows', kind: 'input', to: 'data', flag: 'map.pictures' },
  { id: 'modelfile', n: '2', x: 300, y: 80, caption: 'change it with words' },
  { id: 'data', n: '3', x: 300, y: 240, caption: 'what it learns from' },
  { id: 'train', n: '4', x: 590, y: 190, caption: 'imitate' },
  { id: 'prefer', n: '4', x: 590, y: 270, caption: 'lean toward the better' },
  { id: 'merge', n: '4', x: 590, y: 350, caption: 'blend two' },
  { id: 'adapters', n: '5', x: 820, y: 270, caption: 'changes become models' },
  { id: 'chat', x: 1000, y: 80, caption: 'language models', dest: true },
  { id: 'share', x: 1000, y: 330, caption: 'pass it on' },
  // image segmentation: your photos, a model its makers trained
  { id: 'photos', name: 'your photos', x: 60, y: 510, caption: 'an image set', kind: 'input', to: 'segmentation', flag: 'map.photos' },
  { id: 'made-images', name: 'ready-made', x: 590, y: 510, caption: 'trained by its makers, on their photos', kind: 'made', to: 'models', flag: 'map.made' },
  { id: 'segmentation', name: 'segmentation', x: 1000, y: 510, caption: 'cut-outs, depth, outlines', kind: 'use' },
  // speech: your words or your voice, models their makers trained
  { id: 'voice-in', name: 'words, voice', x: 60, y: 600, caption: 'text, or a recording', kind: 'input', to: 'speech', flag: 'map.voice' },
  { id: 'made-speech', name: 'ready-made', x: 590, y: 600, caption: 'trained by their makers, on recordings', kind: 'made', to: 'models', flag: 'map.made' },
  { id: 'speech', x: 1000, y: 600, caption: 'sounds, and what was heard', kind: 'use' },
  // gesture: your movements, a model you train in seconds
  { id: 'movements', name: 'movements', x: 60, y: 690, caption: 'points, never video', kind: 'input', to: 'gesture', flag: 'map.movements' },
  { id: 'gesture-train', name: 'train', x: 590, y: 690, caption: 'a gesture model, in seconds', to: 'gesture', flag: 'map.gestureTrain' },
  { id: 'gesture', x: 1000, y: 690, caption: 'gesture names, sent as OSC', kind: 'use' },
]

type P = [number, number]

/**
 * From a to b: across, one 45° bend, across. When the drop is steeper than the
 * run, down first, then the bend, then across.
 */
function route(a: P, b: P): P[] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (Math.abs(dy) < 1) return [a, b]
  if (Math.abs(dx) >= Math.abs(dy)) {
    const h = (Math.abs(dx) - Math.abs(dy)) / 2
    const s = Math.sign(dx)
    return [a, [a[0] + s * h, a[1]], [b[0] - s * h, b[1]], b]
  }
  const v = Math.abs(dy) - Math.abs(dx)
  return [a, [a[0], a[1] + Math.sign(dy) * v], b]
}

interface Wire {
  from: string
  to: string
  label: string
  points: P[]
  /** where the label sits */
  at: P
  anchor?: 'start' | 'middle' | 'end'
  /** planned, not built yet: drawn dashed */
  soon?: boolean
}

const WIRES: Wire[] = [
  // the language models: the change loop
  { from: 'models', to: 'chat', label: 'use it as it is', points: [[135, 80], [135, 62], [1075, 62], [1075, 72]], at: [605, 56], anchor: 'middle' },
  { from: 'models', to: 'modelfile', label: 'a model', points: [[210, 102], [300, 102]], at: [218, 96], anchor: 'start' },
  { from: 'modelfile', to: 'chat', label: 'a variant: the model plus your words', points: [[450, 102], [994, 102]], at: [580, 96], anchor: 'start' },
  { from: 'models', to: 'train', label: 'a model to start from', points: [[210, 114], [255, 114], [255, 206], [590, 206]], at: [263, 200], anchor: 'start' },
  { from: 'words', to: 'data', label: 'rows', points: route([210, 212], [300, 256]), at: [216, 206], anchor: 'start' },
  { from: 'pictures', to: 'data', label: 'picture rows', points: route([210, 322], [300, 270]), at: [216, 316], anchor: 'start' },
  { from: 'data', to: 'train', label: 'rows to imitate', points: [[450, 250], [574, 250], [574, 222], [590, 222]], at: [456, 244], anchor: 'start' },
  { from: 'data', to: 'prefer', label: 'chosen vs rejected', points: [[450, 268], [574, 268], [574, 292], [590, 292]], at: [452, 284], anchor: 'start' },
  { from: 'train', to: 'adapters', label: 'an adapter', points: route([740, 212], [820, 286]), at: [746, 206], anchor: 'start' },
  { from: 'prefer', to: 'adapters', label: 'an adapter', points: route([740, 292], [820, 298]), at: [746, 316], anchor: 'start' },
  { from: 'merge', to: 'adapters', label: 'a blend', points: [[740, 364], [875, 364], [875, 316]], at: [807, 358], anchor: 'middle' },
  { from: 'adapters', to: 'merge', label: 'two adapters', points: [[895, 314], [895, 384], [742, 384]], at: [817, 400], anchor: 'middle' },
  { from: 'adapters', to: 'chat', label: 'export: a model of your own', points: [[970, 286], [988, 286], [988, 124], [994, 124]], at: [980, 176], anchor: 'end' },
  { from: 'adapters', to: 'share', label: 'zip', points: [[970, 298], [996, 298], [996, 352], [1000, 352]], at: [1000, 322], anchor: 'start' },
  {
    from: 'chat',
    to: 'data',
    label: 'your chat log: two answers become a pair for Prefer',
    points: [[1156, 102], [1172, 102], [1172, 450], [440, 450], [440, 286]],
    at: [728, 444],
    anchor: 'middle',
  },
  // the other kinds, one row each
  { from: 'photos', to: 'made-images', label: 'your photos', points: [[210, 532], [590, 532]], at: [216, 526], anchor: 'start' },
  { from: 'made-images', to: 'segmentation', label: 'a ready-made model, used as it is', points: [[740, 532], [994, 532]], at: [746, 526], anchor: 'start' },
  { from: 'voice-in', to: 'made-speech', label: 'your words, or your voice', points: [[210, 622], [590, 622]], at: [216, 616], anchor: 'start' },
  { from: 'made-speech', to: 'speech', label: 'one model speaks, one listens', points: [[740, 622], [994, 622]], at: [746, 616], anchor: 'start' },
  { from: 'movements', to: 'gesture-train', label: 'the camera, as points', points: [[210, 712], [590, 712]], at: [216, 706], anchor: 'start' },
  { from: 'gesture-train', to: 'gesture', label: 'your gesture model', points: [[740, 712], [994, 712]], at: [746, 706], anchor: 'start' },
]

/** What each tab runs, for the corner echo when you point at it. */
const RUNS: Record<string, string[]> = {
  models: ['ollama list', 'ollama pull qwen3:4b', 'model get smolvlm-256m'],
  modelfile: ['ollama create qwen3-4b-haiku -f workspace/modelfiles/qwen3-4b-haiku.Modelfile', 'ollama run-once qwen3:4b "How do bees make honey?"'],
  data: ['data import hf databricks/databricks-dolly-15k dolly-300 --limit 300', 'data picture classic-cv-labels images/classic-cv/utah-teapot.jpg --question … --answer …', 'data split dolly-300 --valid 0.10'],
  train: ['train dolly-300-360m --data dolly-300 --base HuggingFaceTB/SmolLM2-360M-Instruct', 'train classic-cv-labels-256m --data classic-cv-labels   (pictures: mlx-vlm on SmolVLM)'],
  prefer: ['prefer concise-prefs-dpo --data concise-prefs --beta 0.1'],
  merge: ['merge blend --a dolly-300-360m --b dolly-creative-360m --t 0.5'],
  adapters: ['export dolly-300-360m --quantize int8', '  fuse · ollama create … -q int8'],
  chat: ['ollama run-once smollm2:360m "…"', 'ollama run-once smolvlm:256m --image images/classic-cv/utah-teapot.jpg "What is this?"'],
  share: ['zip adapters/dolly-300-360m', 'unzip adapters-dolly-300-360m.zip'],
  segmentation: ['look cutout images/studio/chair.jpg', 'look depth images/studio/chair.jpg', 'look select images/studio/chair.jpg --point 320,240'],
  speech: ['speak teapot-label "Utah teapot, 1974."', 'listen audio/recorded/rec-2026-10-24.wav'],
  gesture: ['gesture new studio-hands --tracker hands', 'gesture train studio-hands', 'gesture send studio-hands --port 9000'],
  words: ['data import file uploads/my-rows.csv my-rows', 'data append my-rows \'{"messages": […]}\''],
  pictures: ['data picture my-labels images/studio/vase.jpg --question "What is this?" --answer "…"'],
  photos: ['look example classic-cv', '(or add photos on the image segmentation tab)'],
  'voice-in': ['speak label-1 "Your words, read aloud."', '(or record your voice on the speech tab)'],
  movements: ['(hold to record on the gesture tab: points only)'],
  'made-images': ['model get cutout', 'model get depth', 'model get select'],
  'made-speech': ['speak …   Soprano-1.1-80M, Apache 2.0', 'listen …  Qwen3-ASR-0.6B, Apache 2.0'],
  'gesture-train': ['model get hands', 'gesture train studio-hands'],
}

interface Props {
  /** the terminal's latest lines, for the echo; none on the website, where no app runs behind the map */
  lines?: string[]
  /** where a node leads: its tab in the app, or a section of the page on the website */
  linkTo?: (id: string) => string
  /**
   * On a web page a plain scroll must scroll the page, not move the map: then
   * only a pinch (or ⌘/ctrl + scroll) is taken by the map. In the app a plain
   * scroll pans it.
   */
  pageScroll?: boolean
  /** what the echo says while nothing is pointed at and the terminal is quiet; the website shows nothing */
  idle?: string[]
}

export default function FlowMap({ lines = [], linkTo = (id) => `#${id}`, pageScroll = false, idle = ['variable machine', 'point at a tab to see what it runs'] }: Props) {
  const [hot, setHot] = useState<string | null>(null)
  const echo = hot ? RUNS[hot].map((l) => `▸ ${l}`) : lines.length ? lines : idle

  const joined = (w: Wire) => !!hot && (w.from === hot || w.to === hot)

  // ---- the canvas: pan by dragging, zoom with pinch or ⌘/ctrl + wheel (or the buttons), fit to the space ----
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [vb, setVb] = useState({ x: 0, y: 0, w: CONTENT.w, h: CONTENT.h })
  const moved = useRef(false) // the user has panned or zoomed: a resize keeps their view instead of fitting again
  const size = useRef({ w: 1, h: 1 })

  /** The whole map, with a margin, shaped like the space it has (so 45° stays 45° and nothing is letterboxed). */
  const fit = useCallback(() => {
    const { w: cw, h: ch } = size.current
    const pad = 24
    const above = 70 // extra room over the top row, where its flags open
    const cwU = CONTENT.w + pad * 2
    const chU = CONTENT.h + pad * 2 + above
    const scale = Math.max(cwU / cw, chU / ch) // svg units per pixel
    const w = cw * scale
    const h = ch * scale
    setVb({ x: CONTENT.x - pad - (w - cwU) / 2, y: CONTENT.y - pad - above - (h - chU) / 2, w, h })
    moved.current = false
  }, [])

  useEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (!width || !height) return // hidden tab
      const prev = size.current
      size.current = { w: width, h: height }
      if (!moved.current) return fit()
      // keep the same scale and centre, reshaped to the new space
      setVb((v) => {
        const k = v.w / prev.w
        const w = width * k
        const h = height * k
        return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h }
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  /** Zoom by f around a point given in screen pixels (the pointer, or the centre). */
  const zoomAt = useCallback((f: number, px?: number, py?: number) => {
    const r = svg.current!.getBoundingClientRect()
    const fx = px === undefined ? 0.5 : (px - r.left) / r.width
    const fy = py === undefined ? 0.5 : (py - r.top) / r.height
    setVb((v) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, v.w * f))
      const k = w / v.w
      const h = v.h * k
      return { x: v.x + fx * v.w * (1 - k), y: v.y + fy * v.h * (1 - k), w, h }
    })
    moved.current = true
  }, [])

  // Wheel: a pinch (or ⌘/ctrl + wheel) zooms; a plain scroll pans. Native listener, so it can stop the page scrolling.
  useEffect(() => {
    const el = svg.current!
    const onWheel = (e: WheelEvent) => {
      if (pageScroll && !e.ctrlKey && !e.metaKey) return // let the page scroll
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) return zoomAt(Math.exp(e.deltaY * 0.01), e.clientX, e.clientY)
      const r = el.getBoundingClientRect()
      setVb((v) => ({ ...v, x: v.x + (e.deltaX * v.w) / r.width, y: v.y + (e.deltaY * v.h) / r.height }))
      moved.current = true
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, pageScroll])

  // Drag to pan, from anywhere; a drag that started on a node doesn't also open its tab.
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; far: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, far: false }
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.far && Math.hypot(dx, dy) < 4) return
    if (!d.far) {
      d.far = true
      svg.current!.setPointerCapture(e.pointerId)
    }
    const r = svg.current!.getBoundingClientRect()
    setVb((v) => ({ ...v, x: d.vx - (dx * v.w) / r.width, y: d.vy - (dy * v.h) / r.height }))
    moved.current = true
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    drag.current = null
    if (d?.far) svg.current!.releasePointerCapture(e.pointerId)
    // keep the "it was a drag" mark until the click that follows has been stopped
    if (d?.far) requestAnimationFrame(() => (wasDrag.current = false))
    wasDrag.current = !!d?.far
  }
  const wasDrag = useRef(false)

  return (
    <figure className="flow" aria-label="map of the tabs and what flows between them" ref={box}>
      <svg
        ref={svg}
        className="flow__svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label="The tabs of Variable Machine and what each passes to the next"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (wasDrag.current) {
            e.preventDefault()
            e.stopPropagation()
            wasDrag.current = false
          }
        }}
      >
        <defs>
          <marker id="flow-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0.5 L7.5 4 L0 7.5" className="flow__tip" />
          </marker>
        </defs>

        {/* the columns, left to right */}
        {COLUMNS.map(([x, label]) => (
          <text key={label} x={x} y={36} className="flow__column">
            {label}
          </text>
        ))}

        {/* the three ways: one box, one step number */}
        <rect x={580} y={170} width={170} height={250} className="flow__group" />
        <text x={580} y={162} className="flow__group-label">
          4 · three ways to change the numbers
        </text>

        {/* the other kinds, one row each, below the change loop */}
        <line x1={40} y1={478} x2={1172} y2={478} className="flow__rule" />

        {WIRES.map((w) => (
          <g key={`${w.from}-${w.to}-${w.label}`} className={`flow__wire ${w.soon ? 'is-soon' : ''} ${joined(w) ? 'is-hot' : ''} ${hot && !joined(w) ? 'is-dim' : ''}`.trim()}>
            <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#flow-end)" />
            <text x={w.at[0]} y={w.at[1]} textAnchor={w.anchor ?? 'start'} className="flow__label">
              {w.label}
            </text>
          </g>
        ))}

        {NODES.map((n) => {
          // a use and Chat have an outer outline; their wires plug into it
          const out = n.dest || n.kind === 'use' ? 6 : 0
          const box = n.kind === 'input' ? 'flow__box flow__box--input' : n.kind === 'made' ? 'flow__box flow__box--made' : 'flow__box'
          return (
            // the same flag as the tab's name in the top bar (or the node's own); it points out of the map, toward its nearest edge
            <Explained key={n.id} id={n.flag ?? (`panel.${n.id}` as ExplainId)} svg module=".flow">
              <a
                href={linkTo(n.to ?? n.id)}
                className={`flow__node ${n.kind ? `flow__node--${n.kind}` : ''} ${hot === n.id ? 'is-hot' : ''}`.trim()}
                onPointerEnter={() => setHot(n.id)}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot(n.id)}
                onBlur={() => setHot(null)}
                aria-label={`${n.name ?? n.id}: ${n.caption}`}
              >
                {out > 0 && <rect x={n.x - out} y={n.y - out} width={W + out * 2} height={H + out * 2} className="flow__dest" />}
                {n.dest ? (
                  <>
                    {/* Chat: two windows side by side, as it puts two models side by side */}
                    <rect x={n.x} y={n.y} width={W / 2 - 3} height={H} className="flow__box" />
                    <rect x={n.x + W / 2 + 3} y={n.y} width={W / 2 - 3} height={H} className="flow__box" />
                  </>
                ) : (
                  <rect x={n.x} y={n.y} width={W} height={H} className={box} />
                )}
                {/* ports: where wires plug in and out */}
                <rect x={n.x - out - 3} y={n.y + H / 2 - 3} width={6} height={6} className="flow__port" />
                <rect x={n.x + W + out - 3} y={n.y + H / 2 - 3} width={6} height={6} className="flow__port" />
                {n.n && (
                  <text x={n.x + 12} y={n.y + H / 2 + 5} className="flow__num">
                    {n.n}
                  </text>
                )}
                {n.dest ? (
                  [0, 1].map((k) => (
                    <text key={k} x={n.x + (W / 2 + 3) * k + (W / 2 - 3) / 2} y={n.y + H / 2 + 5} textAnchor="middle" className="flow__name">
                      {n.id}
                    </text>
                  ))
                ) : (
                  <text x={n.x + (n.n ? 28 : 14)} y={n.y + H / 2 + 5} className={n.kind === 'input' ? 'flow__name flow__name--input' : 'flow__name'}>
                    {n.name ?? n.id}
                  </text>
                )}
                <text x={n.x - out} y={n.y + H + out + 18} className="flow__caption">
                  {n.caption}
                </text>
              </a>
            </Explained>
          )
        })}
      </svg>
      <div className="flow__tools" role="group" aria-label="view">
        <button type="button" className="text-button" onClick={fit} aria-label="fit the whole map to the space">
          fit
        </button>
        <button type="button" className="text-button" onClick={() => zoomAt(1 / 1.25)} aria-label="zoom in">
          +
        </button>
        <button type="button" className="text-button" onClick={() => zoomAt(1.25)} aria-label="zoom out">
          −
        </button>
        <span className="label label--muted flow__hint">drag to move · pinch or ⌘ + scroll to zoom</span>
      </div>
      <pre className="flow__echo" aria-live="off">
        {echo.map((l, i) => (
          <span key={`${hot ?? 'live'}-${i}-${l}`} className="flow__echo-line" style={{ animationDelay: `${i * 0.12}s` }}>
            {l}
          </span>
        ))}
      </pre>
    </figure>
  )
}
