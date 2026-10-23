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
const CONTENT = { x: 40, y: 30, w: 1070, h: 785 } // the bottom 70 are room for the echo
const MIN_W = 360 // closest zoom, in units across
const MAX_W = 4000 // furthest
const H = 44 // node height

interface Node {
  id: string
  n?: string
  x: number
  y: number
  caption: string
  /** where everything is used: drawn solid and doubled, with its own label */
  dest?: boolean
}

const NODES: Node[] = [
  { id: 'models', n: '1', x: 60, y: 140, caption: 'what you start from' },
  { id: 'modelfile', n: '2', x: 330, y: 50, caption: 'change it with words' },
  { id: 'data', n: '3', x: 60, y: 420, caption: 'examples to learn from' },
  { id: 'train', n: '4', x: 360, y: 276, caption: 'imitate' },
  { id: 'prefer', n: '4', x: 360, y: 376, caption: 'lean toward the better' },
  { id: 'merge', n: '4', x: 360, y: 476, caption: 'blend two' },
  { id: 'adapters', n: '5', x: 650, y: 330, caption: 'make them models' },
  { id: 'chat', x: 910, y: 150, caption: 'hear the difference', dest: true },
  { id: 'share', x: 910, y: 466, caption: 'pass it on' },
  // apart from the change loop: ready-made tools, used as they are
  { id: 'look', x: 360, y: 650, caption: 'ready-made image tools' },
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
}

const WIRES: Wire[] = [
  { from: 'models', to: 'chat', label: 'talk to it as it is', points: route([210, 160], [904, 160]), at: [640, 152] },
  { from: 'models', to: 'modelfile', label: 'a model', points: route([210, 160], [330, 72]), at: [232, 104], anchor: 'start' },
  { from: 'modelfile', to: 'chat', label: 'a variant: the model plus your words', points: route([480, 72], [904, 172]), at: [560, 64], anchor: 'start' },
  { from: 'models', to: 'train', label: 'a model to start from', points: route([210, 162], [330, 250]), at: [222, 214], anchor: 'start' },
  { from: 'data', to: 'train', label: 'rows to imitate', points: route([210, 438], [360, 302]), at: [216, 398], anchor: 'start' },
  { from: 'data', to: 'prefer', label: 'chosen vs rejected', points: route([210, 446], [360, 402]), at: [216, 470], anchor: 'start' },
  { from: 'train', to: 'adapters', label: 'an adapter', points: route([510, 298], [650, 346]), at: [560, 290], anchor: 'start' },
  { from: 'prefer', to: 'adapters', label: 'an adapter', points: route([510, 398], [650, 358]), at: [560, 412], anchor: 'start' },
  { from: 'adapters', to: 'merge', label: 'two adapters', points: [[700, 374], [700, 440], [656, 484], [510, 484]], at: [604, 476], anchor: 'middle' },
  { from: 'merge', to: 'adapters', label: 'a blend', points: [[510, 504], [710, 504], [750, 464], [750, 374]], at: [604, 520], anchor: 'middle' },
  { from: 'adapters', to: 'chat', label: 'export: a model of your own', points: [[725, 330], [725, 270], [809, 184], [904, 184]], at: [733, 296], anchor: 'start' },
  { from: 'adapters', to: 'share', label: 'zip', points: [[800, 352], [840, 352], [840, 448], [880, 488], [910, 488]], at: [848, 400], anchor: 'start' },
  {
    from: 'chat',
    to: 'data',
    label: 'your chat log: two answers become a pair for Prefer',
    points: [[1066, 172], [1090, 172], [1090, 590], [160, 590], [135, 565], [135, 464]],
    at: [600, 582],
    anchor: 'middle',
  },
  { from: 'models', to: 'look', label: 'a ready-made tool', points: [[60, 162], [44, 162], [44, 664], [360, 664]], at: [52, 656], anchor: 'start' },
  { from: 'images', to: 'look', label: 'your photos', points: [[220, 682], [360, 682]], at: [220, 700], anchor: 'start' },
  { from: 'look', to: 'outputs', label: 'a picture + its record', points: [[510, 672], [650, 672]], at: [518, 664], anchor: 'start' },
]

