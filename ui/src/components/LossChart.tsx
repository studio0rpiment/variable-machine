import { useEffect, useMemo, useRef, useState } from 'react'

export interface LossPoint {
  iter: number
  trainLoss?: number
  valLoss?: number
  tokensPerSec?: number
}

interface Props {
  points: LossPoint[]
  /** the run's planned length, so the x axis doesn't jump as it grows */
  iters: number
  live?: boolean
}

const H = 220
const PAD = { top: 16, right: 84, bottom: 28, left: 44 }

/**
 * Loss over iterations. KP Minimal has two colours, so the two series differ
 * by stroke: train solid, validation dashed with markers, each labelled at its
 * end and in the legend. Hover shows the values at the nearest iteration; a
 * table view lists them all.
 */
export default function LossChart({ points, iters, live }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  useEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const train = points.filter((p) => p.trainLoss !== undefined)
  const val = points.filter((p) => p.valLoss !== undefined)
  const all = [...train.map((p) => p.trainLoss!), ...val.map((p) => p.valLoss!)]
  const yMax = all.length ? Math.ceil(Math.max(...all) * 4) / 4 : 3
  const yMin = all.length ? Math.max(0, Math.floor(Math.min(...all) * 4) / 4 - 0.25) : 0
  const xMax = Math.max(iters, ...points.map((p) => p.iter), 1)
  const x = (i: number) => PAD.left + (i / xMax) * (w - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom)
  const path = (ps: LossPoint[], k: 'trainLoss' | 'valLoss') => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.iter).toFixed(1)},${y(p[k]!).toFixed(1)}`).join('')

  const yTicks = useMemo(() => {
    const n = 4
    return Array.from({ length: n + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / n)
  }, [yMin, yMax])
  const xTicks = useMemo(() => {
    const step = xMax <= 100 ? 25 : xMax <= 400 ? 50 : xMax <= 1000 ? 200 : 500
    return Array.from({ length: Math.floor(xMax / step) + 1 }, (_, i) => i * step)
  }, [xMax])

  // nearest reported iteration to the pointer
  const iterAt = (px: number) => {
    const it = ((px - PAD.left) / (w - PAD.left - PAD.right)) * xMax
    const iters = [...new Set(points.map((p) => p.iter))]
    return iters.length ? iters.reduce((a, b) => (Math.abs(b - it) < Math.abs(a - it) ? b : a)) : null
  }
  const at = hover === null ? null : { iter: hover, train: train.find((p) => p.iter === hover)?.trainLoss, val: val.find((p) => p.iter === hover)?.valLoss, tps: train.find((p) => p.iter === hover)?.tokensPerSec }
  const lastT = train.at(-1)
  const lastV = val.at(-1)

  return (
    <figure className="loss">
      <figcaption className="loss__legend">
        <span className="label">loss {live && <span className="label--muted">· live</span>}</span>
        <span className="loss__key">
          <svg width="24" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="24" y2="4" className="loss__train" />
          </svg>
          <span className="label">train</span>
        </span>
        <span className="loss__key">
          <svg width="24" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="24" y2="4" className="loss__val" />
          </svg>
          <span className="label">validation</span>
        </span>
        <button type="button" className="text-button" onClick={() => setTable((t) => !t)}>
          {table ? 'chart' : 'table'}
        </button>
      </figcaption>

      <div ref={box} className="loss__plot" hidden={table}>
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`loss over ${xMax} iterations; latest train ${lastT?.trainLoss ?? '–'}, validation ${lastV?.valLoss ?? '–'}`}
          onMouseMove={(e) => setHover(iterAt(e.nativeEvent.offsetX))}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="loss__grid" />
              <text x={PAD.left - 8} y={y(t)} className="loss__tick" textAnchor="end" dominantBaseline="middle">
                {t.toFixed(2)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 8} className="loss__tick" textAnchor="middle">
              {t}
            </text>
          ))}
          {train.length > 1 && <path d={path(train, 'trainLoss')} className="loss__train" />}
          {val.length > 1 && <path d={path(val, 'valLoss')} className="loss__val" />}
          {val.map((p) => (
            <circle key={p.iter} cx={x(p.iter)} cy={y(p.valLoss!)} r={4} className="loss__dot" />
          ))}
          {lastT && (
            <text x={x(lastT.iter) + 8} y={y(lastT.trainLoss!)} className="loss__end" dominantBaseline="middle">
              train {lastT.trainLoss!.toFixed(2)}
            </text>
          )}
          {lastV && (
            <text x={x(lastV.iter) + 8} y={y(lastV.valLoss!) + (lastT && Math.abs(y(lastV.valLoss!) - y(lastT.trainLoss!)) < 14 ? 14 : 0)} className="loss__end" dominantBaseline="middle">
              val {lastV.valLoss!.toFixed(2)}
            </text>
          )}
          {at && (
            <line x1={x(at.iter)} x2={x(at.iter)} y1={PAD.top} y2={H - PAD.bottom} className="loss__cross" />
          )}
          {points.length === 0 && (
            <text x={w / 2} y={H / 2} className="loss__tick" textAnchor="middle">
              {live ? 'waiting for the first report…' : 'no loss recorded'}
            </text>
          )}
        </svg>
        {at && (
          <div className="loss__tip" style={{ left: Math.min(x(at.iter) + 12, w - 160) }}>
            <span className="label">iter {at.iter}</span>
            {at.train !== undefined && <span className="label">train {at.train.toFixed(3)}</span>}
            {at.val !== undefined && <span className="label">val {at.val.toFixed(3)}</span>}
            {at.tps !== undefined && <span className="label label--muted">{Math.round(at.tps)} tok/s</span>}
          </div>
        )}
      </div>

      {table && (
        <table className="loss__table">
          <thead>
            <tr>
              <th className="label">iter</th>
              <th className="label">train</th>
              <th className="label">validation</th>
              <th className="label">tok/s</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set(points.map((p) => p.iter))].map((it) => {
              const t = train.find((p) => p.iter === it)
              const v = val.find((p) => p.iter === it)
              return (
                <tr key={it}>
                  <td>{it}</td>
                  <td>{t?.trainLoss?.toFixed(3) ?? ''}</td>
                  <td>{v?.valLoss?.toFixed(3) ?? ''}</td>
                  <td>{t?.tokensPerSec ? Math.round(t.tokensPerSec) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </figure>
  )
}
