import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'
import { useHelperEvent } from '../hooks/useHelper'

interface Props {
  /** what is happening, in a few words: "downloading the hands tracker" */
  label: string
  /** how far it has got, and of how much, when that is known */
  done?: number
  total?: number
  /** what done and total count */
  unit?: 'bytes' | 'steps'
  /** an estimate in seconds, when nothing can be measured: shown as "about", and counted down */
  about?: number
}

const mb = (n: number) => (n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 2 ** 10))} KB`)
const secs = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`)

/**
 * A wait, shown honestly: the spiral (the favicon's hand-drawn swirl) turns
 * while it lasts, and the line says only what can be known. With bytes or
 * steps counted, it measures the speed and says how long is left; with only
 * an estimate, it says "about" and counts down, then admits when it is taking
 * longer; with neither, it says what it is waiting for and nothing more.
 */
export default function Loading({ label, done, total, unit = 'bytes', about }: Props) {
  const started = useRef(performance.now())
  const samples = useRef<{ at: number; done: number }[]>([])
  const [now, setNow] = useState(() => performance.now())

  // a clock for the "about" countdown; measured progress re-renders on its own
  useEffect(() => {
    if (about === undefined) return
    const t = setInterval(() => setNow(performance.now()), 500)
    return () => clearInterval(t)
  }, [about])

  // the speed, from the last few seconds of progress
  let rate: number | undefined
  if (done !== undefined) {
    const at = performance.now()
    const s = samples.current
    if (!s.length || s[s.length - 1].done !== done) s.push({ at, done })
    while (s.length > 2 && at - s[0].at > 4000) s.shift()
    const first = s[0]
    const last = s[s.length - 1]
    if (last.at - first.at > 400 && last.done > first.done) rate = ((last.done - first.done) / (last.at - first.at)) * 1000
  }

  const parts: string[] = []
  if (done !== undefined && total) {
    parts.push(unit === 'bytes' ? `${mb(done)} of ${mb(total)}` : `${done} of ${total}`)
    if (rate) {
      if (unit === 'bytes') parts.push(`${mb(rate)}/s`)
      parts.push(`${secs((total - done) / rate)} left`)
    }
  } else if (done !== undefined && unit === 'bytes') {
    parts.push(mb(done))
    if (rate) parts.push(`${mb(rate)}/s`)
  } else if (about !== undefined) {
    const left = about - (now - started.current) / 1000
    parts.push(left > 0 ? `about ${secs(left)}` : 'taking a little longer than usual')
  }

  return (
    <div className="loading" role="status" aria-live="polite">
      <Icon name="spiral-tight" size={2} className="loading__spiral" />
      <span className="loading__text">
        <span className="loading__label">{label}</span>
        {parts.length > 0 && <span className="label label--muted">{parts.join(' · ')}</span>}
      </span>
    </div>
  )
}

/** A `model get` download's progress, by the model's name, from the helper; null when none is running. */
export function useDownload(name: string) {
  const [p, setP] = useState<{ file: string; completed: number; total?: number } | null>(null)
  useHelperEvent(
    'download.progress',
    useCallback((e) => e.name === name && setP(e.done ? null : { file: e.file, completed: e.completed, total: e.total }), [name]),
  )
  return p
}

/** A `model get` download as it happens: bytes, speed, time left. */
export function DownloadWait({ name, label }: { name: string; label: string }) {
  const d = useDownload(name)
  return <Loading label={label} done={d?.completed} total={d?.total} />
}