/** What each tab runs, for the corner echo when you point at it. */
const RUNS: Record<string, string[]> = {
  models: ['ollama list', 'ollama pull qwen3:4b', 'ollama show smollm2:360m'],
  modelfile: ['ollama create qwen3-4b-haiku -f workspace/modelfiles/qwen3-4b-haiku.Modelfile', 'ollama run-once qwen3:4b "How do bees make honey?"'],
  data: ['data import hf databricks/databricks-dolly-15k dolly-300 --limit 300', 'data template raw/urban-forestry-street-trees dc-street-trees …', 'data split dolly-300 --valid 0.10'],
  train: ['train dolly-300-360m --data dolly-300 --base HuggingFaceTB/SmolLM2-360M-Instruct'],
  prefer: ['prefer concise-prefs-dpo --data concise-prefs --beta 0.1'],
  merge: ['merge blend --a dolly-300-360m --b dolly-creative-360m --t 0.5'],
  adapters: ['export dolly-300-360m --quantize int8', '  fuse · ollama create … -q int8'],
  chat: ['ollama run-once smollm2:360m "…"', 'ollama run-once dolly-300-360m "…"'],
  share: ['zip adapters/dolly-300-360m', 'unzip adapters-dolly-300-360m.zip'],
  look: ['model get depth', 'look cutout images/studio/chair.jpg', 'look select images/studio/chair.jpg --point 320,240'],
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

        {/* the three ways: one box, one step number */}
        <rect x={330} y={240} width={210} height={300} className="flow__group" />
        <text x={330} y={232} className="flow__group-label">
          4 · three ways to change the numbers
        </text>

        {/* set apart: tools used as they are, outside the loop that changes numbers */}
        <rect x={330} y={630} width={400} height={100} className="flow__group" />
        <text x={330} y={622} className="flow__group-label">
          use it as it is · nothing changes
        </text>
        <text x={656} y={676} className="flow__label">
          outputs
        </text>

        {WIRES.map((w) => (
          <g key={`${w.from}-${w.to}-${w.label}`} className={`flow__wire ${joined(w) ? 'is-hot' : ''} ${hot && !joined(w) ? 'is-dim' : ''}`.trim()}>
            <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#flow-end)" />
            <text x={w.at[0]} y={w.at[1]} textAnchor={w.anchor ?? 'start'} className="flow__label">
              {w.label}
            </text>
          </g>
        ))}

        {NODES.map((n) => (
          // the same flag as the tab's name in the top bar; it points out of the map, toward its nearest edge, beside the node
          <Explained key={n.id} id={`panel.${n.id}` as ExplainId} svg module=".flow">
          <a
            href={linkTo(n.id)}
            className={`flow__node ${hot === n.id ? 'is-hot' : ''}`.trim()}
            onPointerEnter={() => setHot(n.id)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(n.id)}
            onBlur={() => setHot(null)}
            aria-label={`${n.id}: ${n.caption}`}
          >
            {n.dest ? (
              <>
                {/* the destination: an outer outline (dashed like the others until you point at it), and inside it
                    two windows side by side, as Chat puts two models side by side */}
                <rect x={n.x - 6} y={n.y - 6} width={W + 12} height={H + 12} className="flow__dest" />
                <text x={n.x - 6} y={n.y - 14} className="flow__dest-label">
                  use it here
                </text>
                <rect x={n.x} y={n.y} width={W / 2 - 3} height={H} className="flow__box" />
                <rect x={n.x + W / 2 + 3} y={n.y} width={W / 2 - 3} height={H} className="flow__box" />
              </>
            ) : (
              <rect x={n.x} y={n.y} width={W} height={H} className="flow__box" />
            )}
            {/* ports: where wires plug in and out */}
            {/* the destination's wires plug into its outer outline */}
            <rect x={n.x - (n.dest ? 6 : 0) - 3} y={n.y + H / 2 - 3} width={6} height={6} className="flow__port" />
            <rect x={n.x + W + (n.dest ? 6 : 0) - 3} y={n.y + H / 2 - 3} width={6} height={6} className="flow__port" />
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
              <text x={n.x + (n.n ? 28 : 14)} y={n.y + H / 2 + 5} className="flow__name">
                {n.id}
              </text>
            )}
            <text x={n.x} y={n.y + H + 18} className="flow__caption">
              {n.caption}
            </text>
          </a>
          </Explained>
        ))}
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
