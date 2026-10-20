import { useCallback, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'

/**
 * The Start map: every tab as a node, wires for what flows between them, laid
 * out like node-based programming (a patch, a circuit). Nodes are links to
 * their tabs. Wires run in straight lines and 45° bends, each labelled with
 * what travels along it. Coordinates are in the SVG's own units; it scales as
 * one picture, so the angles stay 45°.
 */

const W = 150 // node width
const H = 44 // node height

interface Node {
  id: string
  n?: string
  x: number
  y: number
  caption: string
}

const NODES: Node[] = [
  { id: 'models', n: '1', x: 60, y: 140, caption: 'what you start from' },
  { id: 'modelfile', n: '2', x: 330, y: 50, caption: 'change it with words' },
  { id: 'data', n: '3', x: 60, y: 420, caption: 'examples to learn from' },
  { id: 'train', n: '4', x: 360, y: 276, caption: 'imitate' },
  { id: 'prefer', n: '4', x: 360, y: 376, caption: 'lean toward the better' },
  { id: 'merge', n: '4', x: 360, y: 476, caption: 'blend two' },
  { id: 'adapters', n: '5', x: 650, y: 330, caption: 'make them models' },
  { id: 'chat', x: 910, y: 150, caption: 'hear the difference' },
  { id: 'share', x: 910, y: 466, caption: 'pass it on' },
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
  { from: 'models', to: 'chat', label: 'talk to it as it is', points: route([210, 160], [910, 160]), at: [640, 152] },
  { from: 'models', to: 'modelfile', label: 'a model', points: route([210, 160], [330, 72]), at: [232, 104], anchor: 'start' },
  { from: 'modelfile', to: 'chat', label: 'a variant: the model plus your words', points: route([480, 72], [910, 172]), at: [560, 64], anchor: 'start' },
  { from: 'models', to: 'train', label: 'a model to start from', points: route([210, 162], [330, 250]), at: [222, 214], anchor: 'start' },
  { from: 'data', to: 'train', label: 'rows to imitate', points: route([210, 438], [360, 302]), at: [216, 398], anchor: 'start' },
  { from: 'data', to: 'prefer', label: 'chosen vs rejected', points: route([210, 446], [360, 402]), at: [216, 470], anchor: 'start' },
  { from: 'train', to: 'adapters', label: 'an adapter', points: route([510, 298], [650, 346]), at: [560, 290], anchor: 'start' },
  { from: 'prefer', to: 'adapters', label: 'an adapter', points: route([510, 398], [650, 358]), at: [560, 412], anchor: 'start' },
  { from: 'adapters', to: 'merge', label: 'two adapters', points: [[700, 374], [700, 440], [656, 484], [510, 484]], at: [604, 476], anchor: 'middle' },
  { from: 'merge', to: 'adapters', label: 'a blend', points: [[510, 504], [710, 504], [750, 464], [750, 374]], at: [604, 520], anchor: 'middle' },
  { from: 'adapters', to: 'chat', label: 'export: a model of your own', points: [[725, 330], [725, 270], [815, 184], [910, 184]], at: [733, 296], anchor: 'start' },
  { from: 'adapters', to: 'share', label: 'zip', points: [[800, 352], [840, 352], [840, 448], [880, 488], [910, 488]], at: [848, 400], anchor: 'start' },
  {
    from: 'chat',
    to: 'data',
    label: 'your chat log: two answers become a pair for Prefer',
    points: [[1060, 172], [1090, 172], [1090, 590], [160, 590], [135, 565], [135, 464]],
    at: [600, 582],
    anchor: 'middle',
  },
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
}

const strip = (t: string) => t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '')

export default function FlowMap() {
  const [hot, setHot] = useState<string | null>(null)
  // The corner echo: the terminal's latest lines, live (pointing at a tab shows what that tab runs instead).
  const [lines, setLines] = useState<string[]>([])
  useHelperEvent(
    'terminal.output',
    useCallback((e) => {
      const add = strip(e.text)
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.trim())
      if (add.length) setLines((ls) => [...ls, ...add].slice(-5))
    }, []),
  )
  const echo = hot ? RUNS[hot].map((l) => `▸ ${l}`) : lines.length ? lines : ['variable machine', 'point at a tab to see what it runs']

  const joined = (w: Wire) => !!hot && (w.from === hot || w.to === hot)
  return (
    <figure className="flow" aria-label="map of the tabs and what flows between them">
      <svg className="flow__svg" viewBox="0 0 1110 760" role="img" aria-labelledby="flow-title">
        <title id="flow-title">The tabs of Variable Machine and what each passes to the next</title>
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

        {WIRES.map((w) => (
          <g key={`${w.from}-${w.to}-${w.label}`} className={`flow__wire ${joined(w) ? 'is-hot' : ''} ${hot && !joined(w) ? 'is-dim' : ''}`.trim()}>
            <polyline points={w.points.map((p) => p.join(',')).join(' ')} markerEnd="url(#flow-end)" />
            <text x={w.at[0]} y={w.at[1]} textAnchor={w.anchor ?? 'start'} className="flow__label">
              {w.label}
            </text>
          </g>
        ))}

        {NODES.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            className={`flow__node ${hot === n.id ? 'is-hot' : ''}`.trim()}
            onPointerEnter={() => setHot(n.id)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(n.id)}
            onBlur={() => setHot(null)}
            aria-label={`${n.id}: ${n.caption}`}
          >
            <rect x={n.x} y={n.y} width={W} height={H} className="flow__box" />
            {/* ports: where wires plug in and out */}
            <rect x={n.x - 3} y={n.y + H / 2 - 3} width={6} height={6} className="flow__port" />
            <rect x={n.x + W - 3} y={n.y + H / 2 - 3} width={6} height={6} className="flow__port" />
            {n.n && (
              <text x={n.x + 12} y={n.y + H / 2 + 5} className="flow__num">
                {n.n}
              </text>
            )}
            <text x={n.x + (n.n ? 28 : 14)} y={n.y + H / 2 + 5} className="flow__name">
              {n.id}
            </text>
            <text x={n.x} y={n.y + H + 18} className="flow__caption">
              {n.caption}
            </text>
          </a>
        ))}
      </svg>
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
